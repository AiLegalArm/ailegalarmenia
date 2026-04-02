from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def run_command(command: list[str], cwd: Path) -> None:
    completed = subprocess.run(
        command, cwd=str(cwd), check=True, text=True, capture_output=True
    )
    if completed.stdout.strip():
        print(completed.stdout.strip())
    if completed.stderr.strip():
        print(completed.stderr.strip())


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Batch-convert and import legal practice manifests."
    )
    parser.add_argument("manifest", help="Path to legal-practice manifest JSON")
    parser.add_argument("--base-url", required=True, help="Supabase project URL")
    parser.add_argument(
        "--service-role-key", required=True, help="Supabase service role key"
    )
    parser.add_argument(
        "--batch-prefix", required=True, help="Import ref prefix, e.g. arlis-cassation"
    )
    parser.add_argument(
        "--start-offset", type=int, default=0, help="Manifest offset to start from"
    )
    parser.add_argument(
        "--batch-size", type=int, default=100, help="Manifest batch size"
    )
    parser.add_argument(
        "--max-batches",
        type=int,
        default=999999,
        help="Safety cap on number of batches",
    )
    parser.add_argument(
        "--node-batch-size",
        type=int,
        default=5,
        help="Insert batch size for node importer",
    )
    parser.add_argument(
        "--output-dir",
        default="data/generated_legal_practice",
        help="Output directory for generated files",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    manifest_path = (
        (repo_root / args.manifest).resolve()
        if not Path(args.manifest).is_absolute()
        else Path(args.manifest)
    )
    manifest_items = json.loads(manifest_path.read_text(encoding="utf-8"))
    total = len(manifest_items)
    output_dir = (repo_root / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    batch_count = 0
    summary: list[dict[str, int | str]] = []
    for offset in range(args.start_offset, total, args.batch_size):
        if batch_count >= args.max_batches:
            break
        batch_index = offset // args.batch_size + 1
        base_name = f"{args.batch_prefix}_batch_{offset + args.batch_size}"
        output_json = output_dir / f"{base_name}.json"
        items_json = output_dir / f"{base_name}_items.json"
        filtered_json = output_dir / f"{base_name}_filtered_items.json"
        import_ref_prefix = f"{args.batch_prefix}-{offset:05d}"

        run_command(
            [
                "py",
                "scripts/convert_arlis_legal_practice.py",
                str(manifest_path),
                "--limit",
                str(args.batch_size),
                "--offset",
                str(offset),
                "--output",
                str(output_json),
            ],
            repo_root,
        )

        items = json.loads(items_json.read_text(encoding="utf-8"))
        filtered = [
            item
            for item in items
            if item.get("practice_category") != "unknown"
            and item.get("outcome") != "unknown"
        ]
        filtered_json.write_text(
            json.dumps(filtered, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        if filtered:
            run_command(
                [
                    "node",
                    "scripts/direct_import_legal_practice.mjs",
                    str(filtered_json),
                    args.base_url,
                    args.service_role_key,
                    import_ref_prefix,
                    str(args.node_batch_size),
                ],
                repo_root,
            )

            run_command(
                [
                    "node",
                    "scripts/upsert_practice_jobs_for_import.mjs",
                    args.base_url,
                    args.service_role_key,
                    f"{import_ref_prefix}:",
                ],
                repo_root,
            )

        summary.append(
            {
                "offset": offset,
                "batch_index": batch_index,
                "source_items": len(items),
                "filtered_items": len(filtered),
                "import_ref_prefix": import_ref_prefix,
            }
        )
        batch_count += 1

    summary_path = output_dir / f"{args.batch_prefix}_pipeline_summary.json"
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {"batches": batch_count, "summary_path": str(summary_path)},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
