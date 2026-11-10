export type FindingStatus = 'supported' | 'contradicted' | 'outdated' | 'unverified'
export type FindingCategory = 'product_fact' | 'promotion' | 'comparative_claim'

export interface EvidenceSource {
  source_id: string
  title: string
  text: string
  owner?: string
  kind?: string
  valid_from?: string
  valid_through?: string
}

export interface BrandProfile {
  id: string
  name: string
  sources: EvidenceSource[]
  isSample?: boolean
}

export interface Finding {
  id: string
  claim: string
  category: FindingCategory | string
  status: FindingStatus
  severity: 'low' | 'medium' | 'high'
  explanation: string
  evidence: EvidenceSource[]
  suggested_action: string
  reviewer_role: string | null
  requires_human_review: boolean
}

export interface AnalysisResult {
  brand_name: string
  review_date: string
  overall_status: 'needs_human_review' | 'ready_for_final_approval'
  final_approval_required: boolean
  summary: Record<FindingStatus, number>
  findings: Finding[]
  analysis_note?: string
}

export type ReviewSnapshot = AnalysisResult & {
  _reviewedContent: string
  _reviewedProfileId: string
  _reviewedSources: string
}

export type ReviewDecision = 'not_sent' | 'sent' | 'confirmed' | 'evidence_requested' | 'exception_approved'
