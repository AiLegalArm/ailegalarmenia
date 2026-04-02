from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib import error, request


def post_json(url: str, payload: dict, headers: dict[str, str]) -> dict:
    req = request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={**headers, "Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=1200) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def sign_in(base_url: str, anon_key: str, email: str, password: str) -> str:
    auth_url = f"{base_url}/auth/v1/token?grant_type=password"
    payload = {"email": email, "password": password}
    data = post_json(auth_url, payload, {"apikey": anon_key})
    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"No access_token in auth response: {data}")
    return token


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import prepared legal practice payload via Supabase edge function."
    )
    parser.add_argument("payload_json", help="Path to payload JSON with bulkItems")
    parser.add_argument("--base-url", required=True, help="Supabase project URL")
    parser.add_argument(
        "--anon-key", required=True, help="Supabase anon/publishable key"
    )
    parser.add_argument("--email", required=True, help="Admin user email")
    parser.add_argument("--password", required=True, help="Admin user password")
    parser.add_argument(
        "--function-name", default="legal-practice-import", help="Edge function name"
    )
    args = parser.parse_args()

    payload_path = Path(args.payload_json)
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    access_token = sign_in(args.base_url, args.anon_key, args.email, args.password)

    fn_url = f"{args.base_url}/functions/v1/{args.function_name}"
    try:
        response = post_json(
            fn_url,
            payload,
            {
                "apikey": args.anon_key,
                "Authorization": f"Bearer {access_token}",
            },
        )
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Import failed with HTTP {exc.code}: {detail}") from exc

    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
