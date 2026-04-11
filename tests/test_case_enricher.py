from __future__ import annotations

import unittest

from src.transform.case_enricher import CaseEnricher
from src.translation.translator import NoopTranslator, TranslationCache, TranslationStats
from src.validation.case_schema import EnrichmentStripper


class InMemoryCache(TranslationCache):
    def __init__(self) -> None:  # noqa: D401
        # Fake path; we override get/set anyway.
        super().__init__(cache_path=__import__("pathlib").Path("output/_test_cache.sqlite"))
        self._mem: dict[str, str] = {}

    def get(self, key: str) -> str | None:  # type: ignore[override]
        return self._mem.get(key)

    def set(self, key: str, translated_text: str) -> None:  # type: ignore[override]
        self._mem[key] = translated_text


class TestCaseEnricher(unittest.TestCase):
    def _make_enricher(self) -> CaseEnricher:
        cache = InMemoryCache()
        stats = TranslationStats()
        translator = NoopTranslator(cache=cache, stats=stats)
        return CaseEnricher(translator=translator, target_lang="hy", source_lang="en")

    def test_preserves_original_fields_exactly(self) -> None:
        enricher = self._make_enricher()
        original = {
            "itemid": "001-123",
            "appno": "12345/67",
            "docname": "CASE OF X v. Y",
            "__conclusion": "Violation of Article 6",
            "_decision_body": "John Doe, President,\nJane Roe, judge,\n",
            "country": {"alpha2": "am", "name": "Armenia"},
            "article": ["6", "p1-1"],
            "conclusion": [
                {
                    "article": "6",
                    "base_article": "6",
                    "type": "violation",
                    "element": "Violation of Article 6 - Right to a fair trial",
                    "details": ["Article 6 - Right to a fair trial"],
                }
            ],
            "content": {
                "001.docx": [
                    {
                        "section_name": "procedure",
                        "content": "PROCEDURE",
                        "elements": [
                            {"content": "1. The case originated ...", "elements": []},
                            {"content": "", "elements": []},
                        ],
                    }
                ]
            },
            "decision_body": [{"name": "DOE", "role": "judge", "info": {"full_name": "John DOE"}}],
            "documents": ["001.docx"],
            "judgementdate": "24/11/2009 00:00:00",
            "ecli": "ECLI:CE:ECHR:2009:1124JUD000000000",
        }
        enriched = enricher.enrich(original)

        stripper = EnrichmentStripper()
        stripped = stripper.strip(enriched)
        self.assertEqual(stripped, original)

    def test_adds_required_hy_companion_fields(self) -> None:
        enricher = self._make_enricher()
        original = {
            "docname": "CASE OF X v. Y",
            "__conclusion": "Violation of Article 6",
            "_decision_body": "John Doe, President,\n",
            "country": {"alpha2": "am", "name": "Armenia"},
            "conclusion": [{"article": "6", "base_article": "6", "type": "violation", "element": "Violation ...", "details": ["A"]}],
            "content": {"f": [{"section_name": "law", "content": "THE LAW", "elements": [{"content": "1. ...", "elements": []}]}]},
            "decision_body": [{"role": "judge"}],
        }
        enriched = enricher.enrich(original)

        self.assertIn("docname_hy", enriched)
        self.assertIn("__conclusion_hy", enriched)
        self.assertIn("_decision_body_hy", enriched)
        self.assertIn("translation_meta", enriched)
        self.assertIn("name_hy", enriched["country"])

        self.assertIn("element_hy", enriched["conclusion"][0])
        self.assertIn("details_hy", enriched["conclusion"][0])
        self.assertIsInstance(enriched["conclusion"][0]["details_hy"], list)

        node = enriched["content"]["f"][0]
        self.assertIn("content_hy", node)
        self.assertIn("section_name_hy", node)
        child = node["elements"][0]
        self.assertIn("content_hy", child)

        self.assertEqual(enriched["decision_body"][0].get("role_label_hy"), "դատավոր")

    def test_empty_string_translation_stays_empty(self) -> None:
        enricher = self._make_enricher()
        original = {
            "docname": "",
            "__conclusion": "   ",
            "country": {"name": ""},
            "content": {"f": [{"content": "", "elements": []}]},
        }
        enriched = enricher.enrich(original)
        self.assertEqual(enriched["docname_hy"], "")
        self.assertEqual(enriched["__conclusion_hy"], "")
        self.assertEqual(enriched["country"]["name_hy"], "")
        self.assertEqual(enriched["content"]["f"][0]["content_hy"], "")


if __name__ == "__main__":
    unittest.main()

