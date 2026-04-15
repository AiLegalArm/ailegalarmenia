from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from src.load.echr_to_legal_practice import EchrLegalPracticeLoader, get_stable_id  # noqa: E402
from src.load.supabase_rest import SupabaseRestClient  # noqa: E402
from src.transform.case_enricher import CaseEnricher  # noqa: E402
from src.transform.hy_out_shape import build_hy_out_record  # noqa: E402
from src.translation.translator import (  # noqa: E402
    NoopTranslator,
    OllamaTranslator,
    TranslationCache,
    TranslationStats,
)
from src.validation.case_schema import EnrichmentStripper, validate_jsonl_file  # noqa: E402


SOURCE_DEFAULT = Path(
    r"C:\Users\Admin\Desktop\Hayk\AILEGALARMENIA\Кодексы,законы\armenian_law\Арлис\ЕСПЧ"
)

CASE_INSERT_SCHEMA: dict[str, Any] = {
    "table": "legal_practice_kb",
    "required": ["title", "content_text", "court_type", "practice_category", "outcome"],
    "nullable": {
        "description",
        "court_name",
        "case_number_anonymized",
        "decision_date",
        "applied_articles",
        "key_violations",
        "legal_reasoning_summary",
        "source_name",
        "source_url",
        "content_hash",
        "facts_hy",
        "judgment_hy",
        "summary_hy",
        "text_hy",
        "translation_status",
        "translation_provider",
        "translation_ts",
        "translation_errors",
        "echr_case_id",
        "import_ref",
        "decision_map",
        "echr_article",
    },
    "direct_insert_blocked": {
        "id",
        "created_at",
        "updated_at",
        "embedding",
        "embedding_legacy_768",
        "embedding_attempts",
        "embedding_last_attempt",
        "embedding_error",
        "embedding_status",
        "tsv",
        "content_chunks",
        "chunk_index_meta",
        "key_paragraphs",
    },
    "enums": {
        "court_type": ["first_instance", "appeal", "cassation", "constitutional", "echr"],
        "practice_category": ["criminal", "civil", "administrative", "echr"],
        "outcome": ["granted", "rejected", "partial", "remanded", "discontinued"],
        "visibility": ["ai_only", "admin_only", "internal"],
    },
}

CHUNK_INSERT_SCHEMA: dict[str, Any] = {
    "table": "legal_practice_kb_chunks",
    "required": ["doc_id", "chunk_index", "chunk_text"],
    "nullable": {"chunk_hash", "title", "source_anchor", "rechunk_version", "overlap_prev"},
    "direct_insert_blocked": {"id", "created_at"},
}

SECTION_NAME_GLOSSARY = {
    "procedure": "Վարույթ",
    "introduction": "Ներածություն",
    "facts": "Փաստեր",
    "law": "Իրավունք",
    "relevant_law": "Վերաբերելի ներպետական իրավունք",
    "conclusion": "Եզրակացություն",
    "submission": "Դիրքորոշումներ",
    "appendix": "Հավելված",
    "opinion": "Կարծիք",
    "schedule": "Ժամանակացույց",
    "toc": "Բովանդակություն",
    "abbreviations": "Հապավումներ",
}

COUNTRY_GLOSSARY = {
    "Armenia": "Հայաստան",
    "Austria": "Ավստրիա",
    "Azerbaijan": "Ադրբեջան",
    "Belgium": "Բելգիա",
    "Bosnia and Herzegovina": "Բոսնիա և Հերցեգովինա",
    "Bulgaria": "Բուլղարիա",
    "Croatia": "Խորվաթիա",
    "Cyprus": "Կիպրոս",
    "Czechia": "Չեխիա",
    "Denmark": "Դանիա",
    "Estonia": "Էստոնիա",
    "Finland": "Ֆինլանդիա",
    "France": "Ֆրանսիա",
    "Georgia": "Վրաստան",
    "Germany": "Գերմանիա",
    "Greece": "Հունաստան",
    "Hungary": "Հունգարիա",
    "Iceland": "Իսլանդիա",
    "Ireland": "Իռլանդիա",
    "Italy": "Իտալիա",
    "Latvia": "Լատվիա",
    "Liechtenstein": "Լիխտենշտեյն",
    "Lithuania": "Լիտվա",
    "Luxembourg": "Լյուքսեմբուրգ",
    "Malta": "Մալթա",
    "Moldova, Republic of": "Մոլդովայի Հանրապետություն",
    "Montenegro": "Չեռնոգորիա",
    "Netherlands": "Նիդեռլանդներ",
    "North Macedonia": "Հյուսիսային Մակեդոնիա",
    "Norway": "Նորվեգիա",
    "Poland": "Լեհաստան",
    "Portugal": "Պորտուգալիա",
    "Romania": "Ռումինիա",
    "Russian Federation": "Ռուսաստանի Դաշնություն",
    "San Marino": "Սան Մարինո",
    "Serbia": "Սերբիա",
    "Slovakia": "Սլովակիա",
    "Slovenia": "Սլովենիա",
    "Spain": "Իսպանիա",
    "Sweden": "Շվեդիա",
    "Switzerland": "Շվեյցարիա",
    "Turkey": "Թուրքիա",
    "Ukraine": "Ուկրաինա",
    "United Kingdom": "Միացյալ Թագավորություն",
    "Albania": "Ալբանիա",
    "Andorra": "Անդորրա",
}

ARTICLE_REF_RE = re.compile(r"(?:Article\s+\d+[A-Za-z-]*|Protocol\s+No\.\s*\d+|§\s*\d+|\d+/%?\d*)", re.I)
DATE_RE = re.compile(r"\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b")
PERCENT_RE = re.compile(r"\b\d+(?:[.,]\d+)?%")
MONEY_RE = re.compile(r"\b\d[\d\s.,]*(?:EUR|AMD|USD|GBP|€|£|\$)\b")
NUMBER_RE = re.compile(r"\b\d+[\d./-]*\b")


