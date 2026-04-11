from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class JsonlValidationResult:
    ok: bool
    total_lines: int
    parsed_objects: int
    errors: list[dict[str, Any]]


def validate_jsonl_file(path: Path, *, max_errors: int = 50) -> dict[str, Any]:
    """
    Validates that a file is JSONL where each non-empty line is a JSON object.
    Returns a small dict suitable for report JSON.
    """
    total_lines = 0
    parsed = 0
    errors: list[dict[str, Any]] = []
    with Path(path).open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            total_lines += 1
            raw = line.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
                if not isinstance(obj, dict):
                    raise ValueError(f"Expected object, got {type(obj)}")
                parsed += 1
            except Exception as e:  # noqa: BLE001
                if len(errors) < max_errors:
                    errors.append({"line": line_no, "error": str(e)})
    return {
        "ok": len(errors) == 0,
        "total_lines": total_lines,
        "parsed_objects": parsed,
        "errors": errors,
    }


class EnrichmentStripper:
    """
    Removes the enrichment fields we add (non-destructively) so we can compare
    to the original record and ensure perfect preservation.
    """

    TOP_LEVEL_REMOVE = {
        "docname_hy",
        "__conclusion_hy",
        "_decision_body_hy",
        "translation_meta",
        "article_labels_hy",
    }

    def strip(self, enriched: dict[str, Any]) -> dict[str, Any]:
        obj = copy.deepcopy(enriched)
        for k in self.TOP_LEVEL_REMOVE:
            if k in obj:
                obj.pop(k, None)

        # country.name_hy
        country = obj.get("country")
        if isinstance(country, dict) and "name_hy" in country:
            country.pop("name_hy", None)

        # conclusion[].{element_hy, details_hy}
        conclusion = obj.get("conclusion")
        if isinstance(conclusion, list):
            for c in conclusion:
                if isinstance(c, dict):
                    c.pop("element_hy", None)
                    c.pop("details_hy", None)

        # content tree nodes: content_hy, section_name_hy
        content = obj.get("content")
        if isinstance(content, dict):
            for _file_key, nodes in content.items():
                if not isinstance(nodes, list):
                    continue
                for n in nodes:
                    self._strip_content_node(n)

        # decision_body[]: role_label_hy
        decision_body = obj.get("decision_body")
        if isinstance(decision_body, list):
            for m in decision_body:
                if isinstance(m, dict):
                    m.pop("role_label_hy", None)

        return obj

    def _strip_content_node(self, node: Any) -> None:
        if not isinstance(node, dict):
            return
        node.pop("content_hy", None)
        node.pop("section_name_hy", None)
        els = node.get("elements")
        if isinstance(els, list):
            for child in els:
                self._strip_content_node(child)


def validate_preservation_for_pairs(
    pairs: list[tuple[dict[str, Any], dict[str, Any]]],
    *,
    stripper: EnrichmentStripper,
    max_errors: int = 50,
) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    for idx, (orig, enriched) in enumerate(pairs):
        stripped = stripper.strip(enriched)
        if stripped != orig:
            if len(errors) < max_errors:
                errors.append(
                    {
                        "index": idx,
                        "hint": {
                            "itemid": orig.get("itemid"),
                            "appno": orig.get("appno"),
                            "docname": orig.get("docname"),
                        },
                        "error": "Enriched record differs from original after stripping enrichment fields.",
                    }
                )
    return {
        "ok": len(errors) == 0,
        "checked": len(pairs),
        "errors": errors,
    }

