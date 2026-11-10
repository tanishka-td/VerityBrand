import { describe, expect, it } from 'vitest'
import { analyzeDraft } from './reviewApi'
import { DEMO_DRAFT, DEMO_PROFILE } from '../data/demoKnowledge'
import type { BrandProfile } from '../types'

describe('analyzeDraft', () => {
  it('checks Daybreak product claims and flags the offer mismatch with approved evidence', async () => {
    const result = await analyzeDraft(DEMO_DRAFT, DEMO_PROFILE)
    const volume = result.findings.find((finding) => finding.claim.includes('250 ml'))
    const caffeine = result.findings.find((finding) => finding.claim.includes('80 mg'))
    const promotion = result.findings.find((finding) => finding.category === 'promotion')

    expect(result.review_date).toBe('2026-11-10')
    expect(volume).toMatchObject({ status: 'supported', requires_human_review: false })
    expect(volume?.evidence[0]).toMatchObject({ source_id: 'product-daybreak-01' })
    expect(caffeine).toMatchObject({ status: 'supported', requires_human_review: false })
    expect(caffeine?.evidence[0]).toMatchObject({ source_id: 'product-daybreak-01' })
    expect(promotion).toMatchObject({
      status: 'contradicted',
      reviewer_role: 'Offer Manager',
      requires_human_review: true,
    })
    expect(promotion?.claim).toContain('20% off through November 30')
    expect(promotion?.evidence[0]).toMatchObject({
      source_id: 'offer-2026-11',
      text: '10% off through November 15, 2026.',
    })
  })

  it('labels a claim without approved evidence unverified rather than false', async () => {
    const profile: BrandProfile = { id: 'empty-brand', name: 'Empty Brand', sources: [] }
    const result = await analyzeDraft('This is the best coffee.', profile)

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ status: 'unverified', requires_human_review: true })
    expect(result.findings[0].explanation.toLowerCase()).not.toContain('false')
  })
})
