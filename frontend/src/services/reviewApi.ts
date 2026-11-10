import type { AnalysisResult, BrandProfile, EvidenceSource, Finding, FindingCategory, FindingStatus } from '../types'
import { DEMO_AS_OF, DEMO_PROFILE } from '../data/demoKnowledge'

const productSource = DEMO_PROFILE.sources[0]
const offerSource = DEMO_PROFILE.sources[1]
const voiceSource = DEMO_PROFILE.sources[2]
const asOf = DEMO_AS_OF
const monthNumbers: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
  sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}

function excerptAround(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start - 42), Math.min(text.length, end + 46)).replace(/\s+/g, ' ').trim()
}

function makeFinding(
  id: string,
  claim: string,
  category: FindingCategory,
  status: FindingStatus,
  explanation: string,
  evidence: EvidenceSource[],
  suggestedAction = '',
  reviewerRole: string | null = null,
): Finding {
  return {
    id,
    claim,
    category,
    status,
    severity: status === 'supported' ? 'low' : status === 'unverified' || category === 'promotion' ? 'high' : 'medium',
    explanation,
    evidence,
    suggested_action: suggestedAction,
    reviewer_role: reviewerRole,
    requires_human_review: status !== 'supported',
  }
}

function analyzeInBrowser(content: string, profile: BrandProfile = DEMO_PROFILE): AnalysisResult {
  const findings: Finding[] = []
  const numericChecks = [
    { regex: /\b(\d{2,4})\s?ml\b/i, expected: 250, label: 'ml', id: 'volume' },
    { regex: /\b(\d{1,4})\s?mg(?:\s+caffeine)?\b/i, expected: 80, label: 'mg', id: 'caffeine' },
  ]

  for (const check of numericChecks) {
    const match = check.regex.exec(content)
    if (!match) continue
    const claimed = Number(match[1])
    const supported = claimed === check.expected
    findings.push(makeFinding(
      `product-${check.id}`,
      excerptAround(content, match.index, match.index + match[0].length),
      'product_fact',
      supported ? 'supported' : 'contradicted',
      supported
        ? `The ${check.label} value matches the approved product facts.`
        : `The draft says ${claimed} ${check.label}; the approved source says ${check.expected} ${check.label}.`,
      [productSource],
      supported ? '' : `Use ${check.expected} ${check.label} after the Product Owner confirms the source is current.`,
      supported ? null : 'Product Owner',
    ))
  }

  const percentage = /\b(?:(?:get|save|claim)\s+)?(\d{1,3})\s?%\s*(?:off|discount)\b/i.exec(content)
  const endDate = /\b(?:through|until|till|ends?(?:\s+on)?)\s+([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i.exec(content)
  if (percentage || endDate) {
    const start = Math.min(percentage?.index ?? Infinity, endDate?.index ?? Infinity)
    const end = Math.max(
      percentage ? percentage.index + percentage[0].length : 0,
      endDate ? endDate.index + endDate[0].length : 0,
    )
    const claim = excerptAround(content, start, end)
    const reviewDate = new Date(`${asOf}T00:00:00Z`)
    const expiry = new Date(`${offerSource.valid_through}T00:00:00Z`)
    const month = endDate ? monthNumbers[endDate[1].toLowerCase()] : undefined
    const statedDate = endDate && month
      ? new Date(Date.UTC(Number(endDate[3] || asOf.slice(0, 4)), month - 1, Number(endDate[2])))
      : null
    const expired = expiry < reviewDate
    const percentageMatches = !percentage || Number(percentage[1]) === 10
    const dateMatches = !statedDate || statedDate.getTime() === expiry.getTime()
    const status: FindingStatus = expired ? 'outdated' : percentageMatches && dateMatches ? 'supported' : 'contradicted'
    findings.push(makeFinding(
      'offer-current', claim, 'promotion', status,
      expired
        ? 'The approved offer is no longer current for this review date.'
        : status === 'supported'
          ? 'The promotion matches the current approved offer.'
          : `The draft promotion does not match the current approved offer: ${offerSource.text}`,
      [offerSource],
      status === 'supported' ? '' : 'Ask the Offer Manager to confirm the current offer, then use the approved wording.',
      status === 'supported' ? null : 'Offer Manager',
    ))
  }

  const claimPattern = /\b(?:#\s*1|no\.?\s*1|number\s+one|best|leading|top[- ]rated)\b/gi
  for (const match of content.matchAll(claimPattern)) {
    const index = match.index ?? 0
    findings.push(makeFinding(
      `claim-${index}`,
      excerptAround(content, index, index + match[0].length),
      'comparative_claim',
      'unverified',
      `“${match[0]}” is a comparative claim, and no approved evidence for it was found.`,
      [voiceSource],
      'Remove the claim or ask the Brand Manager to provide approved evidence.',
      'Brand Manager',
    ))
  }

  const summary: AnalysisResult['summary'] = {
    supported: 0,
    contradicted: 0,
    outdated: 0,
    unverified: 0,
  }
  findings.forEach((finding) => { summary[finding.status] += 1 })
  const needsReview = findings.some((finding) => finding.requires_human_review)

  return {
    brand_name: profile.name,
    review_date: asOf,
    overall_status: needsReview ? 'needs_human_review' : 'ready_for_final_approval',
    final_approval_required: true,
    summary,
    findings,
    analysis_note: 'Demo checks use only approved sample sources. Missing evidence is unverified, not false.',
  }
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'with', 'for', 'from', 'is', 'are', 'this', 'that', 'through', 'until', 'our', 'your', 'we', 'it', 'by', 'as', 'be', 'will', 'can'])
const CLAIM_CUES = /(?:\b\d+(?:\.\d+)?\s?(?:ml|mg|g|kg|kcal|calories?|hours?|days?|weeks?)\b|\d+(?:\.\d+)?\s?%|\b(?:offer|discount|promotion|save|off|free|guarantee|guaranteed|best|leading|number\s+one|no\.?\s*1|top[- ]rated|clinically|reduces?|improves?|increases?|contains?|made\s+with|free\s+from|works?\s+for|provides?|supports?)\b)/i

function meaningfulWords(text: string) {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))
}