@dataclass
class ShardInfo:
    path: str
    order: int
    records: int
    parse_errors: list[dict[str, Any]] = field(default_factory=list)
    duplicate_ids_within_shard: int = 0


@dataclass
class TranslationIssue:
    record_id: str
    field_path: str
    issue_type: str
    source_excerpt: str
    translated_excerpt: str
    repaired: bool = False


@dataclass
class ChunkIssue:
    record_id: str
    chunk_id: str
    issue_type: str
    details: str


class OllamaReviewer:
    def __init__(self, *, base_url: str, model: str, timeout_s: float = 180.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s

    def review_and_repair(self, *, source_text: str, translated_text: str, field_path: str) -> str:
        import urllib.request

        prompt = (
            "You are a senior legal Armenian reviewer. Repair the Armenian translation if needed.\n"
            "Rules:\n"
            "- preserve legal meaning exactly\n"
            "- preserve numbers, dates, article references, citations, names\n"
            "- output Armenian only\n"
            f"- field path: {field_path}\n\n"
            f"SOURCE:\n{source_text}\n\nCURRENT ARMENIAN:\n{translated_text}"
        )
        payload = json.dumps(
            {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {"seed": 42, "temperature": 0},
            },
            ensure_ascii=False,
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:  # noqa: S310
            obj = json.loads(resp.read().decode("utf-8"))
        out = obj.get("response")
        if not isinstance(out, str) or not out.strip():
            raise RuntimeError(f"Reviewer returned invalid payload for {field_path}")
        return out.strip()


def iter_json_records(path: Path) -> Iterator[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            raw = line.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON at {path}:{line_no}: {e}") from e
            if not isinstance(obj, dict):
                raise ValueError(f"Expected object at {path}:{line_no}")
            yield obj


def discover_shards(source_dir: Path) -> tuple[list[Path], Path | None]:
    shards = sorted(
        source_dir.glob("out_part*.jsonl"),
        key=lambda p: int(re.search(r"(\d+)", p.stem).group(1)) if re.search(r"(\d+)", p.stem) else 10**9,
    )
    reference = source_dir / "out.jsonl"
    return shards, reference if reference.exists() else None


def count_and_validate_shard(path: Path) -> ShardInfo:
    seen: set[str] = set()
    duplicates = 0
    errors: list[dict[str, Any]] = []
    count = 0
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            raw = line.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
                if not isinstance(obj, dict):
                    raise ValueError("Expected JSON object")
                count += 1
                sid = get_stable_id(obj)
                if sid:
                    if sid in seen:
                        duplicates += 1
                    else:
                        seen.add(sid)
            except Exception as e:  # noqa: BLE001
                errors.append({"line": line_no, "error": str(e)})
    m = re.search(r"(\d+)", path.stem)
    order = int(m.group(1)) if m else 0
    return ShardInfo(path=str(path), order=order, records=count, parse_errors=errors, duplicate_ids_within_shard=duplicates)


def validate_shards(shards: list[Path], reference_path: Path | None) -> dict[str, Any]:
    shard_infos = [asdict(count_and_validate_shard(p)) for p in shards]
    combined_ids: list[str] = []
    per_shard_counts: dict[str, int] = {}
    for p in shards:
        cnt = 0
        for obj in iter_json_records(p):
            cnt += 1
            sid = get_stable_id(obj)
            if sid:
                combined_ids.append(sid)
        per_shard_counts[p.name] = cnt
    dup_counts = sum(v - 1 for v in Counter(combined_ids).values() if v > 1)
    result: dict[str, Any] = {
        "shards": shard_infos,
        "per_shard_counts": per_shard_counts,
        "combined_records": sum(per_shard_counts.values()),
        "duplicates_across_shards": dup_counts,
        "reference_out_jsonl": str(reference_path) if reference_path else None,
        "reference_match": None,
    }
    if reference_path:
        ref_ids = [sid for obj in iter_json_records(reference_path) if (sid := get_stable_id(obj))]
        ref_set = set(ref_ids)
        comb_set = set(combined_ids)
        result["reference_match"] = {
            "reference_records": len(ref_ids),
            "only_in_reference": len(ref_set - comb_set),
            "only_in_shards": len(comb_set - ref_set),
            "sets_equal": ref_set == comb_set,
        }
    return result


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def has_armenian(text: str) -> bool:
    return any("\u0531" <= ch <= "\u0587" for ch in text)


def compare_regex_values(src: str, dst: str, pattern: re.Pattern[str]) -> bool:
    return pattern.findall(src) == pattern.findall(dst)


def summarize_excerpt(text: str, limit: int = 160) -> str:
    t = normalize_whitespace(text)
    return t[:limit]


def iter_translation_pairs(
    original: dict[str, Any],
    enriched: dict[str, Any],
) -> Iterator[tuple[str, str, str, Callable[[str], None]]]:
    def mk_setter(container: dict[str, Any], key: str) -> Callable[[str], None]:
        return lambda value: container.__setitem__(key, value)

    for src_key, dst_key in [("docname", "docname_hy"), ("__conclusion", "__conclusion_hy"), ("_decision_body", "_decision_body_hy")]:
        src = original.get(src_key)
        dst = enriched.get(dst_key)
        if isinstance(src, str) and isinstance(dst, str):
            yield src_key, src, dst, mk_setter(enriched, dst_key)

    c1 = original.get("country")
    c2 = enriched.get("country")
    if isinstance(c1, dict) and isinstance(c2, dict):
        src = c1.get("name")
        dst = c2.get("name_hy")
        if isinstance(src, str) and isinstance(dst, str):
            yield "country.name", src, dst, mk_setter(c2, "name_hy")

    o_conc = original.get("conclusion")
    e_conc = enriched.get("conclusion")
    if isinstance(o_conc, list) and isinstance(e_conc, list):
        for idx, item in enumerate(o_conc):
            if idx >= len(e_conc) or not isinstance(item, dict) or not isinstance(e_conc[idx], dict):
                continue
            src = item.get("element")
            dst = e_conc[idx].get("element_hy")
            if isinstance(src, str) and isinstance(dst, str):
                yield f"conclusion[{idx}].element", src, dst, mk_setter(e_conc[idx], "element_hy")
            src_details = item.get("details")
            dst_details = e_conc[idx].get("details_hy")
            if isinstance(src_details, list) and isinstance(dst_details, list):
                for j, s in enumerate(src_details):
                    if j >= len(dst_details):
                        continue
                    d = dst_details[j]
                    if isinstance(s, str) and isinstance(d, str):
                        def _setter(value: str, *, arr=dst_details, pos=j) -> None:
                            arr[pos] = value

                        yield f"conclusion[{idx}].details[{j}]", s, d, _setter

    o_content = original.get("content")
    e_content = enriched.get("content")
    if isinstance(o_content, dict) and isinstance(e_content, dict):
        for file_key, nodes in o_content.items():
            e_nodes = e_content.get(file_key)
            if not isinstance(nodes, list) or not isinstance(e_nodes, list):
                continue

            stack: list[tuple[str, Any, Any]] = []
            for i, node in enumerate(nodes):
                if i < len(e_nodes):
                    stack.append((f"content[{file_key}][{i}]", node, e_nodes[i]))
            while stack:
                path, src_node, dst_node = stack.pop()
                if not isinstance(src_node, dict) or not isinstance(dst_node, dict):
                    continue
                src = src_node.get("content")
                dst = dst_node.get("content_hy")
                if isinstance(src, str) and isinstance(dst, str):
                    yield f"{path}.content", src, dst, mk_setter(dst_node, "content_hy")
                src_sec = src_node.get("section_name")
                dst_sec = dst_node.get("section_name_hy")
                if isinstance(src_sec, str) and isinstance(dst_sec, str):
                    yield f"{path}.section_name", src_sec, dst_sec, mk_setter(dst_node, "section_name_hy")
                src_els = src_node.get("elements")
                dst_els = dst_node.get("elements")
                if isinstance(src_els, list) and isinstance(dst_els, list):
                    for i, child in enumerate(src_els):
                        if i < len(dst_els):
                            stack.append((f"{path}.elements[{i}]", child, dst_els[i]))


def run_translation_qa(
    *,
    original: dict[str, Any],
    enriched: dict[str, Any],
    reviewer: OllamaReviewer | None,
    record_id: str,
    max_pairs: int = 0,
) -> list[TranslationIssue]:
    issues: list[TranslationIssue] = []
    checked_pairs = 0
    for field_path, src, dst, setter in iter_translation_pairs(original, enriched):
        checked_pairs += 1
        if max_pairs > 0 and checked_pairs > max_pairs:
            break
        src = src or ""
        dst = dst or ""
        issue_types: list[str] = []
        if src.strip() and not dst.strip():
            issue_types.append("missing_translation")
        if src.strip() and dst.strip() and not has_armenian(dst):
            if field_path == "country.name" and src in COUNTRY_GLOSSARY and dst == COUNTRY_GLOSSARY[src]:
                pass
            elif field_path.endswith("section_name") and normalize_whitespace(dst) == normalize_whitespace(SECTION_NAME_GLOSSARY.get(src.strip().lower(), "")):
                pass
            else:
                issue_types.append("not_armenian")
        if src and dst and not compare_regex_values(src, dst, NUMBER_RE):
            issue_types.append("numbers_changed")
        if src and dst and not compare_regex_values(src, dst, DATE_RE):
            issue_types.append("dates_changed")
        if src and dst and not compare_regex_values(src, dst, ARTICLE_REF_RE):
            issue_types.append("article_refs_changed")
        if src and dst and not compare_regex_values(src, dst, PERCENT_RE):
            issue_types.append("percentages_changed")
        if src and dst and not compare_regex_values(src, dst, MONEY_RE):
            issue_types.append("amounts_changed")

        if issue_types and reviewer is not None:
            try:
                repaired = reviewer.review_and_repair(source_text=src, translated_text=dst, field_path=field_path)
                setter(repaired)
                dst = repaired
                repaired_issues = []
                if src.strip() and not dst.strip():
                    repaired_issues.append("missing_translation")
                if src.strip() and dst.strip() and not has_armenian(dst):
                    repaired_issues.append("not_armenian")
                if src and dst and not compare_regex_values(src, dst, NUMBER_RE):
                    repaired_issues.append("numbers_changed")
                if src and dst and not compare_regex_values(src, dst, DATE_RE):
                    repaired_issues.append("dates_changed")
                if src and dst and not compare_regex_values(src, dst, ARTICLE_REF_RE):
                    repaired_issues.append("article_refs_changed")
                issue_types = repaired_issues
                if not issue_types:
                    issues.append(
                        TranslationIssue(
                            record_id=record_id,
                            field_path=field_path,
                            issue_type="repaired",
                            source_excerpt=summarize_excerpt(src),
                            translated_excerpt=summarize_excerpt(dst),
                            repaired=True,
                        )
                    )
                    continue
            except Exception as e:  # noqa: BLE001
                issue_types.append(f"repair_failed:{e}")

        for issue_type in issue_types:
            issues.append(
                TranslationIssue(
                    record_id=record_id,
                    field_path=field_path,
                    issue_type=issue_type,
                    source_excerpt=summarize_excerpt(src),
                    translated_excerpt=summarize_excerpt(dst),
                    repaired=False,
                )
            )
    return issues


def walk_content_nodes(record: dict[str, Any]) -> Iterator[tuple[str, int, dict[str, Any]]]:
    content = record.get("content")
    if not isinstance(content, dict):
        return
    for file_key, nodes in content.items():
        if not isinstance(nodes, list):
            continue
        for idx, node in enumerate(nodes):
            if isinstance(node, dict):
                yield from _walk_node(file_key, idx, node)


def _walk_node(file_key: str, idx: int, node: dict[str, Any], depth: int = 0) -> Iterator[tuple[str, int, dict[str, Any]]]:
    yield file_key, depth, node
    els = node.get("elements")
    if isinstance(els, list):
        for child_idx, child in enumerate(els):
            if isinstance(child, dict):
                yield from _walk_node(file_key, child_idx, child, depth + 1)


def extract_paragraph_units(record: dict[str, Any], *, use_hy: bool = False) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    content_key = "content_hy" if use_hy else "content"
    section_key = "section_name_hy" if use_hy else "section_name"
    stable_id = get_stable_id(record) or "unknown"
    seq = 0
    for file_key, depth, node in walk_content_nodes(record):
        text = node.get(content_key)
        if use_hy and (not isinstance(text, str) or not text.strip()):
            text = node.get("content")
        if not isinstance(text, str) or not text.strip():
            continue
        section_name = node.get(section_key) or node.get("section_name") or "unknown"
        paragraph_no_match = re.match(r"^\s*(\d+[A-Za-z]?)[.)]?\s", text)
        para_no = paragraph_no_match.group(1) if paragraph_no_match else None
        units.append(
            {
                "record_id": stable_id,
                "sequence": seq,
                "file_key": file_key,
                "depth": depth,
                "section_name": section_name,
                "text": text,
                "paragraph_no": para_no,
            }
        )
        seq += 1
    return units


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text) / 4)) if text else 0


