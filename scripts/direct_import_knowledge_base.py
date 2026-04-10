from __future__ import annotations

import argparse
import hashlib
import json
import ssl
import time
from pathlib import Path
from typing import Any
from urllib import parse, request, error


def api_request(
    url: str, method: str, headers: dict[str, str], payload: Any | None = None
) -> Any:
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            body = None
            req_headers = dict(headers)
            if payload is not None:
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                req_headers["Content-Type"] = "application/json"
            req = request.Request(url, data=body, headers=req_headers, method=method)
            with request.urlopen(req, timeout=1200) as response:
                text = response.read().decode("utf-8")
                return json.loads(text) if text else None
        except (error.URLError, ConnectionResetError, ssl.SSLError) as exc:
            last_error = exc
            if attempt == 5:
                raise
            time.sleep(3 * (attempt + 1))
    raise last_error if last_error else RuntimeError("api_request failed")


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


def normalize_item(item: dict[str, Any], index: int, batch_ref: str) -> dict[str, Any]:
    return deep_sanitize(
        {
            "title": (item.get("title") or f"Untitled_{index}").strip(),
            "content_text": (item.get("content_text") or "").strip(),
            "article_number": item.get("article_number"),
            "category": item.get("category") or "other",
            "source_name": item.get("source_name") or "ARLIS",
            "source_url": item.get("source_url"),
            "version_date": item.get("version_date"),
            "is_active": True,
            "content_hash": item.get("content_hash"),
        }
    )


def ensure_content_hash(row: dict[str, Any]) -> dict[str, Any]:
    if row.get("content_hash"):
        return row
    content = str(row.get("content_text") or "")
    row["content_hash"] = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return row


def chunked(seq: list[Any], size: int) -> list[list[Any]]:
    return [seq[i : i + size] for i in range(0, len(seq), size)]


def fetch_existing_values(
    base_url: str, headers: dict[str, str], column: str, candidates: list[str]
) -> set[str]:
    values: set[str] = set()
    unique_candidates = sorted({candidate for candidate in candidates if candidate})

    for candidate_batch in chunked(unique_candidates, 100):
        filter_values = ",".join(
            json.dumps(candidate, ensure_ascii=False) for candidate in candidate_batch
        )
        url = (
            f"{base_url}/rest/v1/knowledge_base?select={parse.quote(column)}"
            f"&{column}={parse.quote(f'in.({filter_values})')}"
        )
        rows = api_request(url, "GET", headers)
        for row in rows or []:
            value = row.get(column)
            if isinstance(value, str) and value:
                values.add(value)

    return values


def build_job_rows(document_ids: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for document_id in document_ids:
        for job_type in ("chunk", "embed"):
            rows.append(
                {
                    "document_id": document_id,
                    "source_table": "knowledge_base",
                    "job_type": job_type,
                    "status": "pending",
                    "attempts": 0,
                    "last_error": None,
                    "started_at": None,
                    "completed_at": None,
                }
            )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import knowledge base items directly with service_role key."
    )
    parser.add_argument("items_json", help="Path to JSONL or JSON array with KB items")
    parser.add_argument("--base-url", required=True, help="Supabase project URL")
    parser.add_argument(
        "--service-role-key", required=True, help="Supabase service role key"
    )
    parser.add_argument(
        "--batch-ref", default="arlis-kb-direct-import", help="Import reference prefix"
    )
    parser.add_argument("--batch-size", type=int, default=50, help="Insert batch size")
    parser.add_argument(
        "--ids-output",
        default="",
        help="Optional path to write inserted knowledge_base ids as JSON array",
    )
    args = parser.parse_args()

    items = load_items(Path(args.items_json))
    rows = [
        ensure_content_hash(normalize_item(item, index, args.batch_ref))
        for index, item in enumerate(items)
    ]
    rows = [row for row in rows if row["content_text"]]

    headers = {
        "apikey": args.service_role_key,
        "Authorization": f"Bearer {args.service_role_key}",
        "Prefer": "return=representation",
    }

    read_headers = {k: v for k, v in headers.items() if k != "Prefer"}
    existing_source_urls = fetch_existing_values(
        args.base_url,
        read_headers,
        "source_url",
        [str(row.get("source_url") or "") for row in rows],
    )
    existing_content_hashes = fetch_existing_values(
        args.base_url,
        read_headers,
        "content_hash",
        [str(row.get("content_hash") or "") for row in rows],
    )

    deduped_rows: list[dict[str, Any]] = []
    seen_source_urls: set[str] = set()
    seen_content_hashes: set[str] = set()
    skipped_existing_source_url = 0
    skipped_existing_content_hash = 0
    skipped_batch_source_url = 0
    skipped_batch_content_hash = 0

    for row in rows:
        source_url = row.get("source_url")
        content_hash = row.get("content_hash")

        if isinstance(source_url, str) and source_url:
            if source_url in existing_source_urls:
                skipped_existing_source_url += 1
                continue
            if source_url in seen_source_urls:
                skipped_batch_source_url += 1
                continue

        if isinstance(content_hash, str) and content_hash:
            if content_hash in existing_content_hashes:
                skipped_existing_content_hash += 1
                continue
            if content_hash in seen_content_hashes:
                skipped_batch_content_hash += 1
                continue

        deduped_rows.append(row)
        if isinstance(source_url, str) and source_url:
            seen_source_urls.add(source_url)
        if isinstance(content_hash, str) and content_hash:
            seen_content_hashes.add(content_hash)

    rows = deduped_rows

    inserted_ids: list[str] = []
    insert_url = f"{args.base_url}/rest/v1/knowledge_base?select={parse.quote('id')}"
    jobs_url = f"{args.base_url}/rest/v1/practice_chunk_jobs?on_conflict=document_id,source_table,job_type"

    for batch in chunked(rows, args.batch_size):
        inserted = api_request(insert_url, "POST", headers, batch)
        batch_ids = [row["id"] for row in (inserted or [])]
        inserted_ids.extend(batch_ids)
        if batch_ids:
            job_rows = build_job_rows(batch_ids)
            for job_batch in chunked(job_rows, 200):
                api_request(
                    jobs_url,
                    "POST",
                    {**headers, "Prefer": "resolution=merge-duplicates"},
                    job_batch,
                )

    print(
        json.dumps(
            {
                "input_items": len(items),
                "attempted_new_rows": len(rows),
                "inserted": len(inserted_ids),
                "skipped_existing_source_url": skipped_existing_source_url,
                "skipped_existing_content_hash": skipped_existing_content_hash,
                "skipped_batch_source_url": skipped_batch_source_url,
                "skipped_batch_content_hash": skipped_batch_content_hash,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if args.ids_output:
        Path(args.ids_output).write_text(
            json.dumps(inserted_ids, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {detail}")
