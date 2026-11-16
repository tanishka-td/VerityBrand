import type { AnalysisResult, BrandProfile, Finding } from '../types'
import { DEMO_AS_OF } from '../data/demoKnowledge'
import { analyzeForProfile } from '../../../supabase/functions/_shared/reviewAnalyzer'

export async function analyzeDraft(content: string, profile: BrandProfile): Promise<AnalysisResult> {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')
  if (!apiBase) {
    await new Promise((resolve) => window.setTimeout(resolve, 420))
    const asOf = profile.isSample ? DEMO_AS_OF : new Date().toISOString().slice(0, 10)
    return analyzeForProfile(content, profile, asOf) as AnalysisResult
  }

  const response = await fetch(`${apiBase}/api/reviews/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, brand_profile_id: profile.id, brand_profile: profile, as_of: profile.isSample ? DEMO_AS_OF : new Date().toISOString().slice(0, 10) }),
  })
  if (!response.ok) throw new Error('The review service could not check this draft. Please try again.')
  const result = await response.json() as Omit<AnalysisResult, 'findings'> & { findings: Array<Omit<Finding, 'id'> & { id?: string }> }
  return {
    ...result,
    findings: result.findings.map((finding, index) => ({ ...finding, id: finding.id ?? `${finding.category}-${index}` })),
  }
}
