import { describe, expect, it, vi } from 'vitest'
import { submitTrustedReview, TrustedSubmissionError, type TrustedSubmissionDependencies } from '../../../supabase/functions/_shared/trustedSubmission'

const input = { workspaceId: 'ws', draftId: 'draft', requestId: 'req', content: 'Contains 80 mg caffeine.', expectedSourceVersionIds: ['v1'] }
const source = { source_id: 's1', source_version_id: 'v1', title: 'Coffee facts', text: 'Coffee contains 80 mg caffeine.' }
const deps = (overrides: Partial<TrustedSubmissionDependencies> = {}): TrustedSubmissionDependencies => ({
  getWorkspaceRole: vi.fn().mockResolvedValue('owner'),
  getWorkspaceName: vi.fn().mockResolvedValue('Coffee Co'),
  getDraft: vi.fn().mockResolvedValue({ id: 'draft', workspaceId: 'ws', content: input.content }),
  getActiveSourceVersions: vi.fn().mockResolvedValue([source]),
  getExistingReview: vi.fn().mockResolvedValue(null),
  signPayload: vi.fn().mockResolvedValue('signed'),
  submitSignedReview: vi.fn().mockResolvedValue({ draft_revision_id: 'rev', revision_number: 1, created_at: '2026-11-16T00:00:00Z', review_id: 'review', finding_ids: { 'claim-0': 'finding' }, analysis_origin: 'server_analyzed' }),
  now: () => new Date('2026-11-16T00:00:00Z'),
  ...overrides,
})

describe('trusted review submission core used by the Edge Function', () => {
  it('checks persisted draft and source versions, analyzes and signs only server-created findings', async () => {
    const dependencies = deps()
    const result = await submitTrustedReview(input, 'user', dependencies)
    expect(result.analysis.findings[0].status).toBe('supported')
    expect(result.analysis.findings[0].evidence[0].source_version_id).toBe('v1')
    expect(dependencies.signPayload).toHaveBeenCalledWith(expect.objectContaining({ actor_id: 'user', sources_snapshot: [source], analysis: result.analysis }))
    expect(dependencies.submitSignedReview).toHaveBeenCalledWith(expect.objectContaining({ p_server_signature: 'signed', p_analysis: result.analysis }))
  })

  it('rejects unauthorized roles before reading or submitting review data', async () => {
    const dependencies = deps({ getWorkspaceRole: vi.fn().mockResolvedValue('reviewer') })
    await expect(submitTrustedReview(input, 'user', dependencies)).rejects.toMatchObject({ status: 403 })
    expect(dependencies.getDraft).not.toHaveBeenCalled()
    expect(dependencies.submitSignedReview).not.toHaveBeenCalled()
  })

  it('rejects stale drafts and source-version context', async () => {
    await expect(submitTrustedReview(input, 'user', deps({ getDraft: vi.fn().mockResolvedValue({ id: 'draft', workspaceId: 'ws', content: 'new content' }) })))
      .rejects.toMatchObject({ status: 409 })
    await expect(submitTrustedReview(input, 'user', deps({ getActiveSourceVersions: vi.fn().mockResolvedValue([{ ...source, source_version_id: 'v2' }]) })))
      .rejects.toMatchObject({ status: 409 })
  })

  it('replays an exact successful request before reading mutable current state', async () => {
    const original = await submitTrustedReview(input, 'user', deps())
    const dependencies = deps({ getExistingReview: vi.fn().mockResolvedValue({ workspaceId: 'ws', draftId: 'draft', content: input.content, sourceVersionIds: ['v1'], result: { ...original } }), getDraft: vi.fn().mockRejectedValue(new Error('must not reload')) })
    await expect(submitTrustedReview(input, 'user', dependencies)).resolves.toEqual(original)
    expect(dependencies.getDraft).not.toHaveBeenCalled()
    expect(dependencies.submitSignedReview).not.toHaveBeenCalled()
  })

  it('rejects a request ID reused with different content', async () => {
    const existing = { workspaceId: 'ws', draftId: 'draft', content: input.content, sourceVersionIds: ['v1'], result: { draft_revision_id: 'rev', revision_number: 1, created_at: 'now', review_id: 'review', finding_ids: {}, analysis_origin: 'server_analyzed' as const, analysis: {} as never } }
    await expect(submitTrustedReview({ ...input, content: 'Changed claim.' }, 'user', deps({ getExistingReview: vi.fn().mockResolvedValue(existing) })))
      .rejects.toBeInstanceOf(TrustedSubmissionError)
  })
})
