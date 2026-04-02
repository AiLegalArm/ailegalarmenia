from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pdfplumber
from pypdf import PdfReader


ARMENIAN_MONTHS = {
    "հունվարի": "01",
    "հունվար": "01",
    "փետրվարի": "02",
    "փետրվար": "02",
    "մարտի": "03",
    "մարտ": "03",
    "ապրիլի": "04",
    "ապրիլ": "04",
    "մայիսի": "05",
    "մայիս": "05",
    "հունիսի": "06",
    "հունիս": "06",
    "հուլիսի": "07",
    "հուլիս": "07",
    "օգոստոսի": "08",
    "օգոստոս": "08",
    "սեպտեմբերի": "09",
    "սեպտեմբեր": "09",
    "հոկտեմբերի": "10",
    "հոկտեմբեր": "10",
    "նոյեմբերի": "11",
    "նոյեմբեր": "11",
    "դեկտեմբերի": "12",
    "դեկտեմբեր": "12",
}

CASE_NUMBER_RE = re.compile(
    r"ՍԴՈ-\d+|[Ա-Ֆ]{2,5}[/-]\d{1,5}[/-]\d{1,4}[/-]\d{2,4}|[Ա-Ֆ]{2,5}\d{6,}|3-\d{1,6}[Ա-ՖA-Z]{0,3}|ՎԲ-\d{3,6}-?\d{2}"
)
DOC_ID_RE = re.compile(r"DocumentView\.aspx\?DocID=(\d+)")
NUMERIC_DATE_RE = re.compile(r"(\d{1,2})[./](\d{1,2})[./](\d{4})")
ARMENIAN_DATE_RE = re.compile(
    r"(\d{1,2})\s+(%s)\s+(\d{4})" % "|".join(map(re.escape, ARMENIAN_MONTHS.keys())),
    re.IGNORECASE,
)

ARTICLE_PATTERNS = [
    (
        "ՀՀ Սահմանադրություն",
        re.compile(r"Սահմանադրության\s+(\d+(?:-րդ)?)\s+հոդված", re.IGNORECASE),
    ),
    (
        "ՀՀ քաղաքացիական օրենսգիրք",
        re.compile(
            r"քաղաքացիական օրենսգրքի\s+(\d+(?:\.\d+)?(?:-րդ)?)\s+հոդված", re.IGNORECASE
        ),
    ),
    (
        "ՀՀ քաղաքացիական դատավարության օրենսգիրք",
        re.compile(
            r"քաղաքացիական դատավարության օրենսգրքի\s+(\d+(?:\.\d+)?(?:-րդ)?)\s+հոդված",
            re.IGNORECASE,
        ),
    ),
    (
        "ՀՀ քրեական օրենսգիրք",
        re.compile(
            r"քրեական օրենսգրքի\s+(\d+(?:\.\d+)?(?:-րդ)?)\s+հոդված", re.IGNORECASE
        ),
    ),
    (
        "ՀՀ քրեական դատավարության օրենսգիրք",
        re.compile(
            r"քրեական դատավարության օրենսգրքի\s+(\d+(?:\.\d+)?(?:-րդ)?)\s+հոդված",
            re.IGNORECASE,
        ),
    ),
    (
        "ՀՀ վարչական դատավարության օրենսգիրք",
        re.compile(
            r"վարչական դատավարության օրենսգրքի\s+(\d+(?:\.\d+)?(?:-րդ)?)\s+հոդված",
            re.IGNORECASE,
        ),
    ),
    (
        "Մարդու իրավունքների և հիմնարար ազատությունների պաշտպանության մասին եվրոպական կոնվենցիա",
        re.compile(
            r"եվրոպական կոնվենցիայի\s+(\d+(?:\.\d+)?(?:-րդ)?)\s+հոդված", re.IGNORECASE
        ),
    ),
    (
        "«Սահմանադրական դատարանի մասին» ՀՀ օրենք",
        re.compile(
            r"Սահմանադրական դատարանի մասին\s+Հայաստանի Հանրապետության օրենքի\s+([\d,\sև]+)-րդ\s+հոդված",
            re.IGNORECASE,
        ),
    ),
]


