import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { submitTrustedReview, TrustedSubmissionError, type TrustedSubmissionDependencies } from './trustedSubmission.ts'

const input = { workspaceId: 'ws', draftId: 'draft', requestId: 'req', content: 'Contains 80 mg caffeine.', expectedSourceVersionIds: ['v1'] }
const source = { source_id: 's1', source_version_id: 'v1', title: 'Coffee facts', text: 'Coffee contains 80 mg caffeine.' }
function dependencies(overrides: Partial<TrustedSubmissionDependencies> = {}): TrustedSubmissionDependencies {
  return {
    getWorkspaceRole: async () => 'owner', getWorkspaceName: async () => 'Coffee Co',
    getDraft: async () => ({ id: 'draft', workspaceId: 'ws', content: input.content }),
    getActiveSourceVersions: async () => [source], getExistingReview: async () => null,
    signPayload: async () => 'signature',
    submitSignedReview: async () => ({ draft_revision_id: 'rev', revision_number: 1, created_at: 'now', review_id: 'review', finding_ids: {}, analysis_origin: 'server_analyzed' }),
    now: () => new Date('2026-11-16T00:00:00Z'), ...overrides,
  }
}

Deno.test('trusted handler core authenticates roles and rejects reviewers', async () => {
  const error = await assertRejects(() => submitTrustedReview(input, 'user', dependencies({ getWorkspaceRole: async () => 'reviewer' })), TrustedSubmissionError)
  assertEquals(error.status, 403)
})
Deno.test('trusted handler core analyzes database source versions and signs generated findings', async () => {
  let signed: Record<string, unknown> | undefined
  const result = await submitTrustedReview(input, 'user', dependencies({ signPayload: async (payload) => { signed = payload; return 'signature' } }))
  assertEquals(result.analysis.findings[0].evidence[0].source_version_id, 'v1')
  assertEquals((signed?.analysis as { findings: unknown[] }).findings.length, 1)
})
Deno.test('trusted handler core rejects stale draft and forged source context', async () => {
  await assertRejects(() => submitTrustedReview(input, 'user', dependencies({ getDraft: async () => ({ id: 'draft', workspaceId: 'ws', content: 'changed' }) })), TrustedSubmissionError)
  await assertRejects(() => submitTrustedReview(input, 'user', dependencies({ getActiveSourceVersions: async () => [{ ...source, source_version_id: 'v2' }] })), TrustedSubmissionError)
})
Deno.test('trusted handler core replays exact retries and rejects request ID conflicts', async () => {
  const existing = { workspaceId: 'ws', draftId: 'draft', content: input.content, sourceVersionIds: ['v1'], result: { draft_revision_id: 'rev', revision_number: 1, created_at: 'now', review_id: 'review', finding_ids: {}, analysis_origin: 'server_analyzed' as const, analysis: { findings: [], summary: {} } as never } }
  const retry = await submitTrustedReview(input, 'user', dependencies({ getExistingReview: async () => existing, getDraft: async () => { throw new Error('unexpected read') } }))
  assertEquals(retry.review_id, 'review')
  await assertRejects(() => submitTrustedReview({ ...input, content: 'different' }, 'user', dependencies({ getExistingReview: async () => existing })), TrustedSubmissionError)
})