def build_semantic_chunks_for_record(
    record: dict[str, Any],
    *,
    use_hy: bool,
    target_chars: int = 5200,
    min_chars: int = 1500,
    max_chars: int = 7600,
) -> list[dict[str, Any]]:
    units = extract_paragraph_units(record, use_hy=use_hy)
    if not units:
        return []
    record_id = get_stable_id(record) or "unknown"
    chunks: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []

    def flush() -> None:
        nonlocal current
        if not current:
            return
        text = "\n\n".join(u["text"] for u in current)
        chunk_order = len(chunks)
        section_name = current[0]["section_name"]
        paragraph_nos = [u["paragraph_no"] for u in current if u["paragraph_no"]]
        chunk = {
            "chunk_id": f"{record_id}::{'hy' if use_hy else 'orig'}::{chunk_order:04d}",
            "parent_record_id": record_id,
            "source_document_id": record_id,
            "source_file": current[0]["file_key"],
            "section_name": section_name if not use_hy else None,
            "section_name_hy": section_name if use_hy else None,
            "subsection_title": None,
            "paragraph_start": paragraph_nos[0] if paragraph_nos else None,
            "paragraph_end": paragraph_nos[-1] if paragraph_nos else None,
            "paragraph_numbers": paragraph_nos,
            "text_original": None if use_hy else text,
            "text_hy": text if use_hy else None,
            "char_count_original": 0 if use_hy else len(text),
            "char_count_hy": len(text) if use_hy else 0,
            "token_estimate_original": 0 if use_hy else estimate_tokens(text),
            "token_estimate_hy": estimate_tokens(text) if use_hy else 0,
            "chunk_order": chunk_order,
            "total_chunks_for_record": 0,
            "chunking_strategy": "structure_semantic_legal",
            "source_span_reference": {
                "unit_sequence_start": current[0]["sequence"],
                "unit_sequence_end": current[-1]["sequence"],
            },
            "article_refs": sorted(set(ARTICLE_REF_RE.findall(text))),
            "legal_topic_tags": sorted({str(section_name).lower()}),
        }
        chunks.append(chunk)
        current = []

    prev_section = None
    current_chars = 0
    for unit in units:
        unit_chars = len(unit["text"])
        new_section = prev_section is not None and unit["section_name"] != prev_section
        would_overflow = current and current_chars + unit_chars > max_chars
        strong_split = new_section or (current and current_chars >= min_chars and current_chars + unit_chars > target_chars)
        if would_overflow or strong_split:
            flush()
            if chunks:
                last = chunks[-1]
                if len(unit["text"]) < 350 and units and unit["sequence"] > 0:
                    pass
        current.append(unit)
        current_chars += unit_chars + (2 if current_chars else 0)
        prev_section = unit["section_name"]
    flush()
    total = len(chunks)
    for chunk in chunks:
        chunk["total_chunks_for_record"] = total
    return chunks


