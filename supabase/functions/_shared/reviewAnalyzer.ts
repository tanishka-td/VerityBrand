export type AnalyzerSource = {
  source_id: string
  source_version_id?: string
  title: string
  text: string
  owner?: string
  kind?: string
  valid_from?: string
  valid_through?: string
}

export type AnalyzerProfile = {
  id: string
  name: string
  sources: AnalyzerSource[]
  isSample?: boolean
}

export type AnalyzerStatus = 'supported' | 'contradicted' | 'outdated' | 'unverified'
export type AnalyzerFinding = {
  id: string
  claim: string
  category: 'product_fact' | 'promotion' | 'comparative_claim'
  status: AnalyzerStatus
  severity: 'low' | 'medium' | 'high'
  explanation: string
  evidence: AnalyzerSource[]
  suggested_action: string
  reviewer_role: string | null
  reviewer_question?: string
  requires_human_review: boolean
}

export type DeterministicAnalysisResult = {
  brand_name: string
  review_date: string
  overall_status: 'needs_human_review' | 'ready_for_final_approval'
  final_approval_required: true
  summary: Record<AnalyzerStatus, number>
  findings: AnalyzerFinding[]
  analysis_note: string
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'with', 'for', 'from', 'is', 'are', 'this', 'that', 'through', 'until', 'our', 'your', 'we', 'it', 'by', 'as', 'be', 'will', 'can', 'get', 'off'])
const CLAIM_CUES = /(?:\b\d+(?:\.\d+)?\s?(?:ml|mg|g|kg|kcal|calories?|hours?|days?|weeks?)\b|\d+(?:\.\d+)?\s?%|\b(?:offer|discount|promotion|save|off|free|guarantee|guaranteed|best|leading|number\s+one|no\.?\s*1|top[- ]rated|clinically|reduces?|improves?|increases?|contains?|made\s+with|free\s+from|works?\s+for|provides?|supports?|available|expires?)\b)/i

function makeFinding(id: string, claim: string, category: AnalyzerFinding['category'], status: AnalyzerStatus,
  explanation: string, evidence: AnalyzerSource[], suggestedAction = '', reviewerRole: string | null = null, reviewerQuestion = ''): AnalyzerFinding {
  return {
    id, claim, category, status,
    severity: status === 'supported' ? 'low' : status === 'unverified' || status === 'outdated' || category === 'promotion' ? 'high' : 'medium',
    explanation, evidence, suggested_action: suggestedAction, reviewer_role: reviewerRole,
    ...(reviewerQuestion ? { reviewer_question: reviewerQuestion } : {}),
    requires_human_review: status !== 'supported',
  }
}

function meaningfulWords(text: string) {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))
}

function numericFacts(text: string) {
  return [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(%|ml|mg|g|kg|kcal|calories?|hours?|days?|weeks?)?/gi)]
    .map((match) => `${match[1]}${match[2]?.toLowerCase() ?? ''}`)
}