function numericFacts(text: string) {
  return [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(%|ml|mg|g|kg|kcal|calories?|hours?|days?|weeks?)?/gi)]
    .map((match) => `${match[1]}${match[2]?.toLowerCase() ?? ''}`)
}

function sourceOverlap(claim: string, source: EvidenceSource) {
  const claimWords = meaningfulWords(claim)
  const sourceWords = meaningfulWords(`${source.title} ${source.text}`)
  const shared = [...claimWords].filter((word) => sourceWords.has(word)).length
  return { shared, coverage: claimWords.size ? shared / claimWords.size : 0 }
}

function analyzeForProfile(content: string, profile: BrandProfile): AnalysisResult {
  const today = new Date().toISOString().slice(0, 10)
  const findings: Finding[] = []
  for (const [index, match] of [...content.matchAll(/[^.!?\n]+/g)].entries()) {
    const claim = match[0].trim()
    if (!claim || !CLAIM_CUES.test(claim)) continue
    const category: FindingCategory = /(?:\d+\s?%\s*(?:off|discount)|\b(?:offer|discount|promotion|save)\b)/i.test(claim) ? 'promotion'
      : /\b(?:best|leading|number\s+one|no\.?\s*1|top[- ]rated)\b/i.test(claim) ? 'comparative_claim'
        : /\d/.test(claim) ? 'product_fact' : 'product_fact'
    const isOffer = category === 'promotion'
    const unitMatch = claim.match(/\b(?:\d+(?:\.\d+)?\s*)(%|ml|mg|g|kg|kcal|calories?|hours?|days?|weeks?)\b/i)?.[1]?.toLowerCase()
    const ranked = profile.sources.map((source) => ({ source, ...sourceOverlap(claim, source) }))
      .filter((item) => item.shared >= 2 || item.coverage >= .55
        || Boolean(unitMatch && new RegExp(`\\b${unitMatch}\\b`, 'i').test(item.source.text))
        || Boolean(isOffer && /offer|discount|promotion|sale|promo/i.test(item.source.text)))
      .sort((a, b) => b.coverage - a.coverage || b.shared - a.shared)
    const best = ranked[0]
    const ambiguous = best && ranked[1] && Math.abs(best.coverage - ranked[1].coverage) < .05
    const evidence = best && !ambiguous ? [best.source] : []
    const claimNumbers = numericFacts(claim)
    const sourceNumbers = new Set(numericFacts(best?.source.text ?? ''))
    const numbersMatch = claimNumbers.every((value) => sourceNumbers.has(value))
    const phraseMatch = Boolean(best && !ambiguous && best.coverage >= .8)
    const expired = Boolean(best?.source.valid_through && best.source.valid_through < today)
    const status: FindingStatus = expired ? 'outdated'
      : !best || ambiguous ? 'unverified'
        : claimNumbers.length > 0 && !numbersMatch ? 'contradicted'
          : numbersMatch && phraseMatch ? 'supported' : 'unverified'
    const role = evidence[0]?.owner ?? profile.sources.find((source) => source.owner)?.owner ?? 'Brand Manager'
    const explanation = !profile.sources.length
      ? 'This workspace has no approved sources yet, so the checker cannot verify this claim.'
      : ambiguous
        ? 'More than one approved source looks relevant. A person needs to choose the right reference.'
        : !best
          ? 'No approved source clearly covers this claim. Treat it as unverified, not false.'
          : expired
            ? `The matching source expired on ${best.source.valid_through}. Confirm it is current before publishing.`
            : status === 'supported'
              ? 'The wording and values align with this approved reference.'
              : status === 'contradicted'
                ? `A value in this claim conflicts with the approved source: ${best.source.text}`
                : `This reference shares some wording, but it does not confirm the claim closely enough. Treat it as unverified, not false.`
    findings.push(makeFinding(
      `claim-${match.index ?? index}`,
      claim,
      category,
      status,
      explanation,
      evidence,
      status === 'supported' ? '' : best ? `Review the wording against “${best.source.title}” or ask ${role} to confirm an exception.` : `Ask ${role} to add an approved source or confirm this claim.`,
      status === 'supported' ? null : role,
    ))
  }
  const summary: AnalysisResult['summary'] = { supported: 0, contradicted: 0, outdated: 0, unverified: 0 }
  findings.forEach((finding) => { summary[finding.status] += 1 })
  return {
    brand_name: profile.name,
    review_date: today,
    overall_status: findings.some((finding) => finding.requires_human_review) ? 'needs_human_review' : 'ready_for_final_approval',
    final_approval_required: true,
    summary,
    findings,
    analysis_note: 'This early-access checker compares claim cues and wording with this workspace’s approved sources. Unmatched copy still needs human review.',
  }
}

export async function analyzeDraft(content: string, profile: BrandProfile): Promise<AnalysisResult> {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
  if (!apiBase) {
    await new Promise((resolve) => window.setTimeout(resolve, 420))
    const isUntouchedSample = profile.id === DEMO_PROFILE.id && JSON.stringify(profile.sources) === JSON.stringify(DEMO_PROFILE.sources)
    return isUntouchedSample ? analyzeInBrowser(content, profile) : analyzeForProfile(content, profile)
  }

  const response = await fetch(`${apiBase}/api/reviews/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, brand_profile_id: profile.id, brand_profile: profile, as_of: profile.isSample ? asOf : new Date().toISOString().slice(0, 10) }),
  })
  if (!response.ok) throw new Error('The review service could not check this draft. Please try again.')
  const result = await response.json() as Omit<AnalysisResult, 'findings'> & { findings: Array<Omit<Finding, 'id'> & { id?: string }> }
  return {
    ...result,
    findings: result.findings.map((finding, index) => ({ ...finding, id: finding.id ?? `${finding.category}-${index}` })),
  }
}
