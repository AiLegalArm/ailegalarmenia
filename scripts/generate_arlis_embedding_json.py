from __future__ import annotations

import argparse
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import pdfplumber
from pypdf import PdfReader


DOC_ID_RE = re.compile(r"DocumentView\.aspx\?DocID=(\d+)")
NUMERIC_DATE_RE = re.compile(r"(\d{1,2})[./](\d{1,2})[./](\d{4})")
ARM_MONTHS = {
    "հունվարի": "01",
    "փետրվարի": "02",
    "մարտի": "03",
    "ապրիլի": "04",
    "մայիսի": "05",
    "հունիսի": "06",
    "հուլիսի": "07",
    "օգոստոսի": "08",
    "սեպտեմբերի": "09",
    "հոկտեմբերի": "10",
    "նոյեմբերի": "11",
    "դեկտեմբերի": "12",
}
ARM_DATE_RE = re.compile(
    r"(\d{1,2})\s+(%s)\s+(\d{4})" % "|".join(map(re.escape, ARM_MONTHS.keys())),
    re.IGNORECASE,
)
CASE_NUMBER_RE = re.compile(
    r"ՍԴՈ-\d+|[Ա-ՖA-Z]{1,6}[/-]\d{1,6}(?:[/-]\d{1,6}){0,2}|ՎԲ-\d{1,6}(?:-\d{1,6})*|[0-9]{2,4}[Ա-ՖA-Z]?[/-][0-9]{1,6}(?:[/-][0-9]{1,6})*"
)

LEGAL_MARKERS = {
    "constitutional": re.compile(r"Հ[ՀՀ]?\s*ՍԱՀՄԱՆԱԴՐԱԿԱՆ ԴԱՏԱՐԱՆ", re.I),
    "echr": re.compile(
        r"ՄԱՐԴՈՒ ԻՐԱՎՈՒՆՔՆԵՐԻ ԵՎՐՈՊԱԿԱՆ ԴԱՏԱՐԱՆԻ ՎՃԻՌ|ԵՎՐՈՊԱԿԱՆ ԴԱՏԱՐԱՆԻ ՎՃԻՌ", re.I
    ),
    "cassation": re.compile(r"Հ[ՀՀ]?\s*ՎՃՌԱԲԵԿ ԴԱՏԱՐԱՆԻ ՈՐՈՇՈՒՄ", re.I),
}
STRICT_PRACTICE_NEGATIVE_RE = re.compile(
    r"ԿԱՌԱՎԱՐՈՒԹՅԱՆ ՈՐՈՇՈՒՄ|ՎԱՐՉԱՊԵՏԻ ՈՐՈՇՈՒՄ|ՔԱՂԱՔԱՊԵՏԻ ՈՐՈՇՈՒՄ|ՆԱԽԱՐԱՐԻ ՀՐԱՄԱՆ|"
    r"ԲԱՐՁՐԱԳՈՒՅՆ ԴԱՏԱԿԱՆ ԽՈՐՀՐԴԻ ՈՐՈՇՈՒՄ|ԱԶԳԱՅԻՆ ԺՈՂՈՎԻ ՈՐՈՇՈՒՄ|ՆԱԽԱԳԱՀԻ ՀՐԱՄԱՆԱԳԻՐ",
    re.I,
)

