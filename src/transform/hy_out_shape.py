from __future__ import annotations

import copy
from typing import Any


HUMAN_TOP_LEVEL_FIELDS = ("docname", "__conclusion", "_decision_body")


def _is_nonblank_str(v: Any) -> bool:
    return isinstance(v, str) and v.strip() != ""


def _require_translated(original_val: Any, translated_val: Any, *, field: str) -> Any:
    # If original is blank/None, allow translated to be blank/None.
    if not _is_nonblank_str(original_val):
        return translated_val
    if not isinstance(translated_val, str):
        raise ValueError(f"Missing Armenian translation for field '{field}'")
    return translated_val


def build_hy_out_record(original: dict[str, Any], enriched: dict[str, Any]) -> dict[str, Any]:
    """
    Build a new record that keeps the SAME top-level keys as `original` (out.jsonl shape),
    but replaces human-readable fields with Armenian equivalents sourced from `enriched` *_hy fields.

    This produces a "HY-out-shape" record:
    - no *_hy fields present
    - content tree uses content/section_name (Armenian values), not content_hy/section_name_hy
    - technical fields remain unchanged
    """
    out = copy.deepcopy(original)

    # Top-level swaps
    if "docname" in out and "docname_hy" in enriched:
        out["docname"] = _require_translated(out.get("docname"), enriched.get("docname_hy"), field="docname")
    if "__conclusion" in out and "__conclusion_hy" in enriched:
        out["__conclusion"] = _require_translated(out.get("__conclusion"), enriched.get("__conclusion_hy"), field="__conclusion")
    if "_decision_body" in out and "_decision_body_hy" in enriched:
        out["_decision_body"] = _require_translated(out.get("_decision_body"), enriched.get("_decision_body_hy"), field="_decision_body")

    # country.name swap
    if isinstance(out.get("country"), dict) and isinstance(enriched.get("country"), dict):
        if "name" in out["country"] and "name_hy" in enriched["country"]:
            out["country"]["name"] = _require_translated(
                out["country"].get("name"),
                enriched["country"].get("name_hy"),
                field="country.name",
            )

    # conclusion[].element/details swaps, drop *_hy siblings if present
    if isinstance(out.get("conclusion"), list) and isinstance(enriched.get("conclusion"), list):
        for i, item in enumerate(out["conclusion"]):
            if not isinstance(item, dict):
                continue
            if i >= len(enriched["conclusion"]):
                continue
            src = enriched["conclusion"][i]
            if not isinstance(src, dict):
                continue
            if "element" in item and "element_hy" in src:
                item["element"] = _require_translated(item.get("element"), src.get("element_hy"), field=f"conclusion[{i}].element")
            if "details" in item and "details_hy" in src and isinstance(src.get("details_hy"), list):
                # If original had non-blank detail strings, require translated detail strings.
                orig_details = item.get("details")
                hy_details = src.get("details_hy")
                if isinstance(orig_details, list) and isinstance(hy_details, list):
                    if any(_is_nonblank_str(d) for d in orig_details):
                        if any(not isinstance(d, str) for d in hy_details):
                            raise ValueError(f"Missing Armenian translation for field 'conclusion[{i}].details'")
                item["details"] = hy_details
            # Ensure we don't carry *_hy into out-shape
            item.pop("element_hy", None)
            item.pop("details_hy", None)

    # content tree swaps: content/section_name become Armenian; remove *_hy companions
    if isinstance(out.get("content"), dict) and isinstance(enriched.get("content"), dict):
        for fk, nodes in out["content"].items():
            if not isinstance(nodes, list):
                continue
            src_nodes = enriched["content"].get(fk)
            if not isinstance(src_nodes, list):
                continue
            for idx, node in enumerate(nodes):
                if idx >= len(src_nodes):
                    break
                _apply_content_node_hy(node, src_nodes[idx])

    # decision_body should remain as-is (names are canonical); ensure no role_label_hy leaks
    if isinstance(out.get("decision_body"), list):
        for x in out["decision_body"]:
            if isinstance(x, dict):
                x.pop("role_label_hy", None)

    # Remove known enrichment-only top-level keys if they somehow exist
    out.pop("translation_meta", None)
    out.pop("article_labels_hy", None)
    for k in list(out.keys()):
        if k.endswith("_hy"):
            out.pop(k, None)

    # Strict: ensure top-level key set matches original
    if set(out.keys()) != set(original.keys()):
        raise ValueError("HY-out-shape keys mismatch with original top-level keys")

    # Strict: ensure no *_hy anywhere
    _assert_no_hy_keys(out)
    return out


def _apply_content_node_hy(dst: Any, src: Any) -> None:
    if not isinstance(dst, dict) or not isinstance(src, dict):
        return
    if "content" in dst and "content_hy" in src:
        dst["content"] = _require_translated(dst.get("content"), src.get("content_hy"), field="content[*].content")
    if "section_name" in dst and "section_name_hy" in src:
        dst["section_name"] = _require_translated(dst.get("section_name"), src.get("section_name_hy"), field="content[*].section_name")
    dst.pop("content_hy", None)
    dst.pop("section_name_hy", None)
    dst.pop("type_hy", None)

    dst_els = dst.get("elements")
    src_els = src.get("elements")
    if isinstance(dst_els, list) and isinstance(src_els, list):
        for i, child in enumerate(dst_els):
            if i >= len(src_els):
                break
            _apply_content_node_hy(child, src_els[i])


def _assert_no_hy_keys(obj: Any) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(k, str) and k.endswith("_hy"):
                raise ValueError(f"Unexpected *_hy key in HY-out-shape: {k}")
            _assert_no_hy_keys(v)
    elif isinstance(obj, list):
        for it in obj:
            _assert_no_hy_keys(it)