function sourceOverlap(claim: string, source: AnalyzerSource) {
  const claimWords = meaningfulWords(claim)
  const sourceWords = meaningfulWords(`${source.title} ${source.text}`)
  const shared = [...claimWords].filter((word) => sourceWords.has(word)).length
  return { shared, coverage: claimWords.size ? shared / claimWords.size : 0 }
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function canUseSourceForMatching(source: AnalyzerSource, today: string) {
  const validFrom = source.valid_from
  const validThrough = source.valid_through
  if ((validFrom && !isValidIsoDate(validFrom)) || (validThrough && !isValidIsoDate(validThrough))) return false
  if (validFrom && validThrough && validFrom > validThrough) return false
  return !validFrom || validFrom <= today
}

export function analyzeForProfile(content: string, profile: AnalyzerProfile, asOf: string): DeterministicAnalysisResult {
  const today = asOf
  const findings: AnalyzerFinding[] = []
  for (const [index, match] of [...content.matchAll(/[^.!?\n]+/g)].entries()) {
    const claim = match[0].trim()
    if (!claim || !CLAIM_CUES.test(claim)) continue
    const category: AnalyzerFinding['category'] = /(?:\d+\s?%\s*(?:off|discount)|\b(?:offer|discount|promotion|save)\b)/i.test(claim) ? 'promotion'
      : /\b(?:best|leading|number\s+one|no\.?\s*1|top[- ]rated)\b/i.test(claim) ? 'comparative_claim'
        : /\d/.test(claim) ? 'product_fact' : 'product_fact'
    const isOffer = category === 'promotion'
    // OCR often turns decorative headings such as "November offer" into a
    // finding. They contain no offer terms for the checker to verify.
    const offerHeading = isOffer && !/\d/.test(claim) && meaningfulWords(claim).size <= 3
      && /\b(?:offer|discount|promotion|sale)\b/i.test(claim)
      && !/\b(?:is|are|ends?|expires?|gives?|gets?|save|includes?)\b/i.test(claim.replace(/\b(?:offer|discount|promotion|sale)\b/i, ''))
    if (offerHeading) continue
    const isComparative = category === 'comparative_claim'
    const ranked = profile.sources.filter((source) => canUseSourceForMatching(source, today))
      .map((source) => ({ source, ...sourceOverlap(claim, source) }))
      .filter((item) => isComparative
        ? item.coverage >= .8 && /claim/i.test(`${item.source.kind ?? ''} ${item.source.title}`)
        : item.shared >= 2 || item.coverage >= .55
          || Boolean(isOffer && /offer|discount|promotion|sale|promo/i.test(`${item.source.title} ${item.source.text}`)))
      .sort((a, b) => b.coverage - a.coverage || b.shared - a.shared)
    const best = ranked[0]
    const ambiguous = best && ranked[1] && Math.abs(best.coverage - ranked[1].coverage) < .05
    const evidence = best && !ambiguous ? [best.source] : []
    const claimNumbers = numericFacts(claim)
    const sourceNumbers = new Set(numericFacts(best?.source.text ?? ''))
    const numbersMatch = claimNumbers.every((value) => sourceNumbers.has(value))
    const phraseMatch = Boolean(best && !ambiguous && best.coverage >= .8)
    const expired = Boolean(best?.source.valid_through && best.source.valid_through < today)
    const claimedDate = /\b(?:through|until|till|ends?(?:\s+on)?)\s+([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i.exec(claim)
    const months: Record<string, number> = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 }
    const month = claimedDate ? months[claimedDate[1].toLowerCase()] : undefined
    const day = claimedDate ? Number(claimedDate[2]) : 0
    const year = claimedDate ? Number(claimedDate[3] ?? today.slice(0, 4)) : 0
    const dateCheck = claimedDate && month ? new Date(Date.UTC(year, month - 1, day)) : null
    const invalidDate = Boolean(claimedDate && (!dateCheck || dateCheck.getUTCMonth() !== (month ?? 0) - 1 || dateCheck.getUTCDate() !== day))
    const status: AnalyzerStatus = invalidDate ? 'unverified' : expired ? 'outdated'
      : !best || ambiguous ? 'unverified'
        : claimNumbers.length > 0 && !numbersMatch ? 'contradicted'
          : numbersMatch && phraseMatch ? 'supported' : 'unverified'
    const role = evidence[0]?.owner ?? (category === 'promotion' ? 'Offer Manager' : category === 'comparative_claim' ? 'Brand Manager' : profile.sources.find((source) => source.owner)?.owner ?? 'Brand Manager')
    const comparativePhrase = category === 'comparative_claim' ? claim.match(/#\s*1|no\.?\s*1|number\s+one|best|leading|top[- ]rated/i)?.[0] : null
    const explanation = !profile.sources.length
      ? 'This workspace has no approved sources yet, so the checker cannot verify this claim.'
        : invalidDate
          ? 'This date could not be interpreted confidently. Ask the offer owner to confirm it.'
        : ambiguous
        ? 'More than one approved source looks relevant. A person needs to choose the right reference.'
        : !best && comparativePhrase
          ? `“${comparativePhrase}” is a comparative claim, and no approved evidence for it was found.`
        : !best
          ? 'No approved source clearly covers this claim. Treat it as unverified, not false.'
          : expired
            ? `The matching source expired on ${best.source.valid_through}. Confirm it is current before publishing.`
            : status === 'supported'
              ? 'The wording and values align with this approved reference.'
              : status === 'contradicted'
                ? `A value in this claim conflicts with the approved source: ${best.source.text}`
                : 'This reference shares some wording, but it does not confirm the claim closely enough. Treat it as unverified, not false.'
    const offerTerms = claim.match(/(\d{1,3}%\s*(?:off|discount)).*?(?:through|until)\s+([A-Za-z]+\s+\d{1,2})/i)
    const approvedTerms = best?.source.text.match(/(\d{1,3}%\s*(?:off|discount)).*?(?:through|until)\s+([A-Za-z]+\s+\d{1,2})(,?\s+\d{4})?/i)
    const reviewerQuestion = category === 'promotion' && status === 'contradicted' && offerTerms && approvedTerms
      ? `The approved offer is ${approvedTerms[1]} through ${approvedTerms[2]}${approvedTerms[3] ? `, ${approvedTerms[3].trim().replace(/^,\s*/, '')}` : ''}, but this draft says ${offerTerms[1]} through ${offerTerms[2]}. Is the approved offer still current, or is there updated approval for the draft terms?`
      : ''
    findings.push(makeFinding(
      `claim-${match.index ?? index}`,
      claim,
      category,
      status,
      explanation,
      evidence,
      status === 'supported' ? '' : best ? `Review the wording against “${best.source.title}” or ask ${role} to confirm an exception.` : `Ask ${role} to add an approved source or confirm this claim.`,
      status === 'supported' ? null : role,
      reviewerQuestion,
    ))
  }
  const summary: DeterministicAnalysisResult['summary'] = { supported: 0, contradicted: 0, outdated: 0, unverified: 0 }
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