def validate_chunk_set(record_id: str, chunks: list[dict[str, Any]]) -> list[ChunkIssue]:
    issues: list[ChunkIssue] = []
    prev_order = -1
    seen_ids: set[str] = set()
    for ch in chunks:
        cid = str(ch["chunk_id"])
        if cid in seen_ids:
            issues.append(ChunkIssue(record_id=record_id, chunk_id=cid, issue_type="duplicate_chunk_id", details="duplicate chunk_id"))
        seen_ids.add(cid)
        order = int(ch["chunk_order"])
        if order != prev_order + 1:
            issues.append(
                ChunkIssue(
                    record_id=record_id,
                    chunk_id=cid,
                    issue_type="chunk_order_gap",
                    details=f"expected {prev_order + 1}, got {order}",
                )
            )
        prev_order = order
        text = ch.get("text_original") or ch.get("text_hy") or ""
        if isinstance(text, str):
            stripped = text.strip()
            if stripped and not re.search(r"[.!?։]$", stripped) and len(stripped) > 300:
                issues.append(
                    ChunkIssue(
                        record_id=record_id,
                        chunk_id=cid,
                        issue_type="chunk_ends_mid_thought",
                        details="chunk does not appear to end on terminal punctuation",
                    )
                )
            if len(stripped) < 80:
                issues.append(
                    ChunkIssue(
                        record_id=record_id,
                        chunk_id=cid,
                        issue_type="low_information_chunk",
                        details=f"chunk too short: {len(stripped)} chars",
                    )
                )
    return issues


