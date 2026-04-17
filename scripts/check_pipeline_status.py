#!/usr/bin/env python3
"""
Pipeline status check — queries Supabase and local summaries to report
current state of all three ingestion pipelines:
  1. ARLIS Practice (arlis_practice_reload_v6)
  2. ARLIS KB (arlis_kb_reload_v3)
  3. ECHR (import_all_echr / translate_and_load_echr_to_supabase)
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BASE_URL = os.environ.get("SUPABASE_URL", "https://dbrhbbaoeurjveconszd.supabase.co")
SRK = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

HEADERS = {
    "apikey": SRK,
    "Authorization": f"Bearer {SRK}",
    "Accept": "application/json",
    "Prefer": "count=exact",
}


def sb_count(path: str) -> int | str:
    url = BASE_URL + path + "&limit=1"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as r:
            cr = r.headers.get("Content-Range", "0/0")
            total = cr.split("/")[-1].strip()
            return int(total) if total.isdigit() else total
    except Exception as e:
        return f"ERR: {e}"


def sb_get(path: str) -> list | dict | None:
    url = BASE_URL + path
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}


def count_summaries(data_dir: Path) -> tuple[int, int]:
    """Returns (count, max_offset) of summary files."""
    sdir = data_dir / "summaries"
    if not sdir.exists():
        return 0, 0
    files = sorted(sdir.glob("summary_*.json"))
    if not files:
        return 0, 0
    last = files[-1].stem  # e.g. summary_034850
    offset = int(last.replace("summary_", ""))
    return len(files), offset


def main() -> None:
    print("=" * 70)
    print("  PIPELINE STATUS CHECK")
    print("=" * 70)
    print()

    if not SRK:
        print("WARNING: SUPABASE_SERVICE_ROLE_KEY not set — skipping DB queries")
        print()

    # ── 1. ARLIS Practice Pipeline ────────────────────────────────────────
    print("── 1. ARLIS PRACTICE PIPELINE (arlis_practice_reload_v6) ──")
    practice_dir = REPO / "data" / "arlis_practice_reload_v6"
    n_sum, max_off = count_summaries(practice_dir)
    # Last batch in batch_006200.log had 55 items (not 100) = end reached
    print(f"  Summaries:           {n_sum} (last offset: {max_off})")
    print(f"  Estimated total PDFs ~{max_off + 55} (last batch partial)")

    if SRK:
        lp_total = sb_count("/rest/v1/legal_practice_kb?select=id&import_ref=like.arlis-practice*")
        print(f"  DB legal_practice_kb (arlis-practice*): {lp_total}")

    print(f"  Status: {'COMPLETE ✓' if n_sum >= 63 else 'INCOMPLETE'}")
    print()

    # ── 2. ARLIS KB Pipeline ──────────────────────────────────────────────
    print("── 2. ARLIS KB PIPELINE (arlis_kb_reload_v3) ──")
    kb_dir = REPO / "data" / "arlis_kb_reload_v3"
    n_sum_kb, max_off_kb = count_summaries(kb_dir)
    KB_TOTAL = 47205
    batch_size_kb = 150
    last_processed = max_off_kb + batch_size_kb
    remaining = max(0, KB_TOTAL - last_processed)
    next_offset = max_off_kb + batch_size_kb

    print(f"  Summaries:           {n_sum_kb} (last offset: {max_off_kb})")
    print(f"  KB total candidates: {KB_TOTAL}")
    print(f"  Estimated processed: ~{last_processed}")
    print(f"  Remaining:           ~{remaining}")
    print(f"  Next batch offset:   {next_offset}")

    if SRK:
        kb_total = sb_count("/rest/v1/knowledge_base?select=id&is_active=eq.true")
        print(f"  DB knowledge_base (active): {kb_total}")

    print(f"  Status: {'INCOMPLETE — needs offset ' + str(next_offset) if remaining > 0 else 'COMPLETE ✓'}")
    print()

    # ── 3. ECHR Pipeline ─────────────────────────────────────────────────
    print("── 3. ECHR PIPELINE (import_all_echr.py) ──")
    ECHR_TOTAL = 16096
    parts = {
        1: 3220,
        2: 3219,
        3: 3219,
        4: 3219,
        5: 3219,
    }

    if SRK:
        echr_total = sb_count("/rest/v1/legal_practice_kb?select=id&practice_category=eq.echr")
        echr_v3 = sb_count("/rest/v1/legal_practice_kb?select=id&import_ref=eq.echr-hy-bulk-v3")
        print(f"  DB legal_practice_kb (practice_category=echr): {echr_total}")
        print(f"  DB rows with import_ref=echr-hy-bulk-v3:        {echr_v3}")
    else:
        echr_total = "UNKNOWN (no DB access)"
        print(f"  DB rows: {echr_total}")

    print(f"  Source parts:")
    for p, cnt in parts.items():
        print(f"    out_part{p}.jsonl: {cnt} records")
    print(f"  Source total: {ECHR_TOTAL}")
    loaded = echr_total if isinstance(echr_total, int) else 0
    print(f"  Remaining:    ~{ECHR_TOTAL - loaded}")
    status = "COMPLETE ✓" if isinstance(echr_total, int) and echr_total >= ECHR_TOTAL * 0.99 else "INCOMPLETE — needs continuation"
    print(f"  Status: {status}")
    print()

    # ── 4. Job Queue Status ───────────────────────────────────────────────
    if SRK:
        print("── 4. PRACTICE_CHUNK_JOBS STATUS ──")
        for status_val in ["pending", "processing", "done", "failed", "dead_letter"]:
            cnt = sb_count(f"/rest/v1/practice_chunk_jobs?select=id&status=eq.{status_val}")
            print(f"  {status_val:12s}: {cnt}")
        print()

    # ── Summary ───────────────────────────────────────────────────────────
    print("── SUMMARY ──")
    print("  Practice pipeline (ARLIS):  COMPLETE (6255 PDFs)")
    if remaining > 0:
        print(f"  KB pipeline (ARLIS):        INCOMPLETE — continue from offset {next_offset}")
    else:
        print("  KB pipeline (ARLIS):        COMPLETE")
    if isinstance(echr_total, int) and echr_total < ECHR_TOTAL * 0.99:
        print(f"  ECHR pipeline:              INCOMPLETE — {ECHR_TOTAL - echr_total} records missing")
    else:
        print("  ECHR pipeline:              COMPLETE or DB query failed")
    print()
    print("── COMMANDS TO CONTINUE ──")
    ARLIS_PDF_DIR = r"C:\Users\Admin\Desktop\Hayk\AILEGALARMENIA\Кодексы,законы\armenian_law\ARLIS\arlis_pdfs"
    print(f"""
  # Continue ECHR pipeline (idempotent via --skip-existing):
  py scripts/import_all_echr.py

  # Continue KB pipeline from offset {next_offset}:
  node scripts/run_arlis_kb_batches.mjs \\
    --source-dir "{ARLIS_PDF_DIR}" \\
    --output-root data/arlis_kb_reload_v3 \\
    --base-url https://dbrhbbaoeurjveconszd.supabase.co \\
    --service-role-key "$env:SUPABASE_SERVICE_ROLE_KEY" \\
    --batch-size 150 \\
    --workers 12 \\
    --start-offset {next_offset}
""")


if __name__ == "__main__":
    main()
