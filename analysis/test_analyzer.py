"""Regression tests for the dependency-free claim analyzer."""
import unittest

from analyzer import analyze_content


PROFILE = {
    "brand_name": "Sample Brand",
    "owners": {"product": "Product Owner", "offer": "Offer Manager", "brand": "Brand Manager"},
    "approved_facts": [{
        "id": "facts-1", "title": "Product facts", "text": "250 ml can, 80 mg caffeine.",
        "values": {"volume_ml": 250, "caffeine_mg": 80},
    }],
    "approved_offers": [{
        "id": "offer-1", "title": "Offer", "text": "10% off through November 15, 2026.",
        "discount_percent": 10, "start_date": "2026-11-01", "end_date": "2026-11-15",
    }],
}


class AnalyzerTests(unittest.TestCase):
    def test_checks_product_and_offer_against_sources(self):
        result = analyze_content(
            "250 ml and 80 mg. Get 20% off through November 30!",
            PROFILE, as_of="2026-11-10",
        )
        self.assertEqual(["supported", "supported", "contradicted"], [f["status"] for f in result["findings"]])
        self.assertTrue(all(f["evidence"] for f in result["findings"]))
        self.assertTrue(result["final_approval_required"])

    def test_ambiguous_product_facts_stay_unverified(self):
        profile = {**PROFILE, "approved_facts": PROFILE["approved_facts"] * 2}
        finding = analyze_content("250 ml can", profile, as_of="2026-11-10")["findings"][0]
        self.assertEqual("unverified", finding["status"])
        self.assertEqual(2, len(finding["evidence"]))

    def test_invalid_approved_number_stays_unverified(self):
        profile = {**PROFILE, "approved_facts": [{**PROFILE["approved_facts"][0], "values": {"volume_ml": "unknown"}}]}
        finding = analyze_content("250 ml can", profile, as_of="2026-11-10")["findings"][0]
        self.assertEqual("unverified", finding["status"])

    def test_unsupported_superlative_is_unverified_not_false(self):
        finding = analyze_content("This is the best coffee.", PROFILE, as_of="2026-11-10")["findings"][0]
        self.assertEqual("unverified", finding["status"])
        self.assertIn("no approved evidence", finding["explanation"])

    def test_rejects_malformed_profile_collection(self):
        with self.assertRaisesRegex(TypeError, "approved_facts"):
            analyze_content("250 ml", {"approved_facts": {}}, as_of="2026-11-10")

    def test_missing_offer_end_date_is_not_reported_as_supported(self):
        profile = {**PROFILE, "approved_offers": [{
            "id": "offer-1", "title": "Offer", "text": "10% off", "discount_percent": 10,
        }]}
        finding = analyze_content("10% off through November 15", profile, as_of="2026-11-10")["findings"][0]
        self.assertEqual("unverified", finding["status"])

    def test_invalid_offer_date_is_not_reported_as_outdated(self):
        profile = {**PROFILE, "approved_offers": [{
            **PROFILE["approved_offers"][0], "end_date": "not-a-date",
        }]}
        finding = analyze_content("10% off", profile, as_of="2026-11-10")["findings"][0]
        self.assertEqual("unverified", finding["status"])


if __name__ == "__main__":
    unittest.main()
