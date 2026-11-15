"""Conservative brand claim checks for the VerityBrand demo.

This module uses only the organisation's supplied, approved knowledge. It does
not use an LLM to decide whether a claim is true. Unknown or ambiguous claims
are returned as unverified for a human reviewer.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

STATUS_SUPPORTED = "supported"
STATUS_CONTRADICTED = "contradicted"
STATUS_OUTDATED = "outdated"
STATUS_UNVERIFIED = "unverified"

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2,
    "mar": 3, "march": 3, "apr": 4, "april": 4,
    "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def _as_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _parse_claimed_end_date(text: str, as_of: date) -> date | None:
    """Read simple phrases such as 'through Nov 30' or 'until November 30, 2026'."""
    match = re.search(
        r"\b(?:through|until|till|ends?(?:\s+on)?)\s+"
        r"([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    month = _MONTHS.get(match.group(1).lower())
    if month is None:
        return None
    year = int(match.group(3)) if match.group(3) else as_of.year
    try:
        return date(year, month, int(match.group(2)))
    except ValueError:
        return None


def _excerpt(text: str, start: int, end: int, radius: int = 54) -> str:
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    return " ".join(text[left:right].split())


def _evidence(source: dict[str, Any]) -> dict[str, str]:
    return {
        "source_id": str(source.get("id", "")),
        "title": str(source.get("title", "Approved source")),
        "text": str(source.get("text", "")),
    }


def _finding(
    *,
    claim: str,
    category: str,
    status: str,
    severity: str,
    explanation: str,
    evidence: list[dict[str, str]] | None = None,
    suggested_action: str = "",
    reviewer_role: str | None = None,
) -> dict[str, Any]:
    return {
        "claim": claim,
        "category": category,
        "status": status,
        "severity": severity,
        "explanation": explanation,
        "evidence": evidence or [],
        "suggested_action": suggested_action,
        "reviewer_role": reviewer_role,
        "requires_human_review": status in {
            STATUS_CONTRADICTED, STATUS_OUTDATED, STATUS_UNVERIFIED
        },
    }


def _check_product_numbers(text: str, profile: dict[str, Any]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    facts = profile.get("approved_facts", [])
    if not isinstance(facts, list):
        facts = []
    owners = profile.get("owners", {})

    checks = [
        ("volume_ml", re.compile(r"\b(\d{2,4})\s?ml\b", re.IGNORECASE), "ml"),
        ("caffeine_mg", re.compile(r"\b(\d{1,4})\s?mg(?:\s+caffeine)?\b", re.IGNORECASE), "mg"),
    ]
    for field, pattern, unit in checks:
        for match in pattern.finditer(text):
            claimed_value = int(match.group(1))
            matching_sources = [
                fact for fact in facts
                if isinstance(fact, dict) and isinstance(fact.get("values"), dict)
                and field in fact["values"]
            ]
            claim = _excerpt(text, match.start(), match.end())
            if len(matching_sources) != 1:
                reason = "No approved source" if not matching_sources else "Multiple approved sources"
                findings.append(_finding(
                    claim=claim,
                    category="product_fact",
                    status=STATUS_UNVERIFIED,
                    severity="medium",
                    explanation=f"{reason} for this {unit} value could be selected confidently.",
                    evidence=[_evidence(fact) for fact in matching_sources],
                    suggested_action="Ask the product owner to confirm the value and keep one current approved source.",
                    reviewer_role=owners.get("product", "Product Owner") if isinstance(owners, dict) else "Product Owner",
                ))
                continue

            source = matching_sources[0]
            try:
                approved_value = int(source["values"][field])
            except (TypeError, ValueError, OverflowError):
                findings.append(_finding(
                    claim=claim, category="product_fact", status=STATUS_UNVERIFIED,
                    severity="medium", explanation=f"The approved {unit} value is missing or invalid.",
                    evidence=[_evidence(source)],
                    suggested_action="Ask the product owner to correct the approved source.",
                    reviewer_role=owners.get("product", "Product Owner") if isinstance(owners, dict) else "Product Owner",
                ))
                continue
            evidence = [_evidence(source)]
            if claimed_value == approved_value:
                findings.append(_finding(
                    claim=claim,
                    category="product_fact",
                    status=STATUS_SUPPORTED,
                    severity="low",
                    explanation=f"The {unit} value matches the approved product fact.",
                    evidence=evidence,
                ))
            else:
                findings.append(_finding(
                    claim=claim,
                    category="product_fact",
                    status=STATUS_CONTRADICTED,
                    severity="high",
                    explanation=f"The draft says {claimed_value} {unit}; the approved source says {approved_value} {unit}.",
                    evidence=evidence,
                    suggested_action=f"Use {approved_value} {unit} only after the product owner confirms the source is current.",
                    reviewer_role=owners.get("product", "Product Owner") if isinstance(owners, dict) else "Product Owner",
                ))
    return findings


def _check_offer(text: str, profile: dict[str, Any], as_of: date) -> list[dict[str, Any]]:
    percent_match = re.search(
        r"\b(?:(?:get|save|claim)\s+)?(\d{1,3})\s?%\s*(?:off|discount)\b",
        text,
        re.IGNORECASE,
    )
    claimed_end = _parse_claimed_end_date(text, as_of)
    offer_context = re.search(r"\b(offer|discount|sale|promotion|promo)\b", text, re.IGNORECASE)
    if not percent_match and (not claimed_end or not offer_context):
        return []

    claim_start = percent_match.start() if percent_match else 0
    claim_end = percent_match.end() if percent_match else len(text)
    if claimed_end:
        date_match = re.search(
            r"\b(?:through|until|till|ends?(?:\s+on)?)\s+[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?\b",
            text,
            flags=re.IGNORECASE,
        )
        if date_match:
            claim_start = min(claim_start, date_match.start()) if percent_match else date_match.start()
            claim_end = max(claim_end, date_match.end()) if percent_match else date_match.end()
    claim = _excerpt(text, claim_start, claim_end)

    offers = profile.get("approved_offers", [])
    if not isinstance(offers, list):
        offers = []
    offers = [offer for offer in offers if isinstance(offer, dict)]
    owners = profile.get("owners", {})
    owner = owners.get("offer", "Offer Manager") if isinstance(owners, dict) else "Offer Manager"
    if not offers:
        return [_finding(
            claim=claim,
            category="promotion",
            status=STATUS_UNVERIFIED,
            severity="high",
            explanation="No approved offer source is available to check this promotion.",
            suggested_action="Ask the offer owner to confirm the discount and dates.",
            reviewer_role=owner,
        )]

    active = []
    expired = []
    invalid_date_sources = []
    for offer in offers:
        raw_start, raw_end = offer.get("start_date"), offer.get("end_date")
        start = _as_date(raw_start)
        end = _as_date(raw_end)
        if (raw_start and start is None) or (raw_end and end is None):
            invalid_date_sources.append(offer)
            continue
        if (start is None or start <= as_of) and (end is None or as_of <= end):
            active.append(offer)
        elif end is not None and end < as_of:
            expired.append(offer)

    if invalid_date_sources:
        return [_finding(
            claim=claim,
            category="promotion",
            status=STATUS_UNVERIFIED,
            severity="high",
            explanation="An approved offer has an invalid validity date, so the checker cannot establish which terms are current.",
            evidence=[_evidence(source) for source in invalid_date_sources],
            suggested_action="Ask the offer owner to correct the approved offer dates before publishing.",
            reviewer_role=owner,
        )]

    if not active:
        source = max(expired, key=lambda item: _as_date(item.get("end_date")) or date.min) if expired else offers[-1]
        return [_finding(
            claim=claim,
            category="promotion",
            status=STATUS_OUTDATED,
            severity="high",
            explanation="The available offer information is not current for the review date.",
            evidence=[_evidence(source)],
            suggested_action="Ask the offer owner for a current approved offer before publishing.",
            reviewer_role=owner,
        )]

    # A demo brand should have one current offer. If several overlap, avoid
    # guessing which one applies and ask the owner instead.
    if len(active) != 1:
        return [_finding(
            claim=claim,
            category="promotion",
            status=STATUS_UNVERIFIED,
            severity="high",
            explanation="More than one approved offer is active, so the applicable offer is unclear.",
            evidence=[_evidence(source) for source in active],
            suggested_action="Ask the offer owner which approved offer applies to this campaign.",
            reviewer_role=owner,
        )]

    source = active[0]
    approved_percent = source.get("discount_percent")
    approved_end = _as_date(source.get("end_date"))
    if (percent_match and approved_percent is None) or (claimed_end and approved_end is None):
        return [_finding(
            claim=claim,
            category="promotion",
            status=STATUS_UNVERIFIED,
            severity="high",
            explanation="The approved source is missing a discount value or end date needed to verify this claim.",
            evidence=[_evidence(source)],
            suggested_action="Ask the offer owner to complete the approved offer details.",
            reviewer_role=owner,
        )]
    try:
        percent_ok = percent_match is None or int(percent_match.group(1)) == int(approved_percent)
    except (TypeError, ValueError, OverflowError):
        return [_finding(
            claim=claim,
            category="promotion",
            status=STATUS_UNVERIFIED,
            severity="high",
            explanation="The approved discount value is invalid, so the promotion cannot be checked.",
            evidence=[_evidence(source)],
            suggested_action="Ask the offer owner to correct the approved discount value.",
            reviewer_role=owner,
        )]
    date_ok = claimed_end is None or claimed_end == approved_end

    if percent_ok and date_ok:
        return [_finding(
            claim=claim,
            category="promotion",
            status=STATUS_SUPPORTED,
            severity="low",
            explanation="The promotion matches the current approved offer.",
            evidence=[_evidence(source)],
        )]

    approved_text = str(source.get("text", "the approved offer"))
    return [_finding(
        claim=claim,
        category="promotion",
        status=STATUS_CONTRADICTED,
        severity="high",
        explanation=f"The draft promotion does not match the current approved offer: {approved_text}",
        evidence=[_evidence(source)],
        suggested_action="Use the approved offer wording after the offer owner confirms it is still valid.",
        reviewer_role=owner,
    )]


def _check_unsubstantiated_superlatives(text: str, profile: dict[str, Any]) -> list[dict[str, Any]]:
    phrases = profile.get("claims_requiring_evidence", [
        r"\bno\.?\s*1\b", r"\bnumber\s+one\b", r"\b(best|leading|top[- ]rated)\b"
    ])
    approved_claims = profile.get("approved_claims", [])
    owners = profile.get("owners", {})
    if not isinstance(owners, dict):
        owners = {}
    if not isinstance(phrases, list):
        phrases = []
    if not isinstance(approved_claims, list):
        approved_claims = []
    findings: list[dict[str, Any]] = []

    for phrase in phrases:
        pattern = re.compile(phrase, re.IGNORECASE) if phrase.startswith("\\b") else re.compile(re.escape(phrase), re.IGNORECASE)
        for match in pattern.finditer(text):
            matched = match.group(0)
            claim = _excerpt(text, match.start(), match.end())
            source = next(
                (item for item in approved_claims if isinstance(item, dict) and matched.casefold() in str(item.get("text", "")).casefold()),
                None,
            )
            if source:
                findings.append(_finding(
                    claim=claim,
                    category="comparative_claim",
                    status=STATUS_SUPPORTED,
                    severity="low",
                    explanation="This phrase appears in an approved claim source.",
                    evidence=[_evidence(source)],
                ))
            else:
                findings.append(_finding(
                    claim=claim,
                    category="comparative_claim",
                    status=STATUS_UNVERIFIED,
                    severity="high",
                    explanation=f"“{matched}” is a comparative or superlative claim, and no approved evidence for it was found.",
                    suggested_action="Remove the claim or ask the brand owner to provide approved evidence.",
                    reviewer_role=owners.get("brand", "Brand Manager"),
                ))
    return findings


def analyze_content(
    content: str,
    profile: dict[str, Any],
    as_of: str | date | None = None,
) -> dict[str, Any]:
    """Return conservative, source-linked findings for supported demo checks.

    Profile format is documented in README.md. `as_of` should be supplied by
    the caller for repeatable offer checks (ISO date string or datetime.date).
    """
    if not isinstance(content, str) or not content.strip():
        raise ValueError("content must be a non-empty string")
    if not isinstance(profile, dict):
        raise TypeError("profile must be a dictionary")
    for field in ("approved_facts", "approved_offers", "approved_claims", "claims_requiring_evidence"):
        if field in profile and not isinstance(profile[field], list):
            raise TypeError(f"profile.{field} must be a list")

    review_date = _as_date(as_of) if as_of is not None else date.today()
    if review_date is None:
        raise ValueError("as_of must be a valid ISO date such as 2026-11-10")

    findings = []
    findings.extend(_check_product_numbers(content, profile))
    findings.extend(_check_offer(content, profile, review_date))
    findings.extend(_check_unsubstantiated_superlatives(content, profile))

    counts = {status: sum(f["status"] == status for f in findings) for status in (
        STATUS_SUPPORTED, STATUS_CONTRADICTED, STATUS_OUTDATED, STATUS_UNVERIFIED
    )}
    needs_review = any(f["requires_human_review"] for f in findings)
    return {
        "brand_name": profile.get("brand_name", ""),
        "review_date": review_date.isoformat(),
        "overall_status": "needs_human_review" if needs_review else "ready_for_final_approval",
        "final_approval_required": True,
        "summary": counts,
        "findings": findings,
        "analysis_note": (
            "Checks use only supplied approved sources and explicit rules. "
            "Missing evidence is reported as unverified, not false."
        ),
    }
