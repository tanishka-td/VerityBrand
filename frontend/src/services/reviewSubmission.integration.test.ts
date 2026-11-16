import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

const env = (globalThis as typeof globalThis & { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const url = env.VERITYBRAND_LOCAL_SUPABASE_URL
const anonKey = env.VERITYBRAND_LOCAL_SUPABASE_ANON_KEY
const accessToken = env.VERITYBRAND_LOCAL_SUPABASE_ACCESS_TOKEN
const workspaceId = env.VERITYBRAND_LOCAL_WORKSPACE_ID
const draftId = env.VERITYBRAND_LOCAL_DRAFT_ID
const content = env.VERITYBRAND_LOCAL_DRAFT_CONTENT

if (url && !['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)) {
  throw new Error('Review concurrency integration tests may only use a local Supabase URL.')
}

const configured = Boolean(url && anonKey && accessToken && workspaceId && draftId && content !== undefined)
const localIntegration = configured ? describe : describe.skip

localIntegration('local review submission concurrency', () => {
  it('allocates distinct adjacent revision numbers for simultaneous submissions to one draft', async () => {
    const supabase = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
    const sourceRows = await supabase.from('approved_sources').select('current_version_id').eq('workspace_id', workspaceId).eq('is_active', true)
    expect(sourceRows.error).toBeNull()
    const submit = (requestId: string) => supabase.functions.invoke('submit-review', {
      body: {
        workspace_id: workspaceId,
        draft_id: draftId,
        request_id: requestId,
        content,
        expected_source_version_ids: (sourceRows.data ?? []).map((row) => row.current_version_id),
      },
    }).then((response) => {
      // Retain the supplied request key for diagnostics and make failures clear.
      return { ...response, requestId }
    })

    const [first, second] = await Promise.all([submit(globalThis.crypto.randomUUID()), submit(globalThis.crypto.randomUUID())])

    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    const results = [first.data, second.data] as Array<{ revision_number: number; review_id: string }>
    expect(results[0].review_id).not.toBe(results[1].review_id)
    expect(results.map((result) => result.revision_number).sort((a, b) => a - b)[1]
      - results.map((result) => result.revision_number).sort((a, b) => a - b)[0]).toBe(1)
  })
})
