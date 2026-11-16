import { createClient } from '@supabase/supabase-js'
import { submitTrustedReview, TrustedSubmissionError, type ActiveSourceVersion } from '../_shared/trustedSubmission.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function env(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`)
  return value
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json(401, { error: 'Authentication is required.' })

  try {
    const baseUrl = env('SUPABASE_URL')
    const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? env('SUPABASE_ANON_KEY')
    const secretKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY')
    const userDb = createClient(baseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: authData, error: authError } = await userDb.auth.getUser(token)
    if (authError || !authData.user) return json(401, { error: 'Authentication is required.' })
    const body = await request.json()
    if (!body || typeof body !== 'object'
      || typeof body.workspace_id !== 'string'
      || typeof body.draft_id !== 'string'
      || typeof body.request_id !== 'string'
      || typeof body.content !== 'string'
      || !Array.isArray(body.expected_source_version_ids)
      || body.expected_source_version_ids.some((id: unknown) => typeof id !== 'string')) {
      return json(400, { error: 'The review submission request is malformed.' })
    }
    const input = {
      workspaceId: body.workspace_id,
      draftId: body.draft_id,
      requestId: body.request_id,
      content: body.content,
      expectedSourceVersionIds: body.expected_source_version_ids,
    }
    const serverDb = createClient(baseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const result = await submitTrustedReview(input, authData.user.id, {
      async getWorkspaceRole(workspaceId, userId) {
        const { data, error } = await userDb.from('workspace_members').select('member_role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()
        if (error) throw error
        return data?.member_role ?? null
      },
      async getWorkspaceName(workspaceId) {
        const { data, error } = await userDb.from('workspaces').select('name').eq('id', workspaceId).single()
        if (error) throw error
        return data.name
      },
      async getDraft(workspaceId, draftId) {
        const { data, error } = await userDb.from('drafts').select('id,workspace_id,content').eq('workspace_id', workspaceId).eq('id', draftId).maybeSingle()
        if (error) throw error
        return data ? { id: data.id, workspaceId: data.workspace_id, content: data.content } : null
      },
      async getActiveSourceVersions(workspaceId): Promise<ActiveSourceVersion[]> {
        const { data: rows, error } = await userDb.from('approved_sources').select('id,current_version_id').eq('workspace_id', workspaceId).eq('is_active', true).order('created_at').order('id')
        if (error) throw error
        const ids = (rows ?? []).map((row) => row.current_version_id)
        if (!ids.length) return []
        const { data: versions, error: versionError } = await userDb.from('approved_source_versions').select('*').eq('workspace_id', workspaceId).in('id', ids).eq('is_active', true)
        if (versionError) throw versionError
        const versionsById = new Map((versions ?? []).map((version) => [version.id, version]))
        if (ids.some((id) => !versionsById.has(id))) throw new Error('A current approved source version is unavailable.')
        return (rows ?? []).map((row) => {
          const version = versionsById.get(row.current_version_id)!
          return {
            source_id: row.id,
            source_version_id: version.id,
            title: version.title,
            text: version.source_text,
            owner: version.owner_label ?? undefined,
            kind: version.kind ?? undefined,
            valid_from: version.valid_from ?? undefined,
            valid_through: version.valid_through ?? undefined,
          }
        })
      },
      async getExistingReview(workspaceId, requestId) {
        const { data: review, error } = await userDb.from('reviews').select('id,draft_id,draft_revision_id,analysis_origin,review_date,overall_status,final_approval_required,summary,analysis_note,draft_revisions!inner(id,workspace_id,draft_id,revision_number,content,created_at),findings(*)').eq('workspace_id', workspaceId).eq('submission_request_id', requestId).maybeSingle()
        if (error) throw error
        if (!review) return null
        const revision = Array.isArray(review.draft_revisions) ? review.draft_revisions[0] : review.draft_revisions
        const findings = (review.findings ?? []).map((finding) => ({ ...finding, id: finding.client_finding_key ?? finding.id }))
        const sourceLinks = await userDb.from('review_source_versions').select('source_version_id').eq('review_id', review.id).eq('workspace_id', workspaceId)
        if (sourceLinks.error) throw sourceLinks.error
        const { data: workspace, error: workspaceError } = await userDb.from('workspaces').select('name').eq('id', workspaceId).single()
        if (workspaceError) throw workspaceError
        const analysis = {
          brand_name: workspace.name, review_date: review.review_date, overall_status: review.overall_status,
          final_approval_required: review.final_approval_required, summary: review.summary,
          analysis_note: review.analysis_note ?? '', findings,
        }
        return {
          workspaceId,
          draftId: review.draft_id,
          content: revision.content,
          sourceVersionIds: (sourceLinks.data ?? []).map((link) => link.source_version_id),
          result: {
            draft_revision_id: review.draft_revision_id,
            revision_number: revision.revision_number,
            created_at: revision.created_at,
            review_id: review.id,
            finding_ids: Object.fromEntries((review.findings ?? []).filter((finding) => finding.client_finding_key).map((finding) => [finding.client_finding_key, finding.id])),
            analysis_origin: review.analysis_origin,
            analysis,
          },
        }
      },
      async signPayload(payload) {
        const { data, error } = await serverDb.rpc('sign_review_analysis_payload', { p_payload: payload })
        if (error) throw error
        return data as string
      },
      async submitSignedReview(args) {
        const { data, error } = await userDb.rpc('submit_review_trusted', args)
        if (error) throw error
        return data
      },
    })
    return json(200, result)
  } catch (error) {
    if (error instanceof TrustedSubmissionError) return json(error.status, { error: error.message })
    console.error('Trusted review submission failed', error)
    return json(500, { error: 'The review could not be submitted. Retry using the same request.' })
  }
})
