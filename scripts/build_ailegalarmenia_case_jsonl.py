from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Iterable

# When this script is executed as a file (py scripts/...py), Python adds the
# script directory to sys.path, not the repo root. We need repo root for `src.*`.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# Local python modules live in repo `src/` (alongside TS). We keep imports absolute.
from src.translation.translator import (  # noqa: E402
    OllamaTranslator,
    NoopTranslator,
    TranslationCache,
    TranslationStats,
)
from src.transform.case_enricher import CaseEnricher  # noqa: E402
from src.validation.case_schema import (  # noqa: E402
    EnrichmentStripper,
    validate_jsonl_file,
    validate_preservation_for_pairs,
)


def _iter_json_records(path: Path) -> Iterable[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".jsonl":
        with path.open("r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError as e:  # noqa: PERF203
                    raise ValueError(f"Invalid JSON at {path}:{line_no}: {e}") from e
                if not isinstance(obj, dict):
                    raise ValueError(f"Expected JSON object per line at {path}:{line_no}")
                yield obj
        return

    if suffix == ".json":
        obj = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(obj, list):
            for i, item in enumerate(obj):
                if not isinstance(item, dict):
                    raise ValueError(f"Expected list of objects in {path}, got {type(item)} at index {i}")
                yield item
            return
        if isinstance(obj, dict):
            yield obj
            return
        raise ValueError(f"Expected JSON object or array in {path}, got {type(obj)}")

    raise ValueError(f"Unsupported input extension for {path} (expected .jsonl or .json)")


def _resolve_input_paths(raw_paths: list[str]) -> list[Path]:
    out: list[Path] = []
    for raw in raw_paths:
        p = Path(raw)
        if not p.is_absolute():
            p = (Path(__file__).resolve().parent.parent / p).resolve()
        if not p.exists():
            raise FileNotFoundError(str(p))
        out.append(p)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build Armenian-enriched JSONL for AILEGALARMENIA from ECtHR-style JSON/JSONL case records."
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        help="Input JSON or JSONL file(s) (ECtHR-style records).",
    )
    parser.add_argument(
        "--output",
        default="output/ailegalarmenia_cases_hy_enriched.jsonl",
        help="Output JSONL path (one enriched JSON object per line).",
    )
    parser.add_argument(
        "--report",
        default="output/ailegalarmenia_translation_report.json",
        help="Report JSON path (stats + failures).",
    )
    parser.add_argument(
        "--backend",
        default="ollama",
        choices=["ollama", "noop"],
        help="Translation backend: ollama (local) or noop (no translation).",
    )
    parser.add_argument(
        "--target-lang",
        default="hy",
        help="Target language code (default: hy).",
    )
    parser.add_argument(
        "--source-lang",
        default="en",
        help="Source language code hint for prompts (default: en).",
    )
    parser.add_argument(
        "--ollama-url",
        default="http://127.0.0.1:11434",
        help="Ollama base URL (default: http://127.0.0.1:11434).",
    )
    parser.add_argument(
        "--ollama-model",
        default="gemma4:e4b",
        help="Ollama model (default: gemma4:e4b).",
    )
    parser.add_argument(
        "--ollama-timeout-s",
        type=float,
        default=120.0,
        help="Per-request timeout in seconds (default: 120).",
    )
    parser.add_argument(
        "--cache-path",
        default="output/translation_cache.sqlite",
        help="SQLite cache path for exact string translations.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max records to process across all inputs (0 = no limit).",
    )
    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Skip this many records before processing (across all inputs).",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate output JSONL and preservation (for processed records).",
    )
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parent.parent
    output_path = (repo_root / args.output).resolve() if not Path(args.output).is_absolute() else Path(args.output)
    report_path = (repo_root / args.report).resolve() if not Path(args.report).is_absolute() else Path(args.report)
    cache_path = (repo_root / args.cache_path).resolve() if not Path(args.cache_path).is_absolute() else Path(args.cache_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.parent.mkdir(parents=True, exist_ok=True)

    inputs = _resolve_input_paths(args.inputs)

    cache = TranslationCache(cache_path=cache_path)
    stats = TranslationStats()
    if args.backend == "ollama":
        translator = OllamaTranslator(
            base_url=args.ollama_url,
            model=args.ollama_model,
            cache=cache,
            stats=stats,
            timeout_s=args.ollama_timeout_s,
        )
    else:
        translator = NoopTranslator(cache=cache, stats=stats)

    enricher = CaseEnricher(
        translator=translator,
        target_lang=args.target_lang,
        source_lang=args.source_lang,
    )

    processed = 0
    attempted = 0
    failed_records: list[dict[str, Any]] = []
    preservation_pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []

    started = time.time()
    with output_path.open("w", encoding="utf-8", newline="\n") as out_f:
        for input_path in inputs:
            for record in _iter_json_records(input_path):
                attempted += 1
                if args.offset and attempted <= args.offset:
                    continue
                if args.limit and processed >= args.limit:
                    break
                try:
                    enriched = enricher.enrich(record)
                    out_f.write(json.dumps(enriched, ensure_ascii=False))
                    out_f.write("\n")
                    processed += 1
                    if args.validate:
                        preservation_pairs.append((record, enriched))
                except Exception as e:  # noqa: BLE001
                    failed_records.append(
                        {
                            "input": str(input_path),
                            "error": str(e),
                            "record_hint": {
                                "itemid": record.get("itemid"),
                                "appno": record.get("appno"),
                                "docname": record.get("docname"),
                            },
                        }
                    )
            if args.limit and processed >= args.limit:
                break

    duration_s = max(0.001, time.time() - started)

    report = {
        "inputs": [str(p) for p in inputs],
        "output_jsonl": str(output_path),
        "processed_records": processed,
        "failed_records": len(failed_records),
        "duration_s": duration_s,
        "records_per_s": processed / duration_s,
        "translation_backend": translator.backend_name,
        "translation_model": getattr(translator, "model", None),
        "translation_stats": asdict(stats),
        "failures": failed_records[:2000],  # cap to avoid runaway files
    }

    if args.validate:
        # 1) JSONL parse sanity for whole output
        jsonl_validation = validate_jsonl_file(output_path)
        report["validation_jsonl"] = jsonl_validation

        # 2) Strict preservation check for the records we processed in this run.
        #    (For huge datasets, validating all pairs would require re-reading both files; we instead
        #    check the in-memory pairs for this invocation.)
        stripper = EnrichmentStripper()
        preservation_validation = validate_preservation_for_pairs(preservation_pairs, stripper=stripper)
        report["validation_preservation"] = preservation_validation

    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                "output": str(output_path),
                "report": str(report_path),
                "processed_records": processed,
                "failed_records": len(failed_records),
                "backend": translator.backend_name,
                "model": getattr(translator, "model", None),
                "translation_stats": asdict(stats),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if not failed_records else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
