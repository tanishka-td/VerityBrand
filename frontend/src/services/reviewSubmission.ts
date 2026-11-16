import type { AnalysisResult } from '../types'

export type ReviewSubmissionInput = {
  workspaceId: string
  draftId: string
  content: string
  sourceVersionIds: string[]
}

export type ReviewSubmissionResult = {
  draft_revision_id: string
  revision_number: number
  created_at: string
  review_id: string
  finding_ids: Record<string, string>
  analysis_origin: 'server_analyzed'
  analysis: AnalysisResult
}

type FunctionClient = {
  functions: {
    invoke: (name: string, options: { body: Record<string, unknown> }) => PromiseLike<{ data: unknown; error: unknown | null }>
  }
}

type SubmissionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type PendingRequest = { fingerprint: string; requestId: string }

function newRequestId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure request IDs are unavailable in this browser.')
  return globalThis.crypto.randomUUID()
}

async function fingerprintPayload(payload: string) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure review fingerprinting is unavailable in this browser.')
  const bytes = new TextEncoder().encode(payload)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function browserSessionStorage(): SubmissionStorage {
  try {
    if (typeof window === 'undefined') throw new Error()
    return window.sessionStorage
  } catch {
    throw new Error('Session storage is unavailable; this review cannot be retried safely after a reload.')
  }
}

function readPending(storage: SubmissionStorage, key: string): PendingRequest | null {
  const value = storage.getItem(key)
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<PendingRequest>
    if (typeof parsed.requestId === 'string' && typeof parsed.fingerprint === 'string') return parsed as PendingRequest
  } catch { /* Replace malformed local retry metadata with a fresh request ID. */ }
  storage.removeItem(key)
  return null
}

function requestStorageKey(input: ReviewSubmissionInput) {
  return `veritybrand:pending-review:v1:${encodeURIComponent(input.workspaceId)}:${encodeURIComponent(input.draftId)}`
}

export function createReviewSubmission(
  client: FunctionClient,
  makeRequestId: () => string = newRequestId,
  storageOverride?: SubmissionStorage,
  fingerprint = fingerprintPayload,
) {

  return async function submit(input: ReviewSubmissionInput): Promise<ReviewSubmissionResult> {
    const storage = storageOverride ?? browserSessionStorage()
    const key = requestStorageKey(input)
    const sourceVersionIds = [...new Set(input.sourceVersionIds)].sort()
    const payloadFingerprint = await fingerprint(JSON.stringify({
      workspaceId: input.workspaceId,
      draftId: input.draftId,
      content: input.content,
      sourceVersionIds,
    }))
    const saved = readPending(storage, key)
    const pending = saved?.fingerprint === payloadFingerprint
      ? saved
      : { fingerprint: payloadFingerprint, requestId: makeRequestId() }
    if (pending !== saved) {
      storage.setItem(key, JSON.stringify(pending))
    }

    const { data, error } = await client.functions.invoke('submit-review', {
      body: {
        workspace_id: input.workspaceId,
        draft_id: input.draftId,
        request_id: pending.requestId,
        content: input.content,
        expected_source_version_ids: sourceVersionIds,
      },
    })

    if (error) throw error
    if (!data) throw new Error('Review submission returned no result.')

    const result = data as Partial<ReviewSubmissionResult>
    if (!result.draft_revision_id || typeof result.revision_number !== 'number'
      || !result.created_at || !result.review_id || !result.finding_ids
      || result.analysis_origin !== 'server_analyzed' || !result.analysis || !Array.isArray(result.analysis.findings)) {
      throw new Error('Review submission returned an incomplete result.')
    }

    const current = readPending(storage, key)
    if (current?.requestId === pending.requestId && current.fingerprint === pending.fingerprint) storage.removeItem(key)
    return result as ReviewSubmissionResult
  }
}
