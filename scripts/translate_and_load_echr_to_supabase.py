from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Iterable

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from src.load.echr_to_legal_practice import (  # noqa: E402
    EchrLegalPracticeLoader,
    LoadStats,
    get_stable_id,
)
from src.load.supabase_rest import SupabaseRestClient  # noqa: E402
from src.transform.case_enricher import CaseEnricher  # noqa: E402
from src.translation.translator import (  # noqa: E402
    OllamaTranslator,
    NoopTranslator,
    TranslationCache,
    TranslationStats,
)


def iter_json_records(path: Path) -> Iterable[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".jsonl":
        with path.open("r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, start=1):
                raw = line.strip()
                if not raw:
                    continue
                obj = json.loads(raw)
                if not isinstance(obj, dict):
                    raise ValueError(f"Expected JSON object at {path}:{line_no}")
                yield obj
        return
    if suffix == ".json":
        obj = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(obj, list):
            for i, item in enumerate(obj):
                if not isinstance(item, dict):
                    raise ValueError(f"Expected object at {path}[{i}]")
                yield item
            return
        if isinstance(obj, dict):
            yield obj
            return
        raise ValueError(f"Expected object or array in {path}")
    raise ValueError(f"Unsupported input: {path}")


def chunked(iterable: Iterable[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    buf: list[dict[str, Any]] = []
    for x in iterable:
        buf.append(x)
        if len(buf) >= size:
            yield buf
            buf = []
    if buf:
        yield buf


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Translate ECtHR/HUDOC JSONL selectively to Armenian and upsert Armenian-only rows into Supabase legal_practice_kb."
    )
    parser.add_argument("input", help="Path to ECtHR JSON/JSONL (e.g. out.jsonl).")
    parser.add_argument("--base-url", default=os.environ.get("SUPABASE_URL") or "", help="Supabase project URL.")
    parser.add_argument("--service-role-key", default=os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "", help="Supabase service role key.")
    parser.add_argument("--backend", choices=["ollama", "noop"], default="ollama", help="Translation backend.")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434", help="Ollama base URL.")
    parser.add_argument("--ollama-model", default="gemma4:e4b", help="Ollama model.")
    parser.add_argument("--ollama-timeout-s", type=float, default=120.0, help="Ollama request timeout (s).")
    parser.add_argument("--cache-path", default="output/translation_cache.sqlite", help="SQLite cache path.")
    parser.add_argument("--import-ref", default="echr-hy-bulk", help="import_ref tag to set on rows.")
    parser.add_argument("--skip-existing", action="store_true", help="Skip records already present by echr_case_id.")
    parser.add_argument("--prefetch", type=int, default=200, help="Read this many records ahead for existence checks.")
    parser.add_argument("--upsert-batch-size", type=int, default=10, help="Upsert batch size.")
    parser.add_argument("--limit", type=int, default=0, help="Max records to process (0=all).")
    parser.add_argument("--offset", type=int, default=0, help="Skip this many records before processing.")
    parser.add_argument("--dry-run", action="store_true", help="Translate/build rows but do not upload to Supabase.")
    args = parser.parse_args(argv)

    # noop backend allowed without dry-run when user explicitly wants to upload as-is

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = (_REPO_ROOT / input_path).resolve()
    if not input_path.exists():
        raise FileNotFoundError(str(input_path))

    needs_supabase = (not args.dry_run) or bool(args.skip_existing)
    if needs_supabase and (not args.base_url or not args.service_role_key):
        raise ValueError("Missing --base-url/--service-role-key (or env SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).")

    cache_path = Path(args.cache_path)
    if not cache_path.is_absolute():
        cache_path = (_REPO_ROOT / cache_path).resolve()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache = TranslationCache(cache_path=cache_path)
    tstats = TranslationStats()
    if args.backend == "ollama":
        translator = OllamaTranslator(
            base_url=args.ollama_url,
            model=args.ollama_model,
            cache=cache,
            stats=tstats,
            timeout_s=args.ollama_timeout_s,
        )
        provider = f"ollama:{args.ollama_model}"
    else:
        translator = NoopTranslator(cache=cache, stats=tstats)
        provider = "noop"

    enricher = CaseEnricher(translator=translator, target_lang="hy", source_lang="en")

    loader: EchrLegalPracticeLoader | None = None
    if needs_supabase:
        sb = SupabaseRestClient(base_url=args.base_url, service_role_key=args.service_role_key, timeout_s=90.0)
        loader = EchrLegalPracticeLoader(sb=sb, import_ref=args.import_ref)

    stats = LoadStats()
    attempted = 0
    processed = 0
    start = time.time()

    rec_iter = iter_json_records(input_path)

    # Apply offset by consuming.
    for _ in range(max(0, int(args.offset))):
        try:
            next(rec_iter)  # type: ignore[arg-type]
            attempted += 1
        except StopIteration:
            break

    print(f"Starting ingestion from {input_path.name}...", flush=True)

    rows_batch: list[dict[str, Any]] = []

    # Stream in chunks to allow existence checks without loading full dataset.
    for group in chunked(rec_iter, max(1, int(args.prefetch))):
        if args.limit and processed >= args.limit:
            break

        group_ids: list[str] = []
        for r in group:
            attempted += 1
            sid = get_stable_id(r)
            if isinstance(sid, str) and sid.strip():
                group_ids.append(sid.strip())

        existing: set[str] = set()
        if args.skip_existing and group_ids:
            if loader is None:
                raise RuntimeError("skip-existing requires Supabase credentials")
            existing = loader.fetch_existing_echr_ids(group_ids)

        for rec in group:
            if args.limit and processed >= args.limit:
                break

            sid = get_stable_id(rec)
            if args.skip_existing and sid and sid in existing:
                stats.skipped_existing += 1
                continue

            try:
                enriched = enricher.enrich(rec)
                if loader is None:
                    # dry-run path: build Armenian-only row without network use (build_row does not call network).
                    loader_local = EchrLegalPracticeLoader(
                        sb=SupabaseRestClient(base_url="http://localhost", service_role_key="noop"),
                        import_ref=args.import_ref,
                    )
                    row = loader_local.build_row(case_obj=rec, enriched_obj=enriched, provider=provider)
                else:
                    row = loader.build_row(case_obj=rec, enriched_obj=enriched, provider=provider)
                stats.processed += 1
                if row is None:
                    stats.skipped_no_text += 1
                    continue
                rows_batch.append(row)
                processed += 1

                if len(rows_batch) >= args.upsert_batch_size:
                    if not args.dry_run:
                        assert loader is not None
                        loader.upsert_rows(rows_batch)
                    stats.inserted_or_updated += len(rows_batch)
                    print(f"[{time.strftime('%H:%M:%S')}] Upserted {len(rows_batch)} records. Total: {stats.inserted_or_updated}", flush=True)
                    rows_batch = []
            except Exception as e:
                print(f"[{time.strftime('%H:%M:%S')}] Error processing record: {e}", flush=True)
                stats.failed += 1

    if rows_batch:
        if not args.dry_run:
            assert loader is not None
            loader.upsert_rows(rows_batch)
        stats.inserted_or_updated += len(rows_batch)

    dur = max(0.001, time.time() - start)
    print(
        json.dumps(
            {
                "input": str(input_path),
                "processed": stats.processed,
                "upserted": stats.inserted_or_updated,
                "skipped_existing": stats.skipped_existing,
                "skipped_no_text": stats.skipped_no_text,
                "failed": stats.failed,
                "duration_s": dur,
                "records_per_s": stats.processed / dur,
                "translation_backend": translator.backend_name,
                "translation_model": getattr(translator, "model", None),
                "translation_stats": tstats.__dict__,
                "dry_run": bool(args.dry_run),
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    return 0 if stats.failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