def validate_case_row_schema(row: dict[str, Any]) -> dict[str, Any]:
    missing = [k for k in CASE_INSERT_SCHEMA["required"] if row.get(k) in (None, "")]
    unexpected = sorted(k for k in row if k in CASE_INSERT_SCHEMA["direct_insert_blocked"])
    enum_errors = {}
    for key, allowed in CASE_INSERT_SCHEMA["enums"].items():
        val = row.get(key)
        if val is not None and val not in allowed:
            enum_errors[key] = {"value": val, "allowed": allowed}
    return {
        "table": CASE_INSERT_SCHEMA["table"],
        "missing_required": missing,
        "unexpected_direct_insert_fields": unexpected,
        "enum_errors": enum_errors,
        "ok": not missing and not unexpected and not enum_errors,
    }


def validate_chunk_row_schema(row: dict[str, Any]) -> dict[str, Any]:
    missing = [k for k in CHUNK_INSERT_SCHEMA["required"] if row.get(k) in (None, "")]
    unexpected = sorted(k for k in row if k in CHUNK_INSERT_SCHEMA["direct_insert_blocked"])
    return {
        "table": CHUNK_INSERT_SCHEMA["table"],
        "missing_required": missing,
        "unexpected_direct_insert_fields": unexpected,
        "ok": not missing and not unexpected,
    }


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def touch_jsonl(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text("", encoding="utf-8")


def trim_record_for_sample(
    record: dict[str, Any],
    *,
    max_content_roots: int = 1,
    max_content_nodes_per_root: int = 8,
    max_conclusion_items: int = 1,
    max_decision_body_items: int = 3,
) -> dict[str, Any]:
    """Create a reduced record for fast sample translation runs."""
    import copy

    out = copy.deepcopy(record)
    conclusion = out.get("conclusion")
    if isinstance(conclusion, list):
        out["conclusion"] = conclusion[: max(0, max_conclusion_items)]

    decision_body = out.get("decision_body")
    if isinstance(decision_body, list):
        out["decision_body"] = decision_body[: max(0, max_decision_body_items)]

    content = out.get("content")
    if isinstance(content, dict):
        trimmed_content: dict[str, Any] = {}
        for idx, (file_key, nodes) in enumerate(content.items()):
            if idx >= max(0, max_content_roots):
                break
            if not isinstance(nodes, list):
                continue
            kept: list[dict[str, Any]] = []
            budget = max(0, max_content_nodes_per_root)
            for node in nodes:
                if budget <= 0:
                    break
                if not isinstance(node, dict):
                    continue
                pruned = copy.deepcopy(node)
                queue = [pruned]
                # keep breadth-first until budget exhausted; drop deeper tails
                while queue and budget > 0:
                    cur = queue.pop(0)
                    budget -= 1
                    els = cur.get("elements")
                    if isinstance(els, list):
                        kept_children: list[dict[str, Any]] = []
                        for child in els:
                            if budget <= 0:
                                break
                            if isinstance(child, dict):
                                child_copy = copy.deepcopy(child)
                                kept_children.append(child_copy)
                                queue.append(child_copy)
                        cur["elements"] = kept_children
                kept.append(pruned)
            trimmed_content[file_key] = kept
        out["content"] = trimmed_content
    return out


def load_env_file(repo_root: Path) -> dict[str, str]:
    env_path = repo_root / ".env"
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        values[k.strip()] = v.strip().strip('"')
    return values


def try_live_openapi_schema(repo_root: Path) -> dict[str, Any]:
    env = load_env_file(repo_root)
    base_url = env.get("VITE_SUPABASE_URL") or env.get("SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_key:
        return {"available": False, "reason": "missing_supabase_credentials"}
    try:
        client = SupabaseRestClient(base_url=base_url, service_role_key=service_key, timeout_s=10.0, max_retries=1)
        spec = client.get_openapi_spec()
        defs = spec.get("definitions", {}) if isinstance(spec, dict) else {}
        return {
            "available": True,
            "tables": {
                name: sorted(list((defs.get(name, {}) or {}).get("properties", {}).keys()))
                for name in ["legal_practice_kb", "legal_practice_kb_chunks", "knowledge_base", "knowledge_base_chunks"]
            },
        }
    except Exception as e:  # noqa: BLE001
        return {"available": False, "reason": f"live_openapi_failed: {e}"}


def build_schema_analysis_markdown(live_schema: dict[str, Any]) -> str:
    lines = [
        "# Supabase schema analysis for ECHR workflow",
        "",
        "## Primary ECHR target tables",
        "",
        "### public.legal_practice_kb",
        "- Primary table for ECHR case-level records.",
        "- Required direct insert fields: `title`, `content_text`, `court_type`, `practice_category`, `outcome`.",
        "- ECHR-specific columns present in repo schema: `echr_case_id`, `judgment_hy`, `facts_hy`, `summary_hy`, `text_hy`, `translation_status`, `translation_provider`, `translation_ts`, `translation_errors`, `decision_map`, `echr_article`.",
        "- Embedding columns exist: `embedding`, `embedding_legacy_768` and are nullable/backfilled by a separate embedding pipeline.",
        "- `content_chunks`, `chunk_index_meta`, `key_paragraphs` exist on the table but are not used by the current chunk worker as the canonical source of chunk rows.",
        "",
        "### public.legal_practice_kb_chunks",
        "- Primary table for chunk rows for `legal_practice_kb`.",
        "- Required direct insert fields: `doc_id`, `chunk_index`, `chunk_text`.",
        "- Additional active columns confirmed in repo schema: `chunk_hash`, `title`, `source_anchor`, `rechunk_version`, `overlap_prev`.",
        "- No embedding/vector column exists on this table; embeddings are not inserted here directly in the current project schema.",
        "",
        "## Secondary tables",
        "- `public.knowledge_base` and `public.knowledge_base_chunks` are legislation/KB corpus tables, not the primary ECHR case target in the current ingestion path.",
        "",
        "## Live schema introspection",
        f"- Available: `{live_schema.get('available')}`",
        f"- Status: `{live_schema.get('reason', 'ok')}`",
    ]
    if live_schema.get("available"):
        lines.extend(["", "### Live OpenAPI-exposed columns"])
        for table, cols in (live_schema.get("tables") or {}).items():
            lines.append(f"- `{table}`: {', '.join(cols)}")
    return "\n".join(lines) + "\n"


def build_case_mapping_markdown() -> str:
    return """# JSONL → Supabase mapping (ECHR cases)

## Source JSONL record
- Source shape is HUDOC-like `out.jsonl`/`out_part*.jsonl`.
- Stable record identifier priority: `itemid` → `application_no` → `appno` → `echr_case_id` → `case_id` → `id`.

## Enrichment layer
- `CaseEnricher` preserves the original record and adds selective Armenian companion fields (`*_hy`).
- `build_hy_out_record()` builds an Armenian-only `decision_map` JSONB while preserving canonical fields unchanged.

## Insert projection to `legal_practice_kb`
- `title` ← `docname_hy`
- `content_text` ← Armenian judgment text extracted from translated content tree
- `practice_category` ← `echr`
- `court_type` ← `echr`
- `outcome` ← derived from conclusion/outcome mapping
- `source_name` ← `originatingbody_name` or fallback HUDOC label
- `court_name` ← `originatingbody_name` / respondent fallback
- `case_number_anonymized` ← `appno`
- `decision_date` ← parsed `judgementdate` / `kpdate`
- `applied_articles` ← JSON projection from `article` / `__articles`
- `key_violations` ← translated conclusion violations
- `echr_article` ← source article code list
- `judgment_hy` / `facts_hy` / `summary_hy` ← Armenian text derivatives
- `translation_status`, `translation_provider`, `translation_ts`, `translation_errors` ← translation audit fields
- `decision_map` ← Armenian-only structured JSONB
- `echr_case_id` ← stable ECHR case id for idempotent upsert

## Not inserted directly
- `embedding`, `embedding_legacy_768`, `embedding_status` are nullable/backfilled later by embedding workers.
- `id`, timestamps, `tsv` are DB-managed.
- `content_chunks`, `chunk_index_meta`, `key_paragraphs` are not required for direct case-row import.
"""


def build_chunk_mapping_markdown() -> str:
    return """# Chunk JSONL → Supabase mapping (ECHR chunks)

## Canonical target table
- `public.legal_practice_kb_chunks`

## Minimal insert projection
- `doc_id` ← resolved `legal_practice_kb.id`
- `chunk_index` ← `chunk_order`
- `chunk_text` ← Armenian chunk text for Armenian chunk output or original text for original chunk output
- `chunk_hash` ← deterministic hash of chunk text
- `title` ← section label / section name
- `source_anchor` ← section/file/paragraph boundary hint
- `rechunk_version` ← workflow chunker version
- `overlap_prev` ← overlap size in chars or zero

## Local richer JSONL chunk schema
The workflow emits richer JSONL metadata than the DB table stores, including:
- `chunk_id`
- `parent_record_id`
- `source_document_id`
- `source_file`
- `section_name` / `section_name_hy`
- `paragraph_start` / `paragraph_end`
- `paragraph_numbers`
- `text_original` / `text_hy`
- character/token counts
- `source_span_reference`
- `article_refs`
- `legal_topic_tags`

These rich fields require a transformation step before DB insert because `legal_practice_kb_chunks` stores only the narrow chunk row schema.
"""


def make_translator(args: argparse.Namespace) -> tuple[Any, TranslationStats]:
    cache = TranslationCache(cache_path=Path(args.cache_path))
    stats = TranslationStats()
    if args.backend == "noop":
        return NoopTranslator(cache=cache, stats=stats), stats
    return (
        OllamaTranslator(
            base_url=args.ollama_url,
            model=args.ollama_model,
            cache=cache,
            stats=stats,
            timeout_s=args.ollama_timeout_s,
        ),
        stats,
    )


def resolve_reviewer(args: argparse.Namespace) -> OllamaReviewer | None:
    raw = (args.review_model or "").strip().lower()
    if raw in {"", "none", "off", "skip", "false", "0"}:
        return None
    if args.backend == "noop":
        return None
    return OllamaReviewer(base_url=args.ollama_url, model=args.review_model, timeout_s=args.ollama_timeout_s)


def build_case_jsonl_sample(
    records: Iterable[dict[str, Any]],
    *,
    args: argparse.Namespace,
    output_dir: Path,
) -> dict[str, Any]:
    translator, tstats = make_translator(args)
    reviewer = resolve_reviewer(args)
    enricher = CaseEnricher(translator=translator, target_lang="hy", source_lang="en")
    stripper = EnrichmentStripper()
    env = load_env_file(_REPO_ROOT)
    loader = None
    if env.get("VITE_SUPABASE_URL") and env.get("SUPABASE_SERVICE_ROLE_KEY"):
        loader = EchrLegalPracticeLoader(
            sb=SupabaseRestClient(
                base_url=env["VITE_SUPABASE_URL"],
                service_role_key=env["SUPABASE_SERVICE_ROLE_KEY"],
                timeout_s=10.0,
                max_retries=1,
            ),
            import_ref="echr-full-workflow",
        )

    cases_out = output_dir / "legal_cases_hy_sample.jsonl"
    chunks_hy_out = output_dir / "chunks_hy_sample.jsonl"
    chunks_orig_out = output_dir / "chunks_original_sample.jsonl"
    validation_rows: list[dict[str, Any]] = []
    t_issues: list[TranslationIssue] = []
    c_issues: list[ChunkIssue] = []
    processed = 0

    with (
        cases_out.open("w", encoding="utf-8", newline="\n") as cf,
        chunks_hy_out.open("w", encoding="utf-8", newline="\n") as chf,
        chunks_orig_out.open("w", encoding="utf-8", newline="\n") as cof,
    ):
        for record in records:
            processed += 1
            record_id = get_stable_id(record) or f"record-{processed}"
            working_record = (
                trim_record_for_sample(
                    record,
                    max_content_roots=max(1, int(getattr(args, "max_content_roots", 1))),
                    max_content_nodes_per_root=max(1, int(getattr(args, "max_content_nodes_per_root", 8))),
                    max_conclusion_items=max(1, int(getattr(args, "max_conclusion_items", 1))),
                    max_decision_body_items=max(1, int(getattr(args, "max_decision_body_items", 3))),
                )
                if bool(getattr(args, "sample_trim", False))
                else record
            )
            if args.skip_translation:
                enriched = working_record
            else:
                enriched = enricher.enrich(working_record)
                t_issues.extend(
                    run_translation_qa(
                        original=working_record,
                        enriched=enriched,
                        reviewer=reviewer,
                        record_id=record_id,
                        max_pairs=max(0, int(getattr(args, "qa_max_pairs", 0))),
                    )
                )
            if not args.skip_translation:
                stripped = stripper.strip(enriched)
                validation_rows.append({"record_id": record_id, "preserved": stripped == working_record})
                cf.write(json.dumps(enriched, ensure_ascii=False))
                cf.write("\n")

            if not args.skip_translation and loader is not None:
                try:
                    row = loader.build_row(case_obj=working_record, enriched_obj=enriched, provider=f"{args.backend}:{args.ollama_model}")
                    if row is not None:
                        validation_rows.append({"record_id": record_id, **validate_case_row_schema(row)})
                except Exception as e:  # noqa: BLE001
                    validation_rows.append({"record_id": record_id, "table": "legal_practice_kb", "ok": False, "error": str(e)})

            orig_chunks = build_semantic_chunks_for_record(working_record, use_hy=False)
            for chunk in orig_chunks:
                cof.write(json.dumps(chunk, ensure_ascii=False))
                cof.write("\n")
            c_issues.extend(validate_chunk_set(record_id, orig_chunks))

            if not args.skip_translation:
                hy_case = build_hy_out_record(working_record, enriched)
                hy_chunks = build_semantic_chunks_for_record(hy_case, use_hy=True)
                for chunk in hy_chunks:
                    chf.write(json.dumps(chunk, ensure_ascii=False))
                    chf.write("\n")
                    chunk_row = {
                        "doc_id": record_id,
                        "chunk_index": chunk["chunk_order"],
                        "chunk_text": chunk["text_hy"],
                        "chunk_hash": None,
                        "title": chunk.get("section_name_hy") or chunk.get("section_name"),
                        "source_anchor": json.dumps(chunk["source_span_reference"], ensure_ascii=False),
                        "rechunk_version": "echr_full_workflow_v1",
                        "overlap_prev": 0,
                    }
                    validation_rows.append({"record_id": record_id, **validate_chunk_row_schema(chunk_row)})
                c_issues.extend(validate_chunk_set(record_id, hy_chunks))

    return {
        "processed_records": processed,
        "translation_stats": asdict(tstats),
        "case_output": str(cases_out) if not args.skip_translation else None,
        "chunks_hy_output": str(chunks_hy_out) if not args.skip_translation else None,
        "chunks_original_output": str(chunks_orig_out),
        "translation_issues": t_issues,
        "chunk_issues": c_issues,
        "validation_rows": validation_rows,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ECHR shard audit + translation/chunking workflow (auditable, resumable).")
    parser.add_argument("--source-dir", default=str(SOURCE_DEFAULT), help="Directory containing out_part*.jsonl shards.")
    parser.add_argument("--output-dir", default="output", help="Workflow output directory inside repo.")
    parser.add_argument("--backend", choices=["ollama", "noop"], default="ollama")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    parser.add_argument("--ollama-model", default="gemma4:e4b")
    parser.add_argument("--review-model", default="qwen3.5:latest")
    parser.add_argument("--ollama-timeout-s", type=float, default=180.0)
    parser.add_argument("--cache-path", default=str(_REPO_ROOT / "output" / "translation_cache.sqlite"))
    parser.add_argument("--limit", type=int, default=0, help="Optional sample limit for execution.")
    parser.add_argument("--skip-translation", action="store_true", help="Skip expensive translation execution; still emit audits/reports.")
    parser.add_argument("--qa-max-pairs", type=int, default=0, help="Limit QA pair checks for sample runs (0 = all).")
    parser.add_argument("--sample-trim", action="store_true", help="Trim records for fast sample model benchmarking.")
    parser.add_argument("--max-content-roots", type=int, default=1, help="Max top-level content roots in sample-trim mode.")
    parser.add_argument("--max-content-nodes-per-root", type=int, default=8, help="Max content nodes per root in sample-trim mode.")
    parser.add_argument("--max-conclusion-items", type=int, default=1, help="Max conclusion items in sample-trim mode.")
    parser.add_argument("--max-decision-body-items", type=int, default=3, help="Max decision body items in sample-trim mode.")
    args = parser.parse_args(argv)

    source_dir = Path(args.source_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    shards, reference = discover_shards(source_dir)
    shard_validation = validate_shards(shards, reference)
    live_schema = try_live_openapi_schema(_REPO_ROOT)

    full_cases_path = output_dir / "legal_cases_hy_full.jsonl"
    full_chunks_hy_path = output_dir / "chunks_hy_full.jsonl"
    full_chunks_orig_path = output_dir / "chunks_original_full.jsonl"
    touch_jsonl(full_cases_path)
    touch_jsonl(full_chunks_hy_path)
    touch_jsonl(full_chunks_orig_path)

    schema_md = build_schema_analysis_markdown(live_schema)
    (output_dir / "supabase_schema_analysis.md").write_text(schema_md, encoding="utf-8")
    (output_dir / "jsonl_to_supabase_mapping.md").write_text(build_case_mapping_markdown(), encoding="utf-8")
    (output_dir / "chunk_to_supabase_mapping.md").write_text(build_chunk_mapping_markdown(), encoding="utf-8")

    records_iter = (obj for shard in shards for obj in iter_json_records(shard))
    if args.limit > 0:
        limited: list[dict[str, Any]] = []
        for i, obj in enumerate(records_iter, start=1):
            limited.append(obj)
            if i >= args.limit:
                break
        records_for_execution = limited
    else:
        records_for_execution = []

    execution_result = {
        "processed_records": 0,
        "translation_stats": {},
        "case_output": None,
        "chunks_hy_output": None,
        "chunks_original_output": None,
        "translation_issues": [],
        "chunk_issues": [],
        "validation_rows": [],
    }

    if records_for_execution:
        execution_result = build_case_jsonl_sample(records_for_execution, args=args, output_dir=output_dir)
        if execution_result.get("case_output"):
            Path(execution_result["case_output"]).replace(full_cases_path)
            execution_result["case_output"] = str(full_cases_path)
        if execution_result.get("chunks_hy_output"):
            Path(execution_result["chunks_hy_output"]).replace(full_chunks_hy_path)
            execution_result["chunks_hy_output"] = str(full_chunks_hy_path)
        if execution_result.get("chunks_original_output"):
            Path(execution_result["chunks_original_output"]).replace(full_chunks_orig_path)
            execution_result["chunks_original_output"] = str(full_chunks_orig_path)

    translation_issues = [
        {
            "record_id": x.record_id,
            "field_path": x.field_path,
            "issue_type": x.issue_type,
            "source_excerpt": x.source_excerpt,
            "translated_excerpt": x.translated_excerpt,
            "repaired": x.repaired,
        }
        for x in execution_result["translation_issues"]
    ]
    chunk_issues = [
        {
            "record_id": x.record_id,
            "chunk_id": x.chunk_id,
            "issue_type": x.issue_type,
            "details": x.details,
        }
        for x in execution_result["chunk_issues"]
    ]

    write_csv(
        output_dir / "legal_translation_qa_issues.csv",
        translation_issues,
        ["record_id", "field_path", "issue_type", "source_excerpt", "translated_excerpt", "repaired"],
    )
    write_csv(
        output_dir / "chunk_qa_issues.csv",
        chunk_issues,
        ["record_id", "chunk_id", "issue_type", "details"],
    )

    legal_translation_report = {
        "processing_scope": "sample" if args.limit else "audit_only",
        "sample_limit": args.limit,
        "translation_backend": args.backend,
        "ollama_model": args.ollama_model,
        "review_model": args.review_model or None,
        "translation_executed": bool(records_for_execution) and not args.skip_translation,
        "translation_stats": execution_result["translation_stats"],
        "issue_count": len(translation_issues),
    }
    chunk_validation_report = {
        "processing_scope": "sample" if args.limit else "audit_only",
        "sample_limit": args.limit,
        "chunk_issue_count": len(chunk_issues),
        "chunks_original_output": execution_result["chunks_original_output"],
        "chunks_hy_output": execution_result["chunks_hy_output"],
    }

    case_validation = {
        "processing_scope": "sample" if args.limit else "audit_only",
        "translation_executed": bool(records_for_execution) and not args.skip_translation,
        "rows": execution_result["validation_rows"][:500],
        "row_count": len(execution_result["validation_rows"]),
        "notes": [
            "Validation is performed against the actual repository schema derived from migrations and generated types.",
            "Live OpenAPI introspection is best-effort and may fail due network timeouts.",
        ],
    }
    chunk_validation = {
        "processing_scope": "sample" if args.limit else "audit_only",
        "issue_count": len(chunk_issues),
        "issues_preview": chunk_issues[:500],
    }
    full_processing = {
        "source_dir": str(source_dir),
        "shard_validation": shard_validation,
        "live_schema": live_schema,
        "processing_scope": "sample" if args.limit else "audit_only",
        "sample_limit": args.limit,
        "translation_executed": bool(records_for_execution) and not args.skip_translation,
        "execution_result": {
            "processed_records": execution_result["processed_records"],
            "case_output": execution_result["case_output"],
            "chunks_hy_output": execution_result["chunks_hy_output"],
            "chunks_original_output": execution_result["chunks_original_output"],
        },
        "known_constraints": [
            "Full-corpus Armenian translation of all 5 shards is computationally heavy (16,096 cases; ~606M source chars in nested content).",
            "Repository code supports resumable offline translation, QA, and chunking, but full execution was not forced automatically by this script unless explicitly run without --limit and without --skip-translation.",
            "Current repository chunk worker stores narrow chunk rows in legal_practice_kb_chunks; rich chunk JSONL requires a projection step.",
        ],
    }

    write_json(output_dir / "legal_translation_report.json", legal_translation_report)
    write_json(output_dir / "chunk_validation_report.json", chunk_validation_report)
    write_json(output_dir / "legal_cases_hy_full.validation.json", case_validation)
    write_json(output_dir / "chunks_hy_full.validation.json", chunk_validation)
    write_json(output_dir / "full_processing_report.json", full_processing)

    print(
        json.dumps(
            {
                "output_dir": str(output_dir.resolve()),
                "processing_scope": full_processing["processing_scope"],
                "processed_records": execution_result["processed_records"],
                "translation_executed": full_processing["translation_executed"],
                "shards_found": len(shards),
                "combined_records": shard_validation["combined_records"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())