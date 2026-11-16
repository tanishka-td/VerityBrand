import { describe, expect, it } from 'vitest'
import { analyzeDraft } from './reviewApi'
import { DEMO_DRAFT, DEMO_PROFILE } from '../data/demoKnowledge'
import type { BrandProfile } from '../types'

describe('analyzeDraft', () => {
  const today = new Date().toISOString().slice(0, 10)
  const shiftDate = (date: string, days: number) => {
    const value = new Date(`${date}T00:00:00Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
  }
  const sourceValidityProfile = (valid_from?: string, valid_through?: string): BrandProfile => ({
    id: 'validity-brand',
    name: 'Validity Brand',
    sources: [{
      source_id: 'validity-source',
      title: 'Product facts',
      text: 'Our coffee contains 80 mg of caffeine.',
      ...(valid_from === undefined ? {} : { valid_from }),
      ...(valid_through === undefined ? {} : { valid_through }),
    }],
  })

  it('supports a claim using a source valid today', async () => {
    const result = await analyzeDraft('Our coffee contains 80 mg of caffeine.', sourceValidityProfile(shiftDate(today, -1), shiftDate(today, 1)))

    expect(result.findings[0]).toMatchObject({ status: 'supported', evidence: [{ source_id: 'validity-source' }] })
  })

  it('does not use a future-dated source as evidence', async () => {
    const result = await analyzeDraft('Our coffee contains 80 mg of caffeine.', sourceValidityProfile(shiftDate(today, 1), shiftDate(today, 5)))

    expect(result.findings[0]).toMatchObject({ status: 'unverified', evidence: [] })
  })

  it('keeps an expired source outdated instead of supporting the claim', async () => {
    const result = await analyzeDraft('Our coffee contains 80 mg of caffeine.', sourceValidityProfile(shiftDate(today, -5), shiftDate(today, -1)))

    expect(result.findings[0]).toMatchObject({ status: 'outdated', evidence: [{ source_id: 'validity-source' }] })
  })

  it('treats missing validity dates as unbounded', async () => {
    const result = await analyzeDraft('Our coffee contains 80 mg of caffeine.', sourceValidityProfile())

    expect(result.findings[0]).toMatchObject({ status: 'supported', evidence: [{ source_id: 'validity-source' }] })
  })

  it.each([
    ['invalid start date', '2026-02-30', shiftDate(today, 5)],
    ['invalid end date', shiftDate(today, -5), 'not-a-date'],
  ])('does not use a source with an %s as evidence', async (_label, validFrom, validThrough) => {
    const result = await analyzeDraft('Our coffee contains 80 mg of caffeine.', sourceValidityProfile(validFrom, validThrough))

    expect(result.findings[0]).toMatchObject({ status: 'unverified', evidence: [] })
  })

  it('does not use a source whose validity range is reversed', async () => {
    const result = await analyzeDraft('Our coffee contains 80 mg of caffeine.', sourceValidityProfile(shiftDate(today, 5), shiftDate(today, -5)))

    expect(result.findings[0]).toMatchObject({ status: 'unverified', evidence: [] })
  })

  it('treats valid_from and valid_through as inclusive boundary dates', async () => {
    const startsToday = await analyzeDraft('Our coffee contains 80 mg of caffeine.', sourceValidityProfile(today, shiftDate(today, 5)))
    const endsToday = await analyzeDraft('Our coffee contains 80 mg of caffeine.', sourceValidityProfile(shiftDate(today, -5), today))

    expect(startsToday.findings[0].status).toBe('supported')
    expect(endsToday.findings[0].status).toBe('supported')
  })

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

  it('does not treat an OCR offer heading as an approved claim', async () => {
    const extractedImageText = [
      'DAYBREAK COFFEE',
      'NOVEMBER OFFER Ei',
      '20% OFF',
      'THROUGH NOVEMBER 30, 2026',
      'BEST COLD BREW IN THE CITY',
      '250 ML CAN - 80 MG CAFFEINE',
    ].join('\n')
    const result = await analyzeDraft(extractedImageText, DEMO_PROFILE)

    expect(result.findings.some((finding) => /november offer/i.test(finding.claim))).toBe(false)
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ claim: '20% OFF', status: 'contradicted' }),
      expect.objectContaining({ claim: 'BEST COLD BREW IN THE CITY', status: 'unverified', evidence: [] }),
      expect.objectContaining({ claim: '250 ML CAN - 80 MG CAFFEINE', status: 'supported' }),
    ]))
  })
})
