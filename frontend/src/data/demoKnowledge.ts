import type { BrandProfile, EvidenceSource } from '../types'

// Fictional records for the self-contained Daybreak Coffee judge demo.
export const DEMO_SOURCES: EvidenceSource[] = [
  {
    source_id: 'product-daybreak-01',
    title: 'Cold Brew product facts',
    text: 'Daybreak Cold Brew comes in a 250 ml can and contains 80 mg of caffeine.',
    owner: 'Product Owner',
    kind: 'Product facts',
  },
  {
    source_id: 'offer-2026-11',
    title: 'November offer approval',
    text: '10% off through November 15, 2026.',
    owner: 'Offer Manager',
    kind: 'Promotion',
    valid_from: '2026-11-01',
    valid_through: '2026-11-15',
  },
  {
    source_id: 'voice-daybreak-01',
    title: 'Daybreak brand voice',
    text: 'Warm, direct, and factual. Avoid unsupported superlatives or all-day performance claims.',
    owner: 'Brand Manager',
    kind: 'Brand voice',
  },
]

export const DEMO_AS_OF = '2026-11-10'
export const DEMO_DRAFT = 'Meet Daybreak Cold Brew: 250 ml with 80 mg of caffeine. Get 20% off through November 30!'
export const DEMO_PROFILE: BrandProfile = {
  id: 'daybreak-demo',
  name: 'Daybreak Coffee',
  isSample: true,
  sources: DEMO_SOURCES,
}
