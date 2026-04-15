from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class SupabaseRestClient:
    base_url: str
    service_role_key: str
    timeout_s: float = 60.0
    max_retries: int = 3
    _openapi_spec: dict[str, Any] | None = None

    def _headers(self, *, prefer: str | None = None) -> dict[str, str]:
        h = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
        }
        if prefer:
            h["Prefer"] = prefer
        return h

    def get(self, path: str, *, params: dict[str, str] | None = None) -> Any:
        url = self._make_url(path, params=params)
        req = urllib.request.Request(url, headers=self._headers(), method="GET")
        return self._do(req)

    def post(self, path: str, *, params: dict[str, str] | None = None, body: Any, prefer: str | None = None) -> Any:
        url = self._make_url(path, params=params)
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, headers=self._headers(prefer=prefer), method="POST", data=data)
        return self._do(req)

    def _make_url(self, path: str, *, params: dict[str, str] | None) -> str:
        base = self.base_url.rstrip("/")
        p = path if path.startswith("/") else f"/{path}"
        url = f"{base}{p}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params, safe='(),.:*')}"
        return url

    def _do(self, req: urllib.request.Request) -> Any:
        last_err: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:  # noqa: S310
                    raw = resp.read().decode("utf-8")
                if raw.strip() == "":
                    return None
                return json.loads(raw)
            except urllib.error.HTTPError as e:
                # Capture PostgREST error payload for actionable debugging.
                try:
                    body = e.read().decode("utf-8", errors="replace")
                except Exception:  # noqa: BLE001
                    body = ""
                msg = f"HTTP {e.code} {e.reason}"
                if body.strip():
                    msg = f"{msg}: {body.strip()[:2000]}"
                last_err = RuntimeError(msg)
                if attempt >= self.max_retries:
                    break
                time.sleep(0.6 * attempt)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                last_err = e
                if attempt >= self.max_retries:
                    break
                time.sleep(0.6 * attempt)
        raise RuntimeError(f"Supabase REST request failed after {self.max_retries} attempts: {last_err}") from last_err

    def get_openapi_spec(self) -> dict[str, Any]:
        if self._openapi_spec is not None:
            return self._openapi_spec
        url = self.base_url.rstrip("/") + "/rest/v1/"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": self.service_role_key,
                "Authorization": f"Bearer {self.service_role_key}",
                "Accept": "application/openapi+json",
            },
            method="GET",
        )
        spec = self._do(req)
        if not isinstance(spec, dict):
            raise RuntimeError(f"Unexpected openapi spec type: {type(spec)}")
        self._openapi_spec = spec
        return spec

    def get_table_columns(self, table: str) -> set[str]:
        """
        Return columns for a table as exposed by PostgREST schema cache (OpenAPI/Swagger).
        Useful for filtering inserts when remote DB schema differs from local expectations.
        """
        spec = self.get_openapi_spec()
        defs = spec.get("definitions", {})
        if not isinstance(defs, dict):
            return set()
        d = defs.get(table)
        if not isinstance(d, dict):
            return set()
        props = d.get("properties", {})
        if not isinstance(props, dict):
            return set()
        return set(props.keys())


def postgrest_in_filter(values: list[str]) -> str:
    # PostgREST uses: col=in.(a,b,c)
    # We must URL-encode the full expression when passed as query param value.
    escaped = ",".join(values)
    return f"in.({escaped})"
