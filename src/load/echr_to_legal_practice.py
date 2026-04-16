from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

from src.load.supabase_rest import SupabaseRestClient, postgrest_in_filter
from src.transform.hy_out_shape import build_hy_out_record


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def extract_elements_text(
    elements: list[dict[str, Any]],
    parts: list[str],
    *,
    content_key: str = "content",
) -> None:
    stack = list(reversed(elements))
    while stack:
        el = stack.pop()
        if not isinstance(el, dict):
            continue
        val = el.get(content_key)
        if isinstance(val, str) and val.strip():
            parts.append(val.strip())
        sub = el.get("elements")
        if isinstance(sub, list) and sub:
            for child in reversed(sub):
                if isinstance(child, dict):
                    stack.append(child)


def extract_case_text(case_obj: dict[str, Any], *, prefer_hy: bool = False) -> str:
    # Mirrors supabase/functions/echr-import extractCaseText but supports *_hy sources.
    keys = ["text", "content_text", "judgment", "summary", "facts"]
    if prefer_hy:
        # If the record already contains pre-translated top-level fields, use them first.
        keys_hy = ["text_hy", "judgment_hy", "summary_hy", "facts_hy"]
        standard = "\n\n".join([case_obj[k] for k in keys_hy if isinstance(case_obj.get(k), str) and case_obj[k].strip()])
        if standard.strip():
            return standard
    standard = "\n\n".join([case_obj[k] for k in keys if isinstance(case_obj.get(k), str) and case_obj[k].strip()])
    if standard.strip():
        return standard

    content = case_obj.get("content")
    if isinstance(content, dict):
        parts: list[str] = []
        for doc_sections in content.values():
            if isinstance(doc_sections, list):
                extract_elements_text([x for x in doc_sections if isinstance(x, dict)], parts, content_key="content_hy" if prefer_hy else "content")
        if parts:
            return "\n\n".join(parts)

    conc_key = "__conclusion_hy" if prefer_hy else "__conclusion"
    conc = case_obj.get(conc_key)
    if isinstance(conc, str) and conc.strip():
        return conc
    return ""


def extract_facts_text(case_obj: dict[str, Any], *, prefer_hy: bool = False) -> str:
    """
    Try to extract only THE FACTS section from HUDOC-like content tree.
    We consider a top-level node to be facts if section_name == 'facts' (case-insensitive) OR
    content heading contains 'THE FACTS' (English) when not prefer_hy.
    """
    content = case_obj.get("content")
    if not isinstance(content, dict):
        return ""
    parts: list[str] = []
    for doc_sections in content.values():
        if not isinstance(doc_sections, list):
            continue
        for node in doc_sections:
            if not isinstance(node, dict):
                continue
            sec = node.get("section_name_hy" if prefer_hy else "section_name")
            heading = node.get("content_hy" if prefer_hy else "content")
            is_facts = isinstance(sec, str) and sec.strip().lower() == "facts"
            if not is_facts and not prefer_hy and isinstance(heading, str) and "THE FACTS" in heading:
                is_facts = True
            if is_facts:
                extract_elements_text([node], parts, content_key="content_hy" if prefer_hy else "content")
    return "\n\n".join([p for p in parts if p.strip()])


def extract_violations(case_obj: dict[str, Any]) -> list[str]:
    violations: list[str] = []
    conc = case_obj.get("conclusion")
    if isinstance(conc, list):
        for c in conc:
            if not isinstance(c, dict):
                continue
            if c.get("type") == "violation" and isinstance(c.get("element"), str) and c["element"].strip():
                violations.append(c["element"].strip())
    if not violations:
        cc = case_obj.get("__conclusion")
        if isinstance(cc, str):
            violations.extend([s.strip() for s in cc.split(";") if s.strip()])
    return violations


def extract_violations_hy(enriched_obj: dict[str, Any]) -> list[str]:
    violations: list[str] = []
    conc = enriched_obj.get("conclusion")
    if isinstance(conc, list):
        for c in conc:
            if not isinstance(c, dict):
                continue
            if c.get("type") == "violation" and isinstance(c.get("element_hy"), str) and c["element_hy"].strip():
                violations.append(c["element_hy"].strip())
    if not violations:
        cc = enriched_obj.get("__conclusion_hy")
        if isinstance(cc, str):
            violations.extend([s.strip() for s in cc.split(";") if s.strip()])
    return violations


def extract_articles(case_obj: dict[str, Any]) -> list[str]:
    art = case_obj.get("article")
    if isinstance(art, list):
        return [a for a in art if isinstance(a, str)]
    aa = case_obj.get("__articles")
    if isinstance(aa, str):
        return [s.strip() for s in aa.split(";") if s.strip()]
    return []


def get_stable_id(case_obj: dict[str, Any]) -> str | None:
    for k in ["itemid", "application_no", "appno", "echr_case_id", "case_id", "id"]:
        v = case_obj.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return None


def map_outcome(raw: str) -> str:
    lower = raw.lower()
    if re.search(r"violation|granted|удовл|қана", lower):
        return "granted"
    if re.search(r"no\.?violation|rejected|отклон", lower):
        return "rejected"
    if re.search(r"partial|частичн", lower):
        return "partial"
    if re.search(r"struck|discontin|прекращ", lower):
        return "discontinued"
    return "granted"