@dataclass
class ManifestItem:
    file_name: str
    absolute_path: str
    bucket: str
    practice_category: str | None = None
    court_type: str | None = None


def load_manifest(path: Path) -> list[ManifestItem]:
    items = json.loads(path.read_text(encoding="utf-8"))
    return [ManifestItem(**item) for item in items]


def pair_deduplicate_token(token: str) -> str:
    if len(token) < 4 or len(token) % 2 != 0:
        return token
    pairs = [token[i : i + 2] for i in range(0, len(token), 2)]
    if (
        sum(1 for pair in pairs if len(pair) == 2 and pair[0] == pair[1]) / len(pairs)
        < 0.8
    ):
        return token
    return "".join(pair[0] for pair in pairs)


def clean_extracted_text(raw_text: str) -> str:
    lines: list[str] = []
    seen_short_lines: dict[str, int] = {}

    for raw_line in raw_text.splitlines():
        line = " ".join(pair_deduplicate_token(token) for token in raw_line.split())
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        if re.fullmatch(r"https?://\S+\s+\d+/\d+", line):
            continue
        if re.fullmatch(r"https?://\S+", line):
            continue
        if re.fullmatch(r"\d+/\d+", line):
            continue
        if re.fullmatch(r"\d+", line):
            continue
        if (
            line.startswith("PDF PARSED TEXT")
            or line.startswith("<PARSED TEXT")
            or line.startswith("<IMAGE FOR PAGE")
        ):
            continue

        if len(line) < 140:
            seen_short_lines[line] = seen_short_lines.get(line, 0) + 1
        lines.append(line)

    filtered = [
        line
        for line in lines
        if not (len(line) < 140 and seen_short_lines.get(line, 0) >= 3)
    ]
    text = "\n".join(filtered)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text_with_pdfplumber(pdf_path: Path) -> str:
    chunks: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


