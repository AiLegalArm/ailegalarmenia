from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from src.translation.translator import Translator


def _as_str(v: Any) -> str | None:
    return v if isinstance(v, str) else None


def _translate_optional(
    translator: Translator,
    text: Any,
    *,
    source_lang: str,
    target_lang: str,
    purpose: str,
) -> str | None:
    if text is None:
        return None
    if not isinstance(text, str):
        return None
    if text.strip() == "":
        return ""
    return translator.translate(text, source_lang=source_lang, target_lang=target_lang, purpose=purpose)


def _role_label_hy(role: str) -> str | None:
    # UI helper only; does not change canonical `role`.
    mapping = {
        "judge": "դատավոր",
        "president": "նախագահ",
        "vice-president": "փոխնախագահ",
        "registrar": "քարտուղար",
        "section registrar": "բաժնի քարտուղար",
        "agent": "ներկայացուցիչ",
    }
    k = role.strip().lower()
    return mapping.get(k)


def _article_label_hy(code: str) -> str | None:
    """
    Deterministic, non-guessy helper labels.
    Supports:
    - "13" => "Կոնվենցիայի 13-րդ հոդված"
    - "p1-1" => "Արձանագրություն թիվ 1-ի 1-ին հոդված"
    - "p12-2" => "Արձանագրություն թիվ 12-ի 2-րդ հոդված"
    """
    c = code.strip()
    if not c:
        return None
    if c.isdigit():
        return f"Կոնվենցիայի {c}-րդ հոդված"
    if len(c) >= 4 and c[0].lower() == "p":
        rest = c[1:]
        if "-" in rest:
            proto, art = rest.split("-", 1)
            if proto.isdigit() and art.isdigit():
                return f"Արձանագրություն թիվ {proto}-ի {art}-րդ հոդված"
    return None


def _walk_content_nodes(node: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Yield node + descendants for HUDOC-like nested structure.
    Expected shape per node:
      { content?: str, section_name?: str, elements?: [node, ...] }
    """
    stack = [node]
    out: list[dict[str, Any]] = []
    while stack:
        cur = stack.pop()
        out.append(cur)
        els = cur.get("elements")
        if isinstance(els, list):
            for child in reversed(els):
                if isinstance(child, dict):
                    stack.append(child)
    return out


@dataclass
class CaseEnricher:
    translator: Translator
    target_lang: str = "hy"
    source_lang: str = "en"

    def enrich(self, record: dict[str, Any]) -> dict[str, Any]:
        """
        Hard rule: preserve original record exactly; only add companion fields.
        """
        out = copy.deepcopy(record)

        purpose = (
            "You are Kilo AI Orchestrator acting as a senior legal JSONL translation pipeline.\n"
            "Task: Translate English legal prose into formal Eastern Armenian.\n"
            "Strict rules:\n"
            "1. Preserve personal names, case numbers, article numbers, ECLI identifiers, dates, currency codes, court citation format, and legal references exactly.\n"
            "2. Preserve HTML tags exactly.\n"
            "3. Do not summarize, omit, or paraphrase.\n"
            "4. Output ONLY the Armenian translation.\n"
            "5. No comments, markdown, or explanations.\n"
            "6. Formal legal Eastern Armenian style."
        )

        # ---- Top-level fields ----
        if "docname" in out:
            out["docname_hy"] = _translate_optional(
                self.translator, out.get("docname"), source_lang=self.source_lang, target_lang=self.target_lang, purpose=purpose
            )
        if "__conclusion" in out:
            out["__conclusion_hy"] = _translate_optional(
                self.translator, out.get("__conclusion"), source_lang=self.source_lang, target_lang=self.target_lang, purpose=purpose
            )
        if "_decision_body" in out:
            out["_decision_body_hy"] = _translate_optional(
                self.translator,
                out.get("_decision_body"),
                source_lang=self.source_lang,
                target_lang=self.target_lang,
                purpose=purpose,
            )

        # country.name -> country.name_hy
        country = out.get("country")
        if isinstance(country, dict) and "name" in country:
            country["name_hy"] = _translate_optional(
                self.translator,
                country.get("name"),
                source_lang=self.source_lang,
                target_lang=self.target_lang,
                purpose=purpose,
            )

        # ---- conclusion[] ----
        conclusion = out.get("conclusion")
        if isinstance(conclusion, list):
            for c in conclusion:
                if not isinstance(c, dict):
                    continue
                if "element" in c:
                    c["element_hy"] = _translate_optional(
                        self.translator,
                        c.get("element"),
                        source_lang=self.source_lang,
                        target_lang=self.target_lang,
                        purpose=purpose,
                    )
                details = c.get("details")
                if isinstance(details, list):
                    details_hy: list[str] = []
                    for d in details:
                        if d is None:
                            details_hy.append("")
                        elif isinstance(d, str):
                            if d.strip() == "":
                                details_hy.append("")
                            else:
                                details_hy.append(
                                    self.translator.translate(
                                        d,
                                        source_lang=self.source_lang,
                                        target_lang=self.target_lang,
                                        purpose=purpose,
                                    )
                                )
                        else:
                            # Keep positional alignment; non-string -> empty.
                            details_hy.append("")
                    c["details_hy"] = details_hy
                elif "details" in c:
                    # Present but non-list; keep schema stable and non-destructive.
                    c["details_hy"] = []

        # ---- content tree under content[file_key][] ----
        content = out.get("content")
        if isinstance(content, dict):
            for file_key, nodes in content.items():
                if not isinstance(nodes, list):
                    continue
                for n in nodes:
                    if not isinstance(n, dict):
                        continue
                    for node in _walk_content_nodes(n):
                        if "content" in node:
                            node["content_hy"] = _translate_optional(
                                self.translator,
                                node.get("content"),
                                source_lang=self.source_lang,
                                target_lang=self.target_lang,
                                purpose=purpose,
                            )
                        if "section_name" in node:
                            node["section_name_hy"] = _translate_optional(
                                self.translator,
                                node.get("section_name"),
                                source_lang=self.source_lang,
                                target_lang=self.target_lang,
                                purpose=purpose,
                            )

        # ---- decision_body[] structured array ----
        decision_body = out.get("decision_body")
        if isinstance(decision_body, list):
            for m in decision_body:
                if not isinstance(m, dict):
                    continue
                role = _as_str(m.get("role"))
                if role:
                    label = _role_label_hy(role)
                    if label:
                        m["role_label_hy"] = label

        # ---- Optional article labels helper ----
        articles = out.get("article")
        if isinstance(articles, list):
            labels: list[dict[str, str]] = []
            for a in articles:
                if not isinstance(a, str):
                    continue
                lab = _article_label_hy(a)
                if lab:
                    labels.append({"code": a, "label_hy": lab})
            if labels:
                out["article_labels_hy"] = labels

        out["translation_meta"] = {
            "target_language": self.target_lang,
            "strategy": "selective_human_readable_fields_only",
            "original_preserved": True,
            "content_tree_translated_recursively": True,
            "backend": getattr(self.translator, "backend_name", "unknown"),
            "model": getattr(self.translator, "model", None),
            "ts_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }

        return out

