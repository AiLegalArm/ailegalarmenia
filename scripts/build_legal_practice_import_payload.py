from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Wrap generated legal practice items into bulkItems payload."
    )
    parser.add_argument("items_json", help="Path to generated *_items.json file")
    parser.add_argument("--output", required=True, help="Path to output payload JSON")
    parser.add_argument(
        "--import-ref", default="arlis-batch", help="Import reference label"
    )
    args = parser.parse_args()

    items_path = Path(args.items_json)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    items = json.loads(items_path.read_text(encoding="utf-8"))
    payload = {
        "bulkItems": items,
        "importRef": args.import_ref,
    }

    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {"items": len(items), "output": str(output_path)},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
