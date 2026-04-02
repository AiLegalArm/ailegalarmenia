from __future__ import annotations

import argparse
import json
from typing import Any
from urllib import request, error


def api_request(
    url: str, method: str, headers: dict[str, str], payload: Any | None = None
) -> Any:
    body = None
    req_headers = dict(headers)
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = request.Request(url, data=body, headers=req_headers, method=method)
    with request.urlopen(req, timeout=1200) as response:
        text = response.read().decode("utf-8")
        return json.loads(text) if text else None


def delete_all(base_url: str, headers: dict[str, str], table: str) -> None:
    url = f"{base_url}/rest/v1/{table}?id=not.is.null"
    api_request(url, "DELETE", {**headers, "Prefer": "return=minimal"})


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Delete KB/practice corpus tables only."
    )
    parser.add_argument("--base-url", required=True, help="Supabase project URL")
    parser.add_argument(
        "--service-role-key", required=True, help="Supabase service role key"
    )
    args = parser.parse_args()

    headers = {
        "apikey": args.service_role_key,
        "Authorization": f"Bearer {args.service_role_key}",
    }

    order = [
        "practice_chunk_jobs",
        "legal_practice_kb_chunks",
        "knowledge_base_chunks",
        "kb_versions",
        "legal_practice_kb",
        "knowledge_base",
    ]

    for table in order:
        delete_all(args.base_url, headers, table)

    print(json.dumps({"deleted_tables": order}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {detail}")