def extract_text_with_pypdf(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def extract_text(pdf_path: Path) -> str:
    raw = extract_text_with_pdfplumber(pdf_path)
    if len(raw.strip()) < 500:
        fallback = extract_text_with_pypdf(pdf_path)
        if len(fallback.strip()) > len(raw.strip()):
            raw = fallback
    return clean_extracted_text(raw)


def extract_raw_and_clean_text(pdf_path: Path) -> tuple[str, str]:
    raw = extract_text_with_pdfplumber(pdf_path)
    if len(raw.strip()) < 500:
        fallback = extract_text_with_pypdf(pdf_path)
        if len(fallback.strip()) > len(raw.strip()):
            raw = fallback
    return raw, clean_extracted_text(raw)


def infer_case_number(file_name: str, text: str) -> str | None:
    for candidate in [text[:4000], file_name]:
        match = CASE_NUMBER_RE.search(candidate)
        if match:
            return match.group(0).replace("-Ի", "").replace("-ի", "")
    return None


def infer_date(text: str) -> str | None:
    for line in text.splitlines()[:40]:
        if "Ընդունման ամսաթիվը" in line or "Ստորագրման ամսաթիվը" in line:
            numeric = NUMERIC_DATE_RE.search(line)
            if numeric:
                day, month, year = numeric.groups()
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        numeric = NUMERIC_DATE_RE.search(line)
        if numeric:
            day, month, year = numeric.groups()
            month_num = int(month)
            day_num = int(day)
            if 1 <= month_num <= 12 and 1 <= day_num <= 31:
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        arm = ARMENIAN_DATE_RE.search(line.lower())
        if arm:
            day, month_name, year = arm.groups()
            month = ARMENIAN_MONTHS[month_name]
            return f"{year}-{month}-{day.zfill(2)}"
    return None


def infer_title(file_name: str, text: str) -> str:
    first_lines = [line.strip() for line in text.splitlines()[:12] if line.strip()]
    for line in first_lines:
        if "ՈՐՈՇՈՒՄԸ" in line or "ՎՃԻՌԸ" in line:
            return line[:500]
    return file_name.removesuffix(".pdf").lstrip("_").strip()[:500]


def infer_outcome(text: str, court_type: str) -> str:
    tail = extract_decision_section(text)
    tail_lower = tail.lower()
    if court_type == "constitutional":
        constitutional_tail = text[-12000:]
        constitutional_tail_lower = constitutional_tail.lower()
        if "չի համապատասխանում" in constitutional_tail_lower:
            return "rejected"
        if (
            "համապատասխանում են" in constitutional_tail_lower
            or "համապատասխանում է" in constitutional_tail_lower
        ):
            return "granted"
        if (
            "կարճել" in constitutional_tail_lower
            and "վարույթ" in constitutional_tail_lower
        ):
            return "discontinued"
        return "granted"
    if "կարճել" in tail_lower:
        return "discontinued"
    if "նոր քննության" in tail_lower or (
        "ուղարկել" in tail_lower and "նոր քննության" in tail_lower
    ):
        return "remanded"
    if (
        "մասնակիորեն" in tail_lower and "բավարար" in tail_lower
    ) or "մասամբ" in tail_lower:
        return "partial"
    if (
        "թողնել օրինական ուժի մեջ" in tail_lower
        and "բողոքը բավարարել" not in tail_lower
    ):
        return "rejected"
    if (
        "ենթակա է մերժման" in tail_lower
        or "միջնորդությունը ենթակա էր մերժման" in tail_lower
    ):
        return "rejected"
    if (
        "ենթակա էր մերժման" in tail_lower
        or "պետք է թողնվեր օրինական ուժի մեջ" in tail_lower
    ):
        return "rejected"
    if "բավարար չէ" in tail_lower and "բեկանելու համար" in tail_lower:
        return "rejected"
    if "վճռաբեկ բողոքը մերժել" in tail_lower or "բողոքը մերժել" in tail_lower:
        return "rejected"
    if (
        "վճռաբեկ բողոքը բավարարել" in tail_lower
        or "բողոքը բավարարել" in tail_lower
        or "վճիռը բեկանել" in tail_lower
        or "օրինական ուժ տալ" in tail_lower
    ):
        return "granted"
    return "granted" if court_type in {"constitutional", "echr"} else "unknown"


def extract_decision_section(text: str) -> str:
    for marker in ["ՈՐՈՇԵՑ", "Ո Ր Ո Շ Ե Ց", "ՈՐՈՇԵՑ.", "ՎՃՌԵՑ"]:
        idx = text.rfind(marker)
        if idx != -1:
            return text[idx:]
    return text[-5000:]


def infer_court_name(court_type: str) -> str:
    return {
        "cassation": "ՀՀ վճռաբեկ դատարան",
        "constitutional": "ՀՀ Սահմանադրական դատարան",
        "echr": "Մարդու իրավունքների եվրոպական դատարան",
    }[court_type]


def infer_practice_category(item: ManifestItem, text: str) -> str:
    if item.practice_category and item.practice_category != "unknown":
        return item.practice_category
    header = text[:8000]
    header_lower = header.lower()
    if "քրեական գործ" in header_lower:
        return "criminal"
    if "քաղաքացիական գործ" in header_lower or "սնանկության գործ" in header_lower:
        return "civil"
    if "վարչական գործ" in header_lower:
        return "administrative"
    if "քրեական պալատ" in header_lower or "քրեական վերաքննիչ դատարան" in header_lower:
        return "criminal"
    if "տնտեսական դատարան" in header_lower or "տնտեսական գործ" in header_lower:
        return "civil"
    if "քաղաքացիական պալատ" in header_lower:
        return "civil"
    if "քաղաքացիական և վարչական պալատ" in header_lower:
        if "վարչական" in header_lower and "քաղաքացիական գործ" not in header_lower:
            return "administrative"
        return "civil"
    if "վարչական դատարան" in header_lower or "վարչական դատավար" in header_lower:
        return "administrative"
    if "քաղաքացիական դատարան" in header_lower or "քաղաքացիական դատավար" in header_lower:
        return "civil"
    return "unknown"


def infer_source_url(text: str) -> str | None:
    match = DOC_ID_RE.search(text)
    if not match:
        return None
    return f"http://www.arlis.am/DocumentView.aspx?DocID={match.group(1)}"


def extract_applied_articles(text: str) -> dict[str, Any]:
    sources: list[dict[str, Any]] = []
    for act_name, pattern in ARTICLE_PATTERNS:
        numbers: set[str] = set()
        for match in pattern.finditer(text):
            raw = match.group(1)
            fragments = re.split(r"[\s,և]+", raw)
            for fragment in fragments:
                cleaned = fragment.strip().replace("-րդ", "")
                if cleaned and any(ch.isdigit() for ch in cleaned):
                    numbers.add(cleaned)
        if numbers:
            sources.append(
                {
                    "act": act_name,
                    "articles": [
                        {"article": number}
                        for number in sorted(
                            numbers,
                            key=lambda v: [
                                int(p) if p.isdigit() else p
                                for p in re.split(r"[.-]", v)
                            ],
                        )
                    ],
                }
            )
    return {"sources": sources}


def summarize_reasoning(text: str, court_type: str, outcome: str) -> str:
    markers = [
        "Վճռաբեկ դատարանը գտնում է",
        "Սահմանադրական դատարանը գտնում է",
        "Եվրոպական դատարանը գտնում է",
        "Ելնելով վերոգրյալից",
    ]
    for marker in markers:
        idx = text.find(marker)
        if idx != -1:
            snippet = text[idx : idx + 1200]
            snippet = snippet.split("ՈՐՈՇԵՑ")[0].strip()
            snippet = re.sub(r"\s+", " ", snippet)
            return snippet[:1000]

    tail = re.sub(r"\s+", " ", text[-1500:]).strip()
    fallback = tail[:900]
    if fallback:
        return fallback
    return f"{infer_court_name(court_type)} գործով ելքը՝ {outcome}։"


def build_record(item: ManifestItem) -> dict[str, Any]:
    pdf_path = Path(item.absolute_path)
    raw_text, text = extract_raw_and_clean_text(pdf_path)
    case_number = infer_case_number(item.file_name, text)
    outcome = infer_outcome(text, item.court_type or "cassation")

    return {
        "title": infer_title(item.file_name, text),
        "practice_category": infer_practice_category(item, text),
        "court_type": item.court_type,
        "outcome": outcome,
        "court_name": infer_court_name(item.court_type or "cassation"),
        "case_number_anonymized": case_number,
        "decision_date": infer_date(text),
        "applied_articles": extract_applied_articles(text),
        "key_violations": [],
        "legal_reasoning_summary": summarize_reasoning(
            text, item.court_type or "cassation", outcome
        ),
        "content_text": text,
        "source_name": "ARLIS",
        "source_url": infer_source_url(raw_text) or infer_source_url(text),
        "description": item.file_name.removesuffix(".pdf").lstrip("_").strip(),
        "file_name": item.file_name,
        "absolute_path": item.absolute_path,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert ARLIS judicial practice PDFs into import-ready JSON."
    )
    parser.add_argument("manifest", help="Path to legal_practice manifest JSON")
    parser.add_argument(
        "--output",
        default="data/generated_legal_practice/legal_practice_sample.json",
        help="Output JSON file",
    )
    parser.add_argument(
        "--limit", type=int, default=100, help="Max documents to convert"
    )
    parser.add_argument(
        "--offset", type=int, default=0, help="Start offset in manifest"
    )
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    items = load_manifest(manifest_path)
    batch = items[args.offset : args.offset + args.limit]

    records: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for item in batch:
        try:
            records.append(build_record(item))
        except Exception as exc:  # noqa: BLE001
            failures.append({"file_name": item.file_name, "error": str(exc)})

    payload = {
        "manifest": str(manifest_path),
        "offset": args.offset,
        "limit": args.limit,
        "converted": len(records),
        "failed": failures,
        "items": records,
    }
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    items_only_path = output_path.with_name(f"{output_path.stem}_items.json")
    items_only_path.write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "converted": len(records),
                "failed": len(failures),
                "output": str(output_path),
                "items_only": str(items_only_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
