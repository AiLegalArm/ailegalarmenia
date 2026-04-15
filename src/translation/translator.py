from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _is_blank(text: str | None) -> bool:
    return text is None or text.strip() == ""


@dataclass
class TranslationStats:
    attempted: int = 0
    translated: int = 0
    skipped_blank: int = 0
    cache_hits: int = 0
    failures: int = 0
    retries: int = 0
    chunked_inputs: int = 0


class Translator(Protocol):
    backend_name: str

    def translate(
        self,
        text: str,
        *,
        source_lang: str,
        target_lang: str,
        purpose: str | None = None,
    ) -> str:
        """Translate one piece of human-readable legal text (non-destructive, faithful)."""


class TranslationCache:
    """
    Very small, robust cache:
    - keyed by (backend_name, model, source_lang, target_lang, prompt_fingerprint, text_hash)
    - stored in SQLite for large/long runs
    """

    def __init__(self, *, cache_path: Path) -> None:
        self.cache_path = Path(cache_path)
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.cache_path)) as con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS translation_cache (
                  k TEXT PRIMARY KEY,
                  created_ts REAL NOT NULL,
                  translated_text TEXT NOT NULL
                )
                """
            )
            con.execute("PRAGMA journal_mode=WAL;")
            con.execute("PRAGMA synchronous=NORMAL;")

    def get(self, key: str) -> str | None:
        with sqlite3.connect(str(self.cache_path)) as con:
            row = con.execute(
                "SELECT translated_text FROM translation_cache WHERE k = ?",
                (key,),
            ).fetchone()
            return row[0] if row else None

    def set(self, key: str, translated_text: str) -> None:
        with sqlite3.connect(str(self.cache_path)) as con:
            con.execute(
                "INSERT OR REPLACE INTO translation_cache (k, created_ts, translated_text) VALUES (?, ?, ?)",
                (key, time.time(), translated_text),
            )
            con.commit()


LEGAL_TRANSLATION_SYSTEM_PROMPT_TEMPLATE = (
    "Translate the following legal text from {source_lang} to formal Eastern Armenian.\n"
    "Requirements:\n"
    "- preserve legal meaning exactly,\n"
    "- do not summarize,\n"
    "- do not omit any sentence,\n"
    "- preserve paragraph numbers, article numbers, case citations, dates, and formatting,\n"
    "- DO NOT translate or transliterate personal names (judges, applicants, representatives); keep them EXACTLY as written,\n"
    "- keep official titles/identifiers exactly as written when they are part of a citation/reference,\n"
    "- output Armenian only,\n"
    "- return only the translated text."
)


def _make_ollama_prompt(*, text: str, source_lang: str) -> str:
    system = LEGAL_TRANSLATION_SYSTEM_PROMPT_TEMPLATE.format(source_lang=source_lang)
    return f"{system}\n\nTEXT:\n{text}"


def _split_for_translation(text: str, *, max_chars: int) -> list[str]:
    """
    Conservative chunking:
    - only if needed
    - split on blank lines first, then fall back to single newlines
    - preserves ordering and separators as much as possible by re-joining with '\n\n'
    """
    if len(text) <= max_chars:
        return [text]

    # Try paragraph split first
    paras = text.split("\n\n")
    chunks: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for p in paras:
        add = (2 if cur else 0) + len(p)
        if cur and cur_len + add > max_chars:
            chunks.append("\n\n".join(cur))
            cur = [p]
            cur_len = len(p)
        else:
            cur.append(p)
            cur_len += add
    if cur:
        chunks.append("\n\n".join(cur))

    # If a single paragraph is still too long, split it by single newlines.
    final_chunks: list[str] = []
    for c in chunks:
        if len(c) <= max_chars:
            final_chunks.append(c)
            continue
        lines = c.split("\n")
        cur2: list[str] = []
        cur2_len = 0
        for ln in lines:
            add2 = (1 if cur2 else 0) + len(ln)
            if cur2 and cur2_len + add2 > max_chars:
                final_chunks.append("\n".join(cur2))
                cur2 = [ln]
                cur2_len = len(ln)
            else:
                cur2.append(ln)
                cur2_len += add2
        if cur2:
            final_chunks.append("\n".join(cur2))
    return final_chunks


@dataclass
class NoopTranslator:
    cache: TranslationCache
    stats: TranslationStats = field(default_factory=TranslationStats)
    backend_name: str = "noop"
    model: str | None = None

    def translate(
        self,
        text: str,
        *,
        source_lang: str,
        target_lang: str,
        purpose: str | None = None,
    ) -> str:
        self.stats.attempted += 1
        if _is_blank(text):
            self.stats.skipped_blank += 1
            return "" if text is not None else ""  # type: ignore[return-value]
        # Explicitly no translation.
        self.stats.translated += 1
        return text


@dataclass
class OllamaTranslator:
    base_url: str
    model: str
    cache: TranslationCache
    stats: TranslationStats = field(default_factory=TranslationStats)
    backend_name: str = "ollama"
    timeout_s: float = 120.0
    max_input_chars: int = 7000
    seed: int = 42
    temperature: float = 0.0
    num_predict: int = 2048
    max_retries: int = 3

    def _cache_key(
        self,
        *,
        prompt: str,
        text: str,
        source_lang: str,
        target_lang: str,
    ) -> str:
        prompt_fp = _sha256_hex(prompt)[:16]
        text_h = _sha256_hex(text)
        return f"{self.backend_name}|{self.model}|{source_lang}->{target_lang}|{prompt_fp}|{text_h}"

    def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:  # noqa: S310
            raw = resp.read().decode("utf-8")
        obj = json.loads(raw)
        if not isinstance(obj, dict):
            raise RuntimeError(f"Ollama response was not an object: {type(obj)}")
        return obj

    def _translate_once(self, text: str, *, source_lang: str, target_lang: str, purpose: str | None) -> str:
        prompt = _make_ollama_prompt(text=text, source_lang=source_lang)
        key = self._cache_key(prompt=prompt, text=text, source_lang=source_lang, target_lang=target_lang)
        cached = self.cache.get(key)
        if cached is not None:
            self.stats.cache_hits += 1
            return cached

        url = f"{self.base_url.rstrip('/')}/api/generate"
        payload: dict[str, Any] = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "seed": self.seed,
                "temperature": self.temperature,
                "num_predict": self.num_predict,
                # Keep defaults for top_p etc to reduce unknown variability across models.
            },
        }
        if purpose:
            payload["system"] = purpose  # harmless hint for some models; ignored by others

        last_err: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                obj = self._post_json(url, payload)
                translated = obj.get("response")
                if not isinstance(translated, str):
                    raise RuntimeError(f"Unexpected Ollama response shape: keys={list(obj.keys())[:20]}")
                translated = translated.strip()
                self.cache.set(key, translated)
                return translated
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as e:
                last_err = e
                self.stats.retries += 1 if attempt < self.max_retries else 0
                if attempt >= self.max_retries:
                    break
                time.sleep(0.6 * attempt)

        raise RuntimeError(f"Ollama translation failed after {self.max_retries} attempts: {last_err}") from last_err

    def translate(
        self,
        text: str,
        *,
        source_lang: str,
        target_lang: str,
        purpose: str | None = None,
    ) -> str:
        self.stats.attempted += 1
        if _is_blank(text):
            self.stats.skipped_blank += 1
            return ""

        chunks = _split_for_translation(text, max_chars=self.max_input_chars)
        if len(chunks) > 1:
            self.stats.chunked_inputs += 1

        translated_chunks: list[str] = []
        try:
            for c in chunks:
                translated_chunks.append(
                    self._translate_once(c, source_lang=source_lang, target_lang=target_lang, purpose=purpose)
                )
        except Exception as e:  # noqa: BLE001
            self.stats.failures += 1
            raise

        self.stats.translated += 1
        # Re-join with double newlines (matches primary chunking strategy).
        return "\n\n".join(translated_chunks) if len(translated_chunks) > 1 else translated_chunks[0]