INTERNATIONAL_RE = re.compile(
    r"ՀԱՄԱՁԱՅՆԱԳԻՐ|ԿՈՆՎԵՆՑԻԱ|ԱՐՁԱՆԱԳՐՈՒԹՅՈՒՆ|ԽԱՐՏԻԱ|ԴԱՇՆԱԳԻՐ", re.I
)
NON_PRACTICE_JUDICIAL_ACT_RE = re.compile(
    r"ԲԱՐՁՐԱԳՈՒՅՆ ԴԱՏԱԿԱՆ ԽՈՐՀՐԴԻ ՈՐՈՇՈՒՄ|ԱՐԴԱՐԱԴԱՏՈՒԹՅԱՆ ԽՈՐՀՐԴԻ ՈՐՈՇՈՒՄ|ԴԱՏԱՎՈՐԻ ԹԵԿՆԱԾՈՒ ԸՆՏՐԵԼՈՒ ՄԱՍԻՆ|ՆԱԽԱԳԱՀ ԸՆՏՐԵԼՈՒ ՄԱՍԻՆ|ԿԱՐԳԱՊԱՀԱԿԱՆ ՊԱՏԱՍԽԱՆԱՏՎՈՒԹՅԱՆ|ԿԱՐԳԱՊԱՀԱԿԱՆ ՊԱՏԱՍԽԱՆԱ",
    re.I,
)
TITLE_MARKER_RE = re.compile(
    r"ՈՐՈՇՈՒՄ|ՕՐԵՆՔ|ՀՐԱՄԱՆ|ՀԱՄԱՁԱՅՆԱԳԻՐ|ԿՈՆՎԵՆՑԻԱ|ԱՐՁԱՆԱԳՐՈՒԹՅՈՒՆ|ԿԱՐԳ|ԿԱՆՈՆԱԴՐՈՒԹՅՈՒՆ",
    re.I,
)
TITLE_SKIP_RE = re.compile(
    r"^(ՀԱՄԱՐԸ|ՏԵՍԱԿԸ|ՏԻՊԸ|ԿԱՐԳԱՎԻՃԱԿԸ|ՍԿԶԲՆԱՂԲՅՈՒՐԸ|ԸՆԴՈՒՆՄԱՆ ՎԱՅՐԸ|ԸՆԴՈՒՆՈՂ ՄԱՐՄԻՆԸ|"
    r"ԸՆԴՈՒՆՄԱՆ ԱՄՍԱԹԻՎԸ|ՍՏՈՐԱԳՐՈՂ ՄԱՐՄԻՆԸ|ՍՏՈՐԱԳՐՄԱՆ ԱՄՍԱԹԻՎԸ|ՎԱՎԵՐԱՑՆՈՂ ՄԱՐՄԻՆԸ|"
    r"ՎԱՎԵՐԱՑՄԱՆ ԱՄՍԱԹԻՎԸ|ՈՒԺԻ ՄԵՋ ՄՏՆԵԼՈՒ ԱՄՍԱԹԻՎԸ|ՈՒԺԸ ԿՈՐՑՆԵԼՈՒ ԱՄՍԱԹԻՎԸ|"
    r"ԿԱՊԵՐ ԱՅԼ ՓԱՍՏԱԹՂԹԵՐԻ ՀԵՏ|ՓՈՓՈԽՈՂՆԵՐ ԵՎ ԻՆԿՈՐՊՈՐԱՑԻԱՆԵՐ|ԾԱՆՈՒՑՈՒՄ|ՀԱՅԱՍՏԱՆԻ ՀԱՆՐԱՊԵՏՈՒԹՅԱՆ|"
    r"Ո Ր Ո Շ ՈՒ Մ|Օ Ր Ե Ն Ք Ը|Հ Ր Ա Մ Ա Ն|N\s*[0-9Ա-ՖA-Z/-]+|[0-9./-]+)$",
    re.I,
)
TITLE_HEADER_ONLY_RE = re.compile(r"^(Ո Ր Ո Շ ՈՒ Մ(?: Ը)?|Օ Ր Ե Ն Ք Ը|Հ Ր Ա Մ Ա Ն)$", re.I)
TITLE_NOISE_RE = re.compile(r"Անցումային դրույթ|անցումային դրույթ|^Հոդված\s*\d+\.?$", re.I)