def parse_decision_date(case_obj: dict[str, Any]) -> str | None:
    raw = (
        str(case_obj.get("judgementdate") or case_obj.get("kpdate") or case_obj.get("decisiondate") or case_obj.get("decision_date") or "")
        .strip()
    )
    if not raw:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})", raw)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def build_applied_articles_echr(articles: list[str]) -> dict[str, Any] | None:
    if not articles:
        return None
    return {
        "sources": [
            {
                "act": "ECHR",
                "articles": [{"article": a, "part": "", "point": "", "context": ""} for a in articles],
            }
        ]
    }


@dataclass
class LoadStats:
    processed: int = 0
    inserted_or_updated: int = 0
    skipped_existing: int = 0
    skipped_no_text: int = 0
    failed: int = 0


class EchrLegalPracticeLoader:
    def __init__(self, *, sb: SupabaseRestClient, import_ref: str | None = None) -> None:
        self.sb = sb
        self.import_ref = import_ref
        self._lp_columns: set[str] | None = None

    def _legal_practice_columns(self) -> set[str]:
        if self._lp_columns is None:
            self._lp_columns = self.sb.get_table_columns("legal_practice_kb")
        return self._lp_columns

    def fetch_existing_echr_ids(self, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        # GET /rest/v1/legal_practice_kb?select=echr_case_id&echr_case_id=in.(...)
        data = self.sb.get(
            "/rest/v1/legal_practice_kb",
            params={"select": "echr_case_id", "echr_case_id": postgrest_in_filter(ids)},
        )
        out: set[str] = set()
        if isinstance(data, list):
            for row in data:
                if isinstance(row, dict) and isinstance(row.get("echr_case_id"), str):
                    out.add(row["echr_case_id"])
        return out

    def upsert_rows(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        allowed = self._legal_practice_columns()
        if allowed:
            rows = [{k: v for k, v in r.items() if k in allowed} for r in rows]
        try:
            self.sb.post(
                "/rest/v1/legal_practice_kb",
                params={"on_conflict": "echr_case_id"},
                body=rows,
                prefer="resolution=merge-duplicates,return=minimal",
            )
            return
        except RuntimeError as e:
            msg = str(e)
            # If schema cache changed mid-run, refresh and retry once with filtered fields.
            if "PGRST204" in msg:
                self._lp_columns = self.sb.get_table_columns("legal_practice_kb")
                allowed2 = self._legal_practice_columns()
                if allowed2:
                    rows2 = [{k: v for k, v in r.items() if k in allowed2} for r in rows]
                    self.sb.post(
                        "/rest/v1/legal_practice_kb",
                        params={"on_conflict": "echr_case_id"},
                        body=rows2,
                        prefer="resolution=merge-duplicates,return=minimal",
                    )
                    return
            raise

    def build_row(self, *, case_obj: dict[str, Any], enriched_obj: dict[str, Any] | None = None, provider: str) -> dict[str, Any] | None:
        stable_id = get_stable_id(case_obj)
        if enriched_obj is None:
            raise ValueError("enriched_obj is required to build Armenian-only legal_practice_kb rows")

        title_hy = str(enriched_obj.get("docname_hy") or "").strip()[:200]
        if not title_hy:
            # If translation produced empty title, do not ingest (would violate NOT NULL title).
            return None

        # Armenian-only full text for search/embeddings
        judgment_hy = extract_case_text(enriched_obj, prefer_hy=True).replace("\u0000", "")[:500000]
        if not judgment_hy.strip():
            return None
        facts_hy = extract_facts_text(enriched_obj, prefer_hy=True).replace("\u0000", "")[:300000]

        violations = extract_violations(case_obj)
        violations_hy = extract_violations_hy(enriched_obj)
        articles = extract_articles(case_obj)
        outcome_raw = str("violation" if (case_obj.get("judgementdate") and len(violations) > 0) else (case_obj.get("outcome") or "granted"))
        decision_date = parse_decision_date(case_obj)

        # Content hash based on Armenian text (since we do not store English).
        content_hash = sha256_hex(judgment_hy)

        # Store full Armenian structured out-shape for traceability (JSONB).
        decision_map = build_hy_out_record(case_obj, enriched_obj)

        row: dict[str, Any] = {
            "title": title_hy,
            "content_text": judgment_hy,
            "content_hash": content_hash,
            "practice_category": "echr",
            "court_type": "echr",
            "outcome": map_outcome(outcome_raw),
            "is_anonymized": False,
            "visibility": "ai_only",
            "is_active": True,
            "source_name": str(case_obj.get("originatingbody_name") or case_obj.get("source_name") or "ՄԻԵԴ (HUDOC)"),
            "court_name": (str(case_obj.get("originatingbody_name") or case_obj.get("respondent") or case_obj.get("court_name") or "").strip() or None),
            "case_number_anonymized": (str(case_obj.get("appno") or case_obj.get("application_no") or case_obj.get("case_number") or "").strip() or None),
            "decision_date": decision_date,
            "applied_articles": build_applied_articles_echr(articles),
            "key_violations": violations_hy or None,
            "echr_article": articles or None,
            "judgment_hy": judgment_hy or None,
            "facts_hy": facts_hy or None,
            "summary_hy": enriched_obj.get("__conclusion_hy") if isinstance(enriched_obj.get("__conclusion_hy"), str) else None,
            "translation_status": "success" if judgment_hy else "pending",
            "translation_provider": provider,
            "translation_ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "translation_errors": None,
            "decision_map": decision_map,
        }
        if self.import_ref:
            row["import_ref"] = self.import_ref
        if stable_id:
            row["echr_case_id"] = stable_id
        return row
