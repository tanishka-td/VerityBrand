import { describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '../types'
import { createReviewSubmission } from './reviewSubmission'

const submission = {
  workspaceId: 'workspace-1', draftId: 'draft-1', content: 'Contains 80 mg.', sourceVersionIds: ['version-1'],
}
const analysis: AnalysisResult = {
  brand_name: 'Northstar', review_date: '2026-11-16', overall_status: 'ready_for_final_approval', final_approval_required: true,
  summary: { supported: 1, contradicted: 0, outdated: 0, unverified: 0 },
  findings: [{ id: 'claim-0', claim: 'Contains 80 mg.', category: 'product_fact', status: 'supported', severity: 'low', explanation: 'Matches the source.', evidence: [], suggested_action: '', reviewer_role: null, requires_human_review: false }],
}
const submitted = {
  draft_revision_id: 'revision-1', revision_number: 1, created_at: '2026-11-16T12:00:00Z',
  review_id: 'review-1', finding_ids: { 'claim-0': 'finding-1' }, analysis_origin: 'server_analyzed' as const,
  analysis,
}

const functionClient = (invoke: ReturnType<typeof vi.fn>) => ({ functions: { invoke: invoke as unknown as (name: string, options: { body: Record<string, unknown> }) => PromiseLike<{ data: unknown; error: unknown | null }> } })

function memoryStorage() {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  }
}

const testFingerprint = async (payload: string) => {
  let hash = 2166136261
  for (const character of payload) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return `test:${hash >>> 0}`
}

describe('createReviewSubmission', () => {
  it('reuses the request ID and exact payload when retrying a failed submission', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'Connection dropped' } })
      .mockResolvedValueOnce({ data: submitted, error: null })
    const submit = createReviewSubmission(functionClient(invoke), () => 'request-1')

    await expect(submit(submission)).rejects.toMatchObject({ message: 'Connection dropped' })
    const result = await submit(submission)

    expect(result).toEqual(submitted)
    expect(invoke).toHaveBeenNthCalledWith(1, 'submit-review', {
      body: {
        workspace_id: 'workspace-1', draft_id: 'draft-1', request_id: 'request-1',
        content: 'Contains 80 mg.', expected_source_version_ids: ['version-1'],
      },
    })
    expect(invoke.mock.calls[1]).toEqual(invoke.mock.calls[0])
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain('findings')
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain('source_text')
  })

  it('uses a new request ID when the payload changes after a failure', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'Connection dropped' } })
      .mockResolvedValueOnce({ data: { ...submitted, review_id: 'review-2' }, error: null })
    const ids = ['request-1', 'request-2']
    const submit = createReviewSubmission(functionClient(invoke), () => ids.shift()!)

    await expect(submit(submission)).rejects.toMatchObject({ message: 'Connection dropped' })
    await submit({ ...submission, content: 'Contains 90 mg.' })

    expect(invoke.mock.calls.map(([, options]) => (options as { body: { request_id: string } }).body.request_id))
      .toEqual(['request-1', 'request-2'])
  })

  it('releases the request ID after success so a later identical check is a new submission', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: submitted, error: null })
    const ids = ['request-1', 'request-2']
    const submit = createReviewSubmission(functionClient(invoke), () => ids.shift()!)

    await submit(submission)
    await submit(submission)

    expect(invoke.mock.calls.map(([, options]) => (options as { body: { request_id: string } }).body.request_id))
      .toEqual(['request-1', 'request-2'])
  })

  it('reuses the pending request ID after a page reload and clears it only after success', async () => {
    const storage = memoryStorage()
    const firstInvoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection dropped' } })
    const firstTab = createReviewSubmission(functionClient(firstInvoke), () => 'request-1', storage, testFingerprint)

    await expect(firstTab(submission)).rejects.toMatchObject({ message: 'Connection dropped' })
    expect([...storage.entries.values()].join('')).not.toContain(submission.content)

    const retryInvoke = vi.fn().mockResolvedValue({ data: submitted, error: null })
    const reloadedTab = createReviewSubmission(functionClient(retryInvoke), () => 'request-2', storage, testFingerprint)
    await reloadedTab(submission)

    expect((retryInvoke.mock.calls[0][1] as { body: { request_id: string } }).body.request_id).toBe('request-1')
    expect(storage.entries.size).toBe(0)
  })

  it('rotates a persisted request ID when the logical payload changes', async () => {
    const storage = memoryStorage()
    const firstInvoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection dropped' } })
    const firstTab = createReviewSubmission(functionClient(firstInvoke), () => 'request-1', storage, testFingerprint)
    await expect(firstTab(submission)).rejects.toMatchObject({ message: 'Connection dropped' })

    const changedInvoke = vi.fn().mockResolvedValue({ data: submitted, error: null })
    const nextTab = createReviewSubmission(functionClient(changedInvoke), () => 'request-2', storage, testFingerprint)
    await nextTab({ ...submission, content: 'Contains 90 mg.' })

    expect((changedInvoke.mock.calls[0][1] as { body: { request_id: string } }).body.request_id).toBe('request-2')
    expect(storage.entries.size).toBe(0)
  })
})
