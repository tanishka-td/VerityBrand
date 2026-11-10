# VerityBrand analysis component

This folder contains the first pass of VerityBrand's claim-analysis logic. It is intentionally conservative and dependency-free. It checks exact numeric product facts, current offers, and common unsupported superlatives against an organisation-supplied brand profile.

## What it does

- Marks matching product numbers and offers as `supported` and includes their approved source.
- Marks conflicts with current approved values as `contradicted`.
- Marks claims that rely on expired source information as `outdated`.
- Marks claims without approved evidence as `unverified` and routes them to a configured human role.
- Keeps final approval with a human even when every finding is supported.

The current implementation is rule-based for the Daybreak Coffee demo. It does not call an LLM, inspect images, or claim to understand arbitrary factual language. Unknown claims should remain unverified; they must not be guessed at.

## Example brand profile

```python
profile = {
    "brand_name": "Daybreak Coffee",
    "owners": {
        "product": "Product Owner",
        "offer": "Offer Manager",
        "brand": "Brand Manager",
    },
    "approved_facts": [
        {
            "id": "product-daybreak-01",
            "title": "Approved product facts",
            "text": "Daybreak Cold Brew comes in a 250 ml can and contains 80 mg of caffeine.",
            "values": {"volume_ml": 250, "caffeine_mg": 80},
        }
    ],
    "approved_offers": [
        {
            "id": "offer-2026-11",
            "title": "November offer approval",
            "text": "10% off through November 15, 2026.",
            "discount_percent": 10,
            "start_date": "2026-11-01",
            "end_date": "2026-11-15",
        }
    ],
    "claims_requiring_evidence": [
        r"\bno\.?\s*1\b",
        r"\bnumber\s+one\b",
        r"\b(best|leading|top[- ]rated)\b",
    ],
    "approved_claims": [],
}
```

## Example input

```python
from analyzer import analyze_content

content = (
    "Meet Daybreak Cold Brew: 250 ml with 80 mg of caffeine. "
    "Get 20% off through November 30!"
)
result = analyze_content(content, profile, as_of="2026-11-10")
```

Expected behaviour:

- `250 ml` -> `supported`, citing `product-daybreak-01`.
- `80 mg` -> `supported`, citing `product-daybreak-01`.
- `20% off through November 30` -> `contradicted`, citing `offer-2026-11` and asking the Offer Manager to confirm the active terms.
- `overall_status` -> `needs_human_review`.
- `final_approval_required` -> `True`.

## Output shape

Each finding contains `claim`, `category`, `status`, `severity`, `explanation`, `evidence`, `suggested_action`, `reviewer_role`, and `requires_human_review`. The top-level result includes a status summary, review date, and an explicit final-human-approval flag.

## Integration boundary

Call `analyze_content(content, profile, as_of=...)` from the API layer. Keep uploaded source documents and profile construction in the application/backend. For repeatable tests and demos, always pass a fixed `as_of` date. The app should display evidence and route only findings whose `requires_human_review` value is true.
