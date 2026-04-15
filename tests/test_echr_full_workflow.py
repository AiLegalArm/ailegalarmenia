from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.echr_full_workflow import build_semantic_chunks_for_record, discover_shards, validate_shards


class TestEchrFullWorkflow(unittest.TestCase):
    def test_discover_shards_orders_numerically(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            for name in ["out_part10.jsonl", "out_part2.jsonl", "out_part1.jsonl"]:
                (root / name).write_text('{"itemid":"1"}\n', encoding="utf-8")
            shards, ref = discover_shards(root)
            self.assertEqual([p.name for p in shards], ["out_part1.jsonl", "out_part2.jsonl", "out_part10.jsonl"])
            self.assertIsNone(ref)

    def test_validate_shards_compares_reference(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "out_part1.jsonl").write_text('{"itemid":"A"}\n', encoding="utf-8")
            (root / "out_part2.jsonl").write_text('{"itemid":"B"}\n', encoding="utf-8")
            (root / "out.jsonl").write_text('{"itemid":"A"}\n{"itemid":"B"}\n', encoding="utf-8")
            shards, ref = discover_shards(root)
            report = validate_shards(shards, ref)
            self.assertEqual(report["combined_records"], 2)
            self.assertTrue(report["reference_match"]["sets_equal"])

    def test_build_semantic_chunks_respects_section_boundaries(self) -> None:
        record = {
            "itemid": "001-1",
            "content": {
                "001.docx": [
                    {
                        "section_name": "procedure",
                        "content": "PROCEDURE",
                        "elements": [
                            {"content": "1. First paragraph.", "elements": []},
                            {"content": "2. Second paragraph.", "elements": []},
                        ],
                    },
                    {
                        "section_name": "facts",
                        "content": "THE FACTS",
                        "elements": [
                            {"content": "3. Facts paragraph.", "elements": []},
                        ],
                    },
                ]
            },
        }
        chunks = build_semantic_chunks_for_record(record, use_hy=False, min_chars=1, target_chars=40, max_chars=80)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertTrue(any(ch["section_name"] == "procedure" for ch in chunks))
        self.assertTrue(any(ch["section_name"] == "facts" for ch in chunks))


if __name__ == "__main__":
    unittest.main()