KB_CATEGORY_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("constitution", re.compile(r"\bՍԱՀՄԱՆԱԴՐՈՒԹՅՈՒՆ\b", re.I)),
    ("constitutional_law", re.compile(r"ՍԱՀՄԱՆԱԴՐԱԿԱՆ ՕՐԵՆՔ", re.I)),
    ("civil_code", re.compile(r"ՔԱՂԱՔԱՑԻԱԿԱՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    ("criminal_code", re.compile(r"ՔՐԵԱԿԱՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    ("labor_code", re.compile(r"ԱՇԽԱՏԱՆՔԱՅԻՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    ("family_code", re.compile(r"ԸՆՏԱՆԵԿԱՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    ("tax_code", re.compile(r"ՀԱՐԿԱՅԻՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    ("criminal_procedure_code", re.compile(r"ՔՐԵԱԿԱՆ ԴԱՏԱՎԱՐՈՒԹՅԱՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    ("civil_procedure_code", re.compile(r"ՔԱՂԱՔԱՑԻԱԿԱՆ ԴԱՏԱՎԱՐՈՒԹՅԱՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    (
        "administrative_procedure_code",
        re.compile(r"ՎԱՐՉԱԿԱՆ ՎԱՐՈՒՅԹԻ|ՎԱՐՉԱԿԱՆ ԴԱՏԱՎԱՐՈՒԹՅԱՆ ՕՐԵՆՍԳԻՐՔ", re.I),
    ),
    ("administrative_violations_code", re.compile(r"ՎԱՐՉԱԿԱՆ ԻՐԱՎԱԽԱԽՏՈՒՄՆԵՐԻ", re.I)),
    ("land_code", re.compile(r"ՀՈՂԱՅԻՆ ՕՐԵՆՍԳԻՐՔ|ՀՈՂԱՏԱՐԱԾՔ", re.I)),
    ("forest_code", re.compile(r"ԱՆՏԱՌԱՅԻՆ ՕՐԵՆՍԳԻՐՔ|ԱՆՏԱՌ", re.I)),
    ("water_code", re.compile(r"ՋՐԱՅԻՆ ՕՐԵՆՍԳԻՐՔ|ՋՐԱՅԻՆ", re.I)),
    ("urban_planning_code", re.compile(r"ՔԱՂԱՔԱՇԻՆՈՒԹՅԱՆ", re.I)),
    ("electoral_code", re.compile(r"ԸՆՏՐԱԿԱՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    ("state_duty_law", re.compile(r"ՊԵՏԱԿԱՆ ՏՈՒՐՔ", re.I)),
    ("citizenship_law", re.compile(r"ՔԱՂԱՔԱՑԻՈՒԹՅԱՆ ՄԱՍԻՆ", re.I)),
    (
        "public_service_law",
        re.compile(r"ՀԱՆՐԱՅԻՆ ԾԱՌԱՅՈՒԹՅԱՆ ՄԱՍԻՆ|ՔԱՂԱՔԱՑԻԱԿԱՆ ԾԱՌԱՅՈՒԹՅԱՆ ՄԱՍԻՆ", re.I),
    ),
    (
        "human_rights_law",
        re.compile(r"ՄԱՐԴՈՒ ԻՐԱՎՈՒՆՔ|ՔԱՂԱՔԱՑԻԱԿԱՆ ԵՎ ՔԱՂԱՔԱԿԱՆ ԻՐԱՎՈՒՆՔՆԵՐ", re.I),
    ),
    (
        "mass_media_law",
        re.compile(
            r"ԶԱՆԳՎԱԾԱՅԻՆ ԼՐԱՏՎԱՄԻՋՈՑՆԵՐ|ԳՈՎԱԶԴԻ ՄԱՍԻՆ|ՀԵՌՈՒՍՏԱՏԵՍՈՒԹՅԱՆ ԵՎ ՌԱԴԻՈՅԻ",
            re.I,
        ),
    ),
    ("education_law", re.compile(r"ԿՐԹՈՒԹՅԱՆ ՄԱՍԻՆ|ԲԱՐՁՐԱԳՈՒՅՆ ՈՒՍՈՒՄՆԱԿԱՆ", re.I)),
    ("healthcare_law", re.compile(r"ԱՌՈՂՋԱՊԱՀՈՒԹՅԱՆ ՄԱՍԻՆ", re.I)),
    (
        "echr",
        re.compile(
            r"ՄԱՐԴՈՒ ԻՐԱՎՈՒՆՔՆԵՐԻ ԵՎ ՀԻՄՆԱՐԱՐ ԱԶԱՏՈՒԹՅՈՒՆՆԵՐԻ ՊԱՇՏՊԱՆՈՒԹՅԱՆ ՄԱՍԻՆ", re.I
        ),
    ),
    ("eaeu_customs_code", re.compile(r"ԵԱՏՄ|ԵԱՏՄ-Ի|ՄԱՔՍԱՅԻՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    ("judicial_code", re.compile(r"ԴԱՏԱԿԱՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    (
        "judicial_code",
        re.compile(r"ԲԱՐՁՐԱԳՈՒՅՆ ԴԱՏԱԿԱՆ ԽՈՐՀՈՒՐԴ|ԱՐԴԱՐԱԴԱՏՈՒԹՅԱՆ ԽՈՐՀՈՒՐԴ", re.I),
    ),
    ("subsoil_code", re.compile(r"ԸՆԴԵՐՔԻ ՄԱՍԻՆ|ԸՆԴԵՐՔՕԳՏԱԳՈՐԾՄԱՆ", re.I)),
    ("penal_enforcement_code", re.compile(r"ՔՐԵԱԿԱՏԱՐՈՂԱԿԱՆ ՕՐԵՆՍԳԻՐՔ", re.I)),
    ("constitutional_court_decisions", re.compile(r"ՍԱՀՄԱՆԱԴՐԱԿԱՆ ԴԱՏԱՐԱՆ", re.I)),
    (
        "echr_judgments",
        re.compile(r"ՄԱՐԴՈՒ ԻՐԱՎՈՒՆՔՆԵՐԻ ԵՎՐՈՊԱԿԱՆ ԴԱՏԱՐԱՆ|ԵՎՐՈՊԱԿԱՆ ԴԱՏԱՐԱՆ", re.I),
    ),
    ("government_decisions", re.compile(r"ԿԱՌԱՎԱՐՈՒԹՅԱՆ ՈՐՈՇՈՒՄ", re.I)),
    (
        "central_electoral_commission_decisions",
        re.compile(r"ԿԵՆՏՐՈՆԱԿԱՆ ԸՆՏՐԱԿԱՆ ՀԱՆՁՆԱԺՈՂՈՎԻ ՈՐՈՇՈՒՄ", re.I),
    ),
    ("prime_minister_decisions", re.compile(r"ՎԱՐՉԱՊԵՏԻ ՈՐՈՇՈՒՄ", re.I)),
    ("ministry_of_health", re.compile(r"ԱՌՈՂՋԱՊԱՀՈՒԹՅԱՆ ՆԱԽԱՐԱՐ", re.I)),
]


@dataclass
class PreparedRow:
    target: str
    payload: dict[str, Any] | None
    review: dict[str, Any] | None = None
    stats_key: str | None = None


def extract_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    raw = "\n".join(page.extract_text() or "" for page in reader.pages)

    if len(raw.strip()) < 300:
        raw_parts: list[str] = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                raw_parts.append(page.extract_text() or "")
        fallback = "\n".join(raw_parts)
        if len(fallback.strip()) > len(raw.strip()):
            raw = fallback

    return clean_text(raw)


def pair_deduplicate_token(token: str) -> str:
    if len(token) < 2 or len(token) % 2 != 0:
        return token
    pairs = [token[i : i + 2] for i in range(0, len(token), 2)]
    if not pairs:
        return token
    duplicated_ratio = sum(
        1 for pair in pairs if len(pair) == 2 and pair[0] == pair[1]
    ) / len(pairs)
    if duplicated_ratio < 0.8:
        return token
    return "".join(pair[0] for pair in pairs)


def clean_text(raw: str) -> str:
    lines: list[str] = []
    previous_non_empty = ""
    for line in raw.replace("\r\n", "\n").split("\n"):
        line = " ".join(pair_deduplicate_token(token) for token in line.split())
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            lines.append("")
            continue
        if re.fullmatch(r"https?://\S+", line):
            continue
        if re.fullmatch(r"\d+/\d+", line):
            continue
        if line == previous_non_empty:
            continue
        lines.append(line)
        previous_non_empty = line
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_external_id(pdf_path: Path) -> str:
    return hashlib.sha1(str(pdf_path).encode("utf-8", errors="ignore")).hexdigest()


def infer_source_url(text: str) -> str | None:
    match = DOC_ID_RE.search(text)
    if match:
        return f"http://www.arlis.am/DocumentView.aspx?DocID={match.group(1)}"
    return None


def infer_date(text: str) -> str | None:
    for line in text.splitlines()[:40]:
        match = NUMERIC_DATE_RE.search(line)
        if match:
            day, month, year = match.groups()
            if 1 <= int(day) <= 31 and 1 <= int(month) <= 12:
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        arm = ARM_DATE_RE.search(line.lower())
        if arm:
            day, month_name, year = arm.groups()
            return f"{year}-{ARM_MONTHS[month_name]}-{day.zfill(2)}"
    return None


def infer_title(file_name: str, text: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip(" -\t") for line in text.splitlines()[:80]]
    lines = [line for line in lines if line]

    def collect_title(start: int) -> str | None:
        parts: list[str] = []
        for line in lines[start : start + 4]:
            if TITLE_SKIP_RE.match(line) or TITLE_NOISE_RE.search(line):
                if parts:
                    break
                continue
            if len(line) < 8:
                if parts:
                    break
                continue
            parts.append(line)
            if len(" ".join(parts)) >= 140:
                break
        if not parts:
            return None
        return " ".join(parts)

    for i, line in enumerate(lines):
        if TITLE_SKIP_RE.match(line):
            continue
        if TITLE_HEADER_ONLY_RE.match(line):
            collected = collect_title(i + 1)
            if collected:
                return collected
        if TITLE_MARKER_RE.search(line) and len(line) > 24:
            collected = collect_title(i)
            if collected:
                return collected

    for line in lines:
        if TITLE_SKIP_RE.match(line) or TITLE_NOISE_RE.search(line):
            continue
        if len(line) > 30 and line.upper() == line:
            return line

    return file_name.removesuffix(".pdf").lstrip("_").strip()


def detect_legal_practice(file_name: str, text: str) -> tuple[str, str] | None:
    title_zone = "\n".join(line.strip() for line in text.splitlines()[:80] if line.strip())
    header_haystack = f"{infer_title(file_name, text)}\n{title_zone[:4000]}"

    if NON_PRACTICE_JUDICIAL_ACT_RE.search(header_haystack):
        return None
    if STRICT_PRACTICE_NEGATIVE_RE.search(header_haystack):
        return None

    if LEGAL_MARKERS["echr"].search(header_haystack):
        return "echr", "echr"

    if LEGAL_MARKERS["constitutional"].search(header_haystack):
        return "constitutional", "constitutional"

    if LEGAL_MARKERS["cassation"].search(header_haystack):
        category = infer_practice_category(header_haystack)
        if category != "unknown":
            return "cassation", category

    return None


def infer_practice_category(text: str) -> str:
    lowered = text.lower()
    if "սնանկության գործ" in lowered:
        return "civil"
    if "քրեական գործ" in lowered or "քրեական պալատ" in lowered:
        return "criminal"
    if "վարչական գործ" in lowered or "վարչական դատարան" in lowered:
        return "administrative"
    if (
        "քաղաքացիական գործ" in lowered
        or "քաղաքացիական պալատ" in lowered
        or "տնտեսական գործ" in lowered
    ):
        return "civil"
    return "unknown"


def infer_case_number(file_name: str, text: str) -> str | None:
    for candidate in (text[:6000], file_name):
        match = CASE_NUMBER_RE.search(candidate)
        if match:
            return match.group(0).replace("-Ի", "").replace("-ի", "")
    return None


def infer_outcome(text: str, court_type: str) -> str | None:
    tail = text[-15000:].lower()
    if court_type == "constitutional":
        if "չի համապատասխանում" in tail:
            return "rejected"
        if "համապատասխանում է" in tail or "համապատասխանում են" in tail:
            return "granted"
        if "կարճել" in tail and "վարույթ" in tail:
            return "discontinued"
        return None
    if "կարճել" in tail and "վարույթ" in tail:
        return "discontinued"
    if "նոր քննության" in tail:
        return "remanded"
    if "մասնակիորեն" in tail or "մասամբ" in tail:
        return "partial"
    if "բողոքը մերժել" in tail or "ենթակա է մերժման" in tail:
        return "rejected"
    if "բողոքը բավարարել" in tail or "վճիռը բեկանել" in tail:
        return "granted"
    return None


def infer_court_name(court_type: str) -> str | None:
    mapping = {
        "constitutional": "ՀՀ Սահմանադրական դատարան",
        "echr": "Մարդու իրավունքների եվրոպական դատարան",
        "cassation": "ՀՀ վճռաբեկ դատարան",
    }
    return mapping.get(court_type)


def extract_applied_articles(text: str) -> dict[str, Any]:
    sources: list[dict[str, Any]] = []
    article_rules = [
        (
            "ՀՀ Սահմանադրություն",
            re.compile(r"Սահմանադրության\s+(\d+(?:\.\d+)?)\s+հոդված", re.I),
        ),
        (
            "ՀՀ քրեական օրենսգիրք",
            re.compile(r"քրեական օրենսգրքի\s+(\d+(?:\.\d+)?)\s+հոդված", re.I),
        ),
        (
            "ՀՀ քաղաքացիական օրենսգիրք",
            re.compile(r"քաղաքացիական օրենսգրքի\s+(\d+(?:\.\d+)?)\s+հոդված", re.I),
        ),
        (
            "ՀՀ վարչական դատավարության օրենսգիրք",
            re.compile(
                r"վարչական դատավարության օրենսգրքի\s+(\d+(?:\.\d+)?)\s+հոդված", re.I
            ),
        ),
        ("ՄԻԵԿ", re.compile(r"կոնվենցիայի\s+(\d+(?:\.\d+)?)\s+հոդված", re.I)),
    ]
    for act_name, pattern in article_rules:
        found = sorted({m.group(1) for m in pattern.finditer(text)})
        if found:
            sources.append(
                {
                    "act": act_name,
                    "articles": [
                        {"article": n, "part": "", "point": "", "context": ""}
                        for n in found
                    ],
                }
            )
    return {"sources": sources}


def summarize_reasoning(text: str) -> str | None:
    markers = [
        "Վճռաբեկ դատարանը գտնում է",
        "Սահմանադրական դատարանը գտնում է",
        "Եվրոպական դատարանը գտնում է",
        "Ելնելով վերոգրյալից",
    ]
    for marker in markers:
        idx = text.find(marker)
        if idx != -1:
            snippet = re.sub(r"\s+", " ", text[idx : idx + 1200]).strip()
            return snippet[:1000]
    return None


def infer_kb_category(file_name: str, text: str) -> str | None:
    haystack = f"{file_name}\n{text[:4000]}"
    if INTERNATIONAL_RE.search(file_name):
        if re.search(r"ՄԱՐԴՈՒ ԻՐԱՎՈՒՆՔ|ՀԻՄՆԱՐԱՐ ԱԶԱՏՈՒԹՅՈՒՆ", haystack, re.I):
            return "human_rights_law"
        if re.search(r"ԵՎՐՈՊԱԿԱՆ ԿՈՆՎԵՆՑԻԱ|ECHR", haystack, re.I):
            return "echr"
        return "other"
    for category, pattern in KB_CATEGORY_RULES:
        if pattern.search(haystack):
            return category
    return "other"


def infer_source_name(file_name: str, category: str | None) -> str:
    if category == "government_decisions":
        return "ՀՀ Կառավարություն"
    if category == "prime_minister_decisions":
        return "ՀՀ Վարչապետ"
    if category == "central_electoral_commission_decisions":
        return "ՀՀ Կենտրոնական ընտրական հանձնաժողով"
    if category == "ministry_of_health":
        return "ՀՀ Առողջապահության նախարարություն"
    return "ARLIS"


def split_structured_blocks(text: str) -> list[tuple[str | None, str]]:
    heading_re = re.compile(
        r"^(Հոդված\s+\d+(?:\.\d+)?|Գ Լ ՈՒ Խ\s+\d+|ԳԼՈՒԽ\s+\d+|Բ Ա Ժ Ի Ն\s+\d+|ԲԱԺԻՆ\s+\d+|Article\s+\d+|CHAPTER\s+\d+)",
        re.I,
    )
    blocks: list[tuple[str | None, list[str]]] = []
    current_heading: str | None = None
    current_lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            current_lines.append("")
            continue
        if heading_re.match(stripped):
            if current_lines:
                blocks.append((current_heading, current_lines))
            current_heading = stripped[:200]
            current_lines = [stripped]
        else:
            current_lines.append(stripped)
    if current_lines:
        blocks.append((current_heading, current_lines))
    result: list[tuple[str | None, str]] = []
    for heading, lines in blocks:
        block = "\n".join(lines).strip()
        if block:
            result.append((heading, block))
    return result or [(None, text)]


def split_large_block(
    block: str, max_chars: int = 1800, overlap: int = 200
) -> list[str]:
    if len(block) <= max_chars:
        return [block]
    paras = [p.strip() for p in re.split(r"\n{2,}", block) if p.strip()]
    if len(paras) > 1:
        chunks: list[str] = []
        cur = ""
        for para in paras:
            candidate = f"{cur}\n\n{para}".strip() if cur else para
            if len(candidate) <= max_chars or not cur:
                cur = candidate
            else:
                chunks.append(cur)
                cur = para
        if cur:
            chunks.append(cur)
        return chunks
    chunks = []
    start = 0
    while start < len(block):
        end = min(len(block), start + max_chars)
        if end < len(block):
            cut = max(
                block.rfind("\n", start, end),
                block.rfind(". ", start, end),
                block.rfind("։ ", start, end),
            )
            if cut > start + 500:
                end = cut + 1
        chunks.append(block[start:end].strip())
        if end >= len(block):
            break
        start = max(start + 1, end - overlap)
    return [c for c in chunks if c]


def make_chunks(text: str) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    blocks = split_structured_blocks(text)
    cursor = 0
    previous_text = ""
    chunk_index = 0
    for heading, block in blocks:
        for piece in split_large_block(block):
            start = text.find(piece[:80], cursor)
            if start == -1:
                start = cursor
            end = start + len(piece)
            overlap_prev = min(len(previous_text), 200) if previous_text else 0
            chunks.append(
                {
                    "chunk_index": chunk_index,
                    "chunk_text": piece,
                    "chunk_type": "article"
                    if heading and heading.startswith("Հոդված")
                    else "section",
                    "label": heading or None,
                    "source_anchor": heading or None,
                    "char_start": start,
                    "char_end": end,
                    "overlap_prev": overlap_prev,
                    "chunk_hash": hashlib.sha1(
                        piece.encode("utf-8", errors="ignore")
                    ).hexdigest()[:16],
                }
            )
            chunk_index += 1
            cursor = max(cursor, end)
            previous_text = piece[-200:]
    return chunks


def prepare_pdf(pdf_path: Path) -> PreparedRow:
    try:
        text = extract_text(pdf_path)
    except Exception as exc:  # noqa: BLE001
        return PreparedRow(
            target="review",
            payload=None,
            review={
                "file_name": pdf_path.name,
                "absolute_path": str(pdf_path),
                "reason": "extract_error",
                "error": str(exc),
            },
        )
    if not text:
        return PreparedRow(
            target="review",
            payload=None,
            review={
                "file_name": pdf_path.name,
                "absolute_path": str(pdf_path),
                "reason": "empty_text",
            },
        )

    external_id = build_external_id(pdf_path)
    title = infer_title(pdf_path.name, text)
    source_url = infer_source_url(text)
    legal_info = detect_legal_practice(pdf_path.name, text)

    if legal_info:
        court_type, practice_category = legal_info
        if practice_category == "unknown":
            return PreparedRow(
                target="review",
                payload=None,
                review={
                    "file_name": pdf_path.name,
                    "absolute_path": str(pdf_path),
                    "target": "legal_practice_kb",
                    "court_type": court_type,
                    "suggested_title": title,
                    "reason": "unknown_practice_category",
                },
            )
        payload = {
            "external_id": external_id,
            "source_file_name": pdf_path.name,
            "source_file_path": str(pdf_path),
            "title": title,
            "practice_category": practice_category,
            "court_type": court_type,
            "outcome": infer_outcome(text, court_type),
            "court_name": infer_court_name(court_type),
            "case_number_anonymized": infer_case_number(pdf_path.name, text),
            "decision_date": infer_date(text),
            "applied_articles": extract_applied_articles(text),
            "key_violations": [],
            "legal_reasoning_summary": None,
            "content_text": text,
            "source_name": "ARLIS",
            "source_url": source_url,
            "description": title,
            "is_active": True,
            "is_anonymized": False,
            "visibility": "admin_only",
        }
        return PreparedRow(
            target="legal_practice_kb", payload=payload, stats_key=practice_category
        )

    kb_category = infer_kb_category(pdf_path.name, text)
    payload = {
        "external_id": external_id,
        "source_file_name": pdf_path.name,
        "source_file_path": str(pdf_path),
        "title": title,
        "content_text": text,
        "article_number": None,
        "category": kb_category,
        "source_name": infer_source_name(pdf_path.name, kb_category),
        "source_url": source_url,
        "version_date": infer_date(text),
        "is_active": True,
    }
    return PreparedRow(target="knowledge_base", payload=payload, stats_key=kb_category)


def iter_pdfs(source_dir: Path) -> Iterable[Path]:
    return (p for p in sorted(source_dir.glob("*.pdf")) if p.is_file())


def looks_like_legal_practice_file(file_name: str) -> bool:
    return any(pattern.search(file_name) for pattern in LEGAL_MARKERS.values())


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate ARLIS JSONL exports with smart chunks."
    )
    parser.add_argument("source_dir", help="Directory with PDF files")
    parser.add_argument(
        "--output-dir", default="data/arlis_embedding_export", help="Output directory"
    )
    parser.add_argument("--limit", type=int, default=0, help="Optional max files")
    parser.add_argument("--offset", type=int, default=0, help="Optional start offset")
    parser.add_argument("--workers", type=int, default=4, help="Parallel PDF workers")
    parser.add_argument(
        "--mode",
        choices=["all", "legal_practice", "knowledge_base"],
        default="all",
        help="Restrict generation to a target corpus",
    )
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    if not source_dir.exists() or not source_dir.is_dir():
        raise SystemExit(f"Source directory not found: {source_dir}")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    files = list(iter_pdfs(source_dir))
    if args.mode == "legal_practice":
        files = [f for f in files if looks_like_legal_practice_file(f.name)]
    elif args.mode == "knowledge_base":
        files = [f for f in files if not looks_like_legal_practice_file(f.name)]
    if args.offset:
        files = files[args.offset :]
    if args.limit:
        files = files[: args.limit]

    kb_path = output_dir / "knowledge_base.jsonl"
    practice_path = output_dir / "legal_practice_kb.jsonl"
    practice_ai_enrich_path = output_dir / "legal_practice_ai_enrich_queue.jsonl"
    review_path = output_dir / "review_required.jsonl"
    summary_path = output_dir / "summary.json"

    summary: dict[str, Any] = {
        "source_dir": str(source_dir),
        "processed": 0,
        "knowledge_base": 0,
        "legal_practice_kb": 0,
        "legal_practice_ai_enrich_queue": 0,
        "review_required": 0,
        "kb_categories": {},
        "practice_categories": {},
        "errors": 0,
    }

    with (
        kb_path.open("w", encoding="utf-8") as kb_f,
        practice_path.open("w", encoding="utf-8") as lp_f,
        practice_ai_enrich_path.open("w", encoding="utf-8") as enrich_f,
        review_path.open("w", encoding="utf-8") as review_f,
    ):
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
            for row in executor.map(prepare_pdf, files):
                summary["processed"] += 1
                if row.target == "knowledge_base" and row.payload:
                    kb_f.write(json.dumps(row.payload, ensure_ascii=False) + "\n")
                    summary["knowledge_base"] += 1
                    summary["kb_categories"][row.stats_key] = (
                        summary["kb_categories"].get(row.stats_key, 0) + 1
                    )
                elif row.target == "legal_practice_kb" and row.payload:
                    lp_f.write(json.dumps(row.payload, ensure_ascii=False) + "\n")
                    enrich_f.write(
                        json.dumps(
                            {
                                "external_id": row.payload["external_id"],
                                "source_file_name": row.payload["source_file_name"],
                                "title": row.payload["title"],
                                "practice_category": row.payload["practice_category"],
                                "court_type": row.payload["court_type"],
                                "content_text": row.payload["content_text"],
                                "requested_fields": [
                                    "interpreted_norms",
                                    "key_paragraphs",
                                    "keywords",
                                    "legal_principle",
                                    "precedent_authority_level",
                                    "ratio_decidendi",
                                    "procedural_aspect",
                                    "violation_type",
                                    "legal_reasoning_summary",
                                ],
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                    summary["legal_practice_kb"] += 1
                    summary["legal_practice_ai_enrich_queue"] += 1
                    summary["practice_categories"][row.stats_key] = (
                        summary["practice_categories"].get(row.stats_key, 0) + 1
                    )
                else:
                    review_f.write(json.dumps(row.review, ensure_ascii=False) + "\n")
                    summary["review_required"] += 1

    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
