import { analyzeForProfile, type AnalyzerProfile, type AnalyzerSource, type DeterministicAnalysisResult } from './reviewAnalyzer.ts'

export type TrustedSubmissionInput = {
  workspaceId: string
  draftId: string
  requestId: string
  content: string
  expectedSourceVersionIds: string[]
}

export type PersistedReviewResult = {
  draft_revision_id: string
  revision_number: number
  created_at: string
  review_id: string
  finding_ids: Record<string, string>
  analysis_origin: 'server_analyzed'
}

export type TrustedSubmissionResult = PersistedReviewResult & {
  analysis: DeterministicAnalysisResult
}

export type ActiveSourceVersion = AnalyzerSource & {
  source_version_id: string
}

export type ExistingTrustedReview = {
  workspaceId: string
  draftId: string
  content: string
  sourceVersionIds: string[]
  result: TrustedSubmissionResult
}

export class TrustedSubmissionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'TrustedSubmissionError'
  }
}

export type TrustedSubmissionDependencies = {
  getWorkspaceRole: (workspaceId: string, userId: string) => Promise<string | null>
  getWorkspaceName: (workspaceId: string) => Promise<string>
  getDraft: (workspaceId: string, draftId: string) => Promise<{ id: string; workspaceId: string; content: string } | null>
  getActiveSourceVersions: (workspaceId: string) => Promise<ActiveSourceVersion[]>
  getExistingReview: (workspaceId: string, requestId: string) => Promise<ExistingTrustedReview | null>
  signPayload: (payload: Record<string, unknown>) => Promise<string>
  submitSignedReview: (args: Record<string, unknown>) => Promise<PersistedReviewResult>
  now?: () => Date
}

const VALID_STATUSES = new Set(['supported', 'contradicted', 'outdated', 'unverified'])

function sortedUnique(values: string[]) {
  return [...new Set(values)].sort()
}

function sameIds(left: string[], right: string[]) {
  const a = sortedUnique(left)
  const b = sortedUnique(right)
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function assertAnalysisReferencesSources(analysis: DeterministicAnalysisResult, sources: ActiveSourceVersion[]) {
  const versions = new Map(sources.map((source) => [source.source_version_id, source.source_id]))
  const counts = { supported: 0, contradicted: 0, outdated: 0, unverified: 0 }
  for (const finding of analysis.findings) {
    if (!VALID_STATUSES.has(finding.status)) throw new TrustedSubmissionError(500, 'The analysis returned an unsupported finding status.')
    counts[finding.status] += 1
    for (const evidence of finding.evidence) {
      if (!evidence.source_version_id || versions.get(evidence.source_version_id) !== evidence.source_id) {
        throw new TrustedSubmissionError(500, 'The analysis returned evidence outside the loaded source versions.')
      }
    }
  }
  if (JSON.stringify(counts) !== JSON.stringify(analysis.summary)) {
    throw new TrustedSubmissionError(500, 'The analysis summary does not match its findings.')
  }
}

function existingResultMatches(input: TrustedSubmissionInput, existing: ExistingTrustedReview) {
  return existing.workspaceId === input.workspaceId
    && existing.draftId === input.draftId
    && existing.content === input.content
    && sameIds(existing.sourceVersionIds, input.expectedSourceVersionIds)
    && existing.result.analysis_origin === 'server_analyzed'
}

export async function submitTrustedReview(
  input: TrustedSubmissionInput,
  userId: string,
  dependencies: TrustedSubmissionDependencies,
): Promise<TrustedSubmissionResult> {
  if (!userId) throw new TrustedSubmissionError(401, 'Authentication is required.')
  if (!input.workspaceId || !input.draftId || !input.requestId || !input.content.trim()) {
    throw new TrustedSubmissionError(400, 'Workspace, draft, request ID, and content are required.')
  }
  if (!Array.isArray(input.expectedSourceVersionIds)
    || input.expectedSourceVersionIds.some((id) => typeof id !== 'string' || !id)) {
    throw new TrustedSubmissionError(400, 'Expected source version IDs are malformed.')
  }

  const role = await dependencies.getWorkspaceRole(input.workspaceId, userId)
  if (role !== 'owner' && role !== 'editor') {
    throw new TrustedSubmissionError(403, 'Only workspace Owners and Editors can submit reviews.')
  }

  // Resolve retries before reading mutable current state. A successful request
  // remains replayable even if its draft or sources were edited afterward.
  const existing = await dependencies.getExistingReview(input.workspaceId, input.requestId)
  if (existing) {
    if (!existingResultMatches(input, existing)) {
      throw new TrustedSubmissionError(409, 'This request ID was already used with a different review payload.')
    }
    return existing.result
  }

  const [workspaceName, draft, sources] = await Promise.all([
    dependencies.getWorkspaceName(input.workspaceId),
    dependencies.getDraft(input.workspaceId, input.draftId),
    dependencies.getActiveSourceVersions(input.workspaceId),
  ])
  if (!draft || draft.workspaceId !== input.workspaceId || draft.id !== input.draftId) {
    throw new TrustedSubmissionError(404, 'The draft was not found in this workspace.')
  }
  if (draft.content !== input.content) {
    throw new TrustedSubmissionError(409, 'The saved draft changed. Reload it before submitting a review.')
  }
  if (!sameIds(sources.map((source) => source.source_version_id), input.expectedSourceVersionIds)) {
    throw new TrustedSubmissionError(409, 'Approved sources changed. Reload the workspace and check the draft again.')
  }

  const profile: AnalyzerProfile = { id: input.workspaceId, name: workspaceName, sources }
  const asOf = (dependencies.now ?? (() => new Date()))().toISOString().slice(0, 10)
  const analysis = analyzeForProfile(input.content, profile, asOf)
  assertAnalysisReferencesSources(analysis, sources)

  const signedPayload = {
    workspace_id: input.workspaceId,
    draft_id: input.draftId,
    request_id: input.requestId,
    actor_id: userId,
    content: input.content,
    sources_snapshot: sources,
    analysis,
  }
  const signature = await dependencies.signPayload(signedPayload)
  const persisted = await dependencies.submitSignedReview({
    p_workspace_id: input.workspaceId,
    p_draft_id: input.draftId,
    p_request_id: input.requestId,
    p_content: input.content,
    p_sources_snapshot: sources,
    p_analysis: analysis,
    p_server_signature: signature,
  })
  if (persisted.analysis_origin !== 'server_analyzed') {
    throw new TrustedSubmissionError(500, 'The database did not confirm server-analysis provenance.')
  }
  return { ...persisted, analysis }
}
