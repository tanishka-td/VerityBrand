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

  it('uses the richer sample to demonstrate each review outcome with the right evidence', async () => {
    const result = await analyzeDraft(DEMO_DRAFT, DEMO_PROFILE)

    expect(result.review_date).toBe('2026-11-10')
    expect(result.summary).toEqual({ supported: 1, contradicted: 1, outdated: 1, unverified: 1 })
    expect(result.findings.find((finding) => finding.status === 'outdated')?.evidence[0]).toMatchObject({
      source_id: 'summer-approval-2026',
      valid_through: '2026-08-31',
    })
    expect(result.findings.find((finding) => finding.status === 'unverified')).toMatchObject({
      requires_human_review: true,
      evidence: [],
    })
  })

  it('clears outdated and unverified claims when the creator removes them from the draft', async () => {
    const revised = DEMO_DRAFT
      .replace('20% off through November 30, 2026', '10% off through November 15, 2026')
      .replace('The Summer Blend is still available through August 31, 2026, and uses Guatemala beans.\n', '')
      .replace('Daybreak is the best cold brew in the city.', '')
      .trim()
    const result = await analyzeDraft(revised, DEMO_PROFILE)

    expect(result.findings.map((finding) => finding.status)).toEqual(['supported', 'supported'])
  })

  it('labels a claim without approved evidence unverified rather than false', async () => {
    const profile: BrandProfile = { id: 'empty-brand', name: 'Empty Brand', sources: [] }
    const result = await analyzeDraft('This is the best coffee.', profile)

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ status: 'unverified', requires_human_review: true })
    expect(result.findings[0].explanation.toLowerCase()).not.toContain('false')
  })

  it('does not attach a source just because it mentions the same unit', async () => {
    const profile: BrandProfile = {
      id: 'custom-brand',
      name: 'Custom Brand',
      sources: [{ source_id: 'coffee-1', title: 'Coffee size', text: 'Our coffee is served in a 250 ml cup.' }],
    }
    const result = await analyzeDraft('Our serum is 900 ml.', profile)

    expect(result.findings[0]).toMatchObject({ status: 'unverified', evidence: [] })
  })

  it('keeps an impossible offer date unverified', async () => {
    const result = await analyzeDraft('Get 10% off through November 31, 2026.', DEMO_PROFILE)
    const promotion = result.findings.find((finding) => finding.category === 'promotion')

    expect(promotion).toMatchObject({ status: 'unverified', requires_human_review: true })
  })
})
