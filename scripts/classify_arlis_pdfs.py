from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path


LEGAL_PRACTICE_PREFIXES = {
    "cassation": "_ՀՀ ՎՃՌԱԲԵԿ ԴԱՏԱՐԱՆԻ ՈՐՈՇՈՒՄԸ",
    "constitutional": "_ՀՀ ՍԱՀՄԱՆԱԴՐԱԿԱՆ ԴԱՏԱՐԱՆԻ ՈՐՈՇՈՒՄԸ",
    "echr": "_ՄԱՐԴՈՒ ԻՐԱՎՈՒՆՔՆԵՐԻ ԵՎՐՈՊԱԿԱՆ ԴԱՏԱՐԱՆ",
}


def infer_practice_category(file_name: str, court_bucket: str) -> str:
    if court_bucket == "constitutional":
        return "constitutional"
    if court_bucket == "echr":
        return "echr"

    upper_name = file_name.upper()
    if "ՔՐԵԱԿԱՆ ԳՈՐԾ" in upper_name:
        return "criminal"
    if "ՔԱՂԱՔԱՑԻԱԿԱՆ ԳՈՐԾ" in upper_name:
        return "civil"
    if "ՎԱՐՉԱԿԱՆ ԳՈՐԾ" in upper_name:
        return "administrative"
    return "unknown"


@dataclass
class ManifestRow:
    file_name: str
    absolute_path: str
    bucket: str
    practice_category: str | None = None
    court_type: str | None = None


def classify_pdf(pdf_path: Path) -> ManifestRow:
    file_name = pdf_path.name.strip()
    for bucket, prefix in LEGAL_PRACTICE_PREFIXES.items():
        if file_name.startswith(prefix):
            practice_category = infer_practice_category(file_name, bucket)
            court_type = {
                "cassation": "cassation",
                "constitutional": "constitutional",
                "echr": "echr",
            }[bucket]
            return ManifestRow(
                file_name=file_name,
                absolute_path=str(pdf_path),
                bucket="legal_practice",
                practice_category=practice_category,
                court_type=court_type,
            )

    return ManifestRow(
        file_name=file_name,
        absolute_path=str(pdf_path),
        bucket="knowledge_base",
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Classify ARLIS PDFs into legal practice and knowledge base."
    )
    parser.add_argument("source_dir", help="Directory containing ARLIS PDF files")
    parser.add_argument(
        "--output-dir",
        default="data/arlis_manifests",
        help="Directory for generated manifest files",
    )
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    if not source_dir.exists() or not source_dir.is_dir():
        raise SystemExit(f"Source directory not found: {source_dir}")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    legal_practice: list[dict[str, object]] = []
    legal_practice_by_court_type = {
        "cassation": [],
        "constitutional": [],
        "echr": [],
    }
    knowledge_base: list[dict[str, object]] = []
    summary = {
        "source_dir": str(source_dir),
        "total_pdfs": 0,
        "legal_practice_total": 0,
        "knowledge_base_total": 0,
        "legal_practice_by_court_type": {
            "cassation": 0,
            "constitutional": 0,
            "echr": 0,
        },
        "legal_practice_by_category": {
            "criminal": 0,
            "civil": 0,
            "administrative": 0,
            "constitutional": 0,
            "echr": 0,
            "unknown": 0,
        },
    }

    for pdf_path in sorted(source_dir.glob("*.pdf")):
        row = classify_pdf(pdf_path)
        summary["total_pdfs"] += 1

        row_dict = asdict(row)
        if row.bucket == "legal_practice":
            legal_practice.append(row_dict)
            legal_practice_by_court_type[row.court_type].append(row_dict)
            summary["legal_practice_total"] += 1
            summary["legal_practice_by_court_type"][row.court_type] += 1
            summary["legal_practice_by_category"][row.practice_category] += 1
        else:
            knowledge_base.append(row_dict)
            summary["knowledge_base_total"] += 1

    (output_dir / "legal_practice_manifest.json").write_text(
        json.dumps(legal_practice, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    for court_type, rows in legal_practice_by_court_type.items():
        (output_dir / f"legal_practice_{court_type}_manifest.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    (output_dir / "knowledge_base_manifest.json").write_text(
        json.dumps(knowledge_base, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
