import { describe, expect, it } from 'vitest'
import { analyzeForProfile } from '../../../supabase/functions/_shared/reviewAnalyzer'

describe('shared deterministic review analyzer', () => {
  const profile = {
    id: 'workspace-1',
    name: 'Northstar',
    sources: [
      { source_id: 'product-1', source_version_id: 'version-1', title: 'Cold Brew product facts', text: 'Daybreak Cold Brew comes in a 250 ml can and contains 80 mg of caffeine.' },
      { source_id: 'expired-1', source_version_id: 'version-expired', title: 'Old coffee facts', text: 'Our classic coffee contains 80 mg of caffeine.', valid_through: '2020-01-01' },
      { source_id: 'future-1', source_version_id: 'version-future', title: 'Future tea facts', text: 'Our new tea contains 50 mg of caffeine.', valid_from: '2030-01-01' },
    ],
  }

  it('retains the existing four outcomes and carries exact version references into evidence', () => {
    const result = analyzeForProfile([
      'Daybreak Cold Brew comes in a 250 ml can and contains 80 mg of caffeine.',
      'Daybreak Cold Brew comes in a 250 ml can and contains 90 mg of caffeine.',
      'Our classic coffee contains 80 mg of caffeine.',
      'Our new tea contains 50 mg of caffeine.',
    ].join('\n'), profile, '2026-11-16')

    expect(result.findings.map((finding) => finding.status)).toEqual([
      'supported', 'contradicted', 'outdated', 'unverified',
    ])
    expect(result.findings[0].evidence[0].source_version_id).toBe('version-1')
    expect(result.summary).toEqual({ supported: 1, contradicted: 1, outdated: 1, unverified: 1 })
  })
})
