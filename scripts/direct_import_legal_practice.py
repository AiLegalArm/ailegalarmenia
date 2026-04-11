from __future__ import annotations

import argparse
import json
import ssl
import time
from pathlib import Path
from typing import Any
from urllib import error, parse, request


def post_json(
    url: str, payload: list[dict[str, Any]] | dict[str, Any], headers: dict[str, str]
) -> Any:
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            req = request.Request(
                url,
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={**headers, "Content-Type": "application/json"},
                method="POST",
            )
            with request.urlopen(req, timeout=1200) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else None
        except (error.URLError, ConnectionResetError, ssl.SSLError) as exc:
            last_error = exc
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    raise last_error if last_error else RuntimeError("post_json failed")


def get_json(url: str, headers: dict[str, str]) -> Any:
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            req = request.Request(url, headers=headers, method="GET")
            with request.urlopen(req, timeout=1200) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else None
        except (error.URLError, ConnectionResetError, ssl.SSLError) as exc:
            last_error = exc
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    raise last_error if last_error else RuntimeError("get_json failed")


def get_existing_titles(base_url: str, headers: dict[str, str]) -> set[str]:
    rows = get_json(
        f"{base_url}/rest/v1/legal_practice_kb?select=title&is_active=eq.true",
        headers,
    )
    return {row["title"] for row in (rows or []) if row.get("title")}


def load_items(path: Path) -> list[dict[str, Any]]:
    raw = path.read_text(encoding="utf-8")
    stripped = raw.strip()
    if not stripped:
        return []
    if stripped.startswith("["):
        data = json.loads(stripped)
        return data if isinstance(data, list) else []
    items: list[dict[str, Any]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        items.append(json.loads(line))
    return items


def normalize_item(item: dict[str, Any], index: int, batch_ref: str) -> dict[str, Any]:
    return deep_sanitize(
        {
            "title": item.get("title") or f"Untitled_{index}",
            "content_text": (item.get("content_text") or "").strip(),
            "import_ref": f"{batch_ref}:{index}",
            "practice_category": item.get("practice_category") or "criminal",
            "court_type": item.get("court_type") or "cassation",
            "outcome": item.get("outcome")
            if item.get("outcome")
            in {"granted", "rejected", "partial", "remanded", "discontinued"}
            else "granted",
            "is_active": True,
            "is_anonymized": bool(item.get("is_anonymized", False)),
            "visibility": item.get("visibility") or "admin_only",
            "source_name": item.get("source_name"),
            "source_url": item.get("source_url"),
            "court_name": item.get("court_name"),
            "case_number_anonymized": item.get("case_number_anonymized"),
            "decision_date": item.get("decision_date"),
            "applied_articles": item.get("applied_articles"),
            "legal_reasoning_summary": item.get("legal_reasoning_summary"),
            "key_violations": item.get("key_violations")
            if isinstance(item.get("key_violations"), list)
            else [],
            "description": item.get("description") or item.get("title") or f"Untitled_{index}",
        }
    )


def sanitize_string(value: str) -> str:
    return (
        value.replace("\x00", "")
        .encode("utf-8", errors="ignore")
        .decode("utf-8", errors="ignore")
        .translate({code: None for code in range(0xD800, 0xE000)})
    )


def deep_sanitize(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_string(value)
    if isinstance(value, list):
        return [deep_sanitize(item) for item in value]
    if isinstance(value, dict):
        return {key: deep_sanitize(item) for key, item in value.items()}
    return value


def build_job_rows(document_ids: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for document_id in document_ids:
        for job_type in ("chunk", "embed", "enrich"):
            rows.append(
                {
                    "document_id": document_id,
                    "source_table": "legal_practice_kb",
                    "job_type": job_type,
                    "status": "pending",
                    "attempts": 0,
                    "last_error": None,
                    "started_at": None,
                    "completed_at": None,
                }
            )
    return rows


def chunked(seq: list[Any], size: int) -> list[list[Any]]:
    return [seq[i : i + size] for i in range(0, len(seq), size)]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import legal practice items directly with service_role key."
    )
    parser.add_argument("items_json", help="Path to generated *_items.json")
    parser.add_argument("--base-url", required=True, help="Supabase project URL")
    parser.add_argument(
        "--service-role-key", required=True, help="Supabase service role key"
    )
    parser.add_argument(
        "--batch-ref",
        default="arlis-direct-import",
        help="Batch reference prefix for import_ref",
    )
    parser.add_argument("--batch-size", type=int, default=25, help="Insert batch size")
    args = parser.parse_args()

    items = load_items(Path(args.items_json))
    rows = [
        normalize_item(item, index, args.batch_ref) for index, item in enumerate(items)
    ]
    rows = [row for row in rows if row["content_text"]]

    headers = {
        "apikey": args.service_role_key,
        "Authorization": f"Bearer {args.service_role_key}",
        "Prefer": "return=representation",
    }

    existing_titles = get_existing_titles(
        args.base_url, {k: v for k, v in headers.items() if k != "Prefer"}
    )
    rows = [row for row in rows if row["title"] not in existing_titles]

    inserted_ids: list[str] = []
    jobs_url = f"{args.base_url}/rest/v1/practice_chunk_jobs"
    for batch in chunked(rows, args.batch_size):
        select = parse.quote("id,import_ref")
        url = f"{args.base_url}/rest/v1/legal_practice_kb?select={select}"
        inserted = post_json(url, batch, headers)
        batch_ids = [row["id"] for row in inserted]
        inserted_ids.extend(batch_ids)
        if batch_ids:
            job_rows = build_job_rows(batch_ids)
            for job_batch in chunked(job_rows, 120):
                post_json(jobs_url, job_batch, headers)

    counts = get_json(
        f"{args.base_url}/rest/v1/legal_practice_kb?select=id",
        {k: v for k, v in headers.items() if k != "Prefer"},
    )
    print(
        json.dumps(
            {
                "input_items": len(items),
                "attempted_new_rows": len(rows),
                "inserted": len(inserted_ids),
                "current_legal_practice_rows": len(counts or []),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {detail}")
