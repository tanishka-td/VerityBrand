import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'
import { analyzeDraft } from '../services/reviewApi'
import { createInitialOwnerMembership } from '../services/workspaceBootstrap'
import type { BrandProfile, DraftRevision, Finding, ReviewDecision, ReviewSnapshot } from '../types'
import { KnowledgePage } from './KnowledgePage'
import { ReviewWorkspace } from './ReviewWorkspace'

type Member = { workspace_id: string; user_id: string; member_role: 'owner' | 'editor' | 'reviewer' }
type WorkspaceRow = { id: string; name: string }
type DecisionRow = { finding_id: string; decision: Exclude<ReviewDecision, 'not_sent'>; note: string | null }

function AuthPanel({ onTryDemo }: { onTryDemo: () => void }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setMessage('')
    const result = mode === 'sign-up'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (result.error) setMessage(result.error.message)
    else if (mode === 'sign-up' && !result.data.session) setMessage('Check your email to confirm your account, then sign in.')
  }

  return <main className="auth-shell"><section className="auth-card">
    <p className="eyebrow">VERITYBRAND · PROTOTYPE</p><h1>{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h1>
    <p>Sign in to access your shared brand workspace.</p>
    <form onSubmit={submit}><label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
    </form>
    {message && <p role="status">{message}</p>}
    <button className="text-button" type="button" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage('') }}>{mode === 'sign-in' ? 'Need an account? Sign up' : 'Already registered? Sign in'}</button>
    <button className="text-button" type="button" onClick={onTryDemo}>Try the Daybreak sample</button>
  </section></main>
}

function CloudWorkspace({ session, member, workspace, onSignOut }: { session: Session; member: Member; workspace: WorkspaceRow; onSignOut: () => void }) {
  const db = supabase!
  const [profile, setProfile] = useState<BrandProfile>({ id: workspace.id, name: workspace.name, sources: [] })
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [revisions, setRevisions] = useState<DraftRevision[]>([])
  const [analysis, setAnalysis] = useState<ReviewSnapshot | null>(null)
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({})
  const [approvedRevisionId, setApprovedRevisionId] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)
  const [coverageAcknowledged, setCoverageAcknowledged] = useState(false)
  const [manualReviewRequested, setManualReviewRequested] = useState(false)
  const [activity, setActivity] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [exceptionNote, setExceptionNote] = useState('')
  const [section, setSection] = useState<'review' | 'knowledge'>('review')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const canEdit = member.member_role === 'owner' || member.member_role === 'editor'
  const canReview = member.member_role === 'owner' || member.member_role === 'reviewer'

  async function load() {
    setLoading(true); setError(''); setActivity([])
    try {
      const [sourcesRes, draftsRes] = await Promise.all([
        db.from('approved_sources').select('*').eq('workspace_id', workspace.id).order('created_at'),
        db.from('drafts').select('*').eq('workspace_id', workspace.id).order('updated_at', { ascending: false }).limit(1),
      ])
      if (sourcesRes.error) throw sourcesRes.error
      if (draftsRes.error) throw draftsRes.error
      setProfile({ id: workspace.id, name: workspace.name, sources: (sourcesRes.data ?? []).map((s: any) => ({ source_id: s.id, title: s.title, text: s.source_text, owner: s.owner_label ?? undefined, kind: s.kind ?? undefined, valid_from: s.valid_from ?? undefined, valid_through: s.valid_through ?? undefined })) })
      let row = draftsRes.data?.[0]
      if (!row && canEdit) {
        const created = await db.from('drafts').insert({ workspace_id: workspace.id, content: '', created_by: session.user.id }).select().single()
        if (created.error) throw created.error
        row = created.data
      }
      if (row) { setDraftId(row.id); setDraft(row.content) }
      if (row) {
        const revRes = await db.from('draft_revisions').select('*, reviews(*, findings(*), final_approvals(*))').eq('workspace_id', workspace.id).eq('draft_id', row.id).order('revision_number')
        if (revRes.error) throw revRes.error
        const nextDecisions: Record<string, ReviewDecision> = {}
        const findingIds = (revRes.data ?? []).flatMap((rev: any) => rev.reviews?.[0]?.findings?.map((f: any) => f.id) ?? [])
        let decisionHistory: any[] = []
        if (findingIds.length) {
          const decisionRows = await db.from('reviewer_decisions').select('finding_id,decision,created_at').eq('workspace_id', workspace.id).in('finding_id', findingIds).order('created_at')
          if (decisionRows.error) throw decisionRows.error
          decisionHistory = decisionRows.data ?? []
          for (const item of decisionRows.data ?? []) nextDecisions[item.finding_id] = item.decision
        }
        const nextRevisions: DraftRevision[] = (revRes.data ?? []).map((rev: any) => {
          const review = rev.reviews?.[0]
          const findings: Finding[] = (review?.findings ?? []).map((f: any) => ({ id: f.id, claim: f.claim, category: f.category, status: f.status, severity: f.severity, explanation: f.explanation, evidence: f.evidence ?? [], suggested_action: f.suggested_action ?? '', reviewer_role: f.reviewer_role, reviewer_question: f.reviewer_question, requires_human_review: f.requires_human_review }))
          const summary = review?.summary ?? { supported: 0, contradicted: 0, outdated: 0, unverified: 0 }
          const snap: ReviewSnapshot = { brand_name: workspace.name, review_date: review?.review_date ?? rev.created_at.slice(0, 10), overall_status: review?.overall_status ?? 'needs_human_review', final_approval_required: true, summary, findings, analysis_note: review?.analysis_note ?? undefined, _reviewedContent: rev.content, _reviewedProfileId: workspace.id, _reviewedSources: JSON.stringify(review?.sources_snapshot ?? []) }
          return { id: rev.id, content: rev.content, checked_at: rev.created_at, analysis: snap }
        })
        setRevisions(nextRevisions); setDecisions(nextDecisions)
        const latest = nextRevisions[nextRevisions.length - 1]
        const events = [
          ...(revRes.data ?? []).map((rev: any) => ({ at: rev.created_at, text: 'Draft revision checked' })),
          ...decisionHistory.map((d: any) => ({ at: d.created_at, text: `Reviewer decision recorded: ${d.decision.replaceAll('_', ' ')}` })),
          ...(revRes.data ?? []).flatMap((rev: any) => (rev.reviews?.[0]?.final_approvals ?? []).map((a: any) => ({ at: a.approved_at, text: `Final ${a.approval_mode.replaceAll('_', ' ')} approval recorded` }))),
        ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
        setActivity(events.map(e => `${e.text} · ${new Date(e.at).toLocaleString()}`))
        if (latest) {
          const storedApproval = (revRes.data ?? []).at(-1)?.reviews?.[0]?.final_approvals?.[0]
          setAnalysis(latest.analysis); setSelectedId(latest.analysis.findings[0]?.id ?? '')
          const approvedLatest = Boolean(storedApproval)
          setApproved(approvedLatest); setApprovedRevisionId(approvedLatest ? latest.id : null)
          setCoverageAcknowledged(approvedLatest && Boolean(storedApproval?.coverage_acknowledged))
          setManualReviewRequested(approvedLatest ? storedApproval?.approval_mode === 'manual_review' : latest.analysis.findings.length === 0 && latest.analysis.overall_status === 'needs_human_review')
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load workspace data.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [workspace.id])

  async function persistDraft(value: string) {
    setDraft(value); setApproved(false); setApprovedRevisionId(null)
    if (!draftId || !canEdit) return
    const { error: saveError } = await db.from('drafts').update({ content: value }).eq('id', draftId).eq('workspace_id', workspace.id)
    if (saveError) setError(saveError.message)
  }
  async function saveProfile(next: BrandProfile) {
    if (!canEdit) return
    setBusy(true); setError('')
    try {
      if (next.name !== profile.name) { const res = await db.from('workspaces').update({ name: next.name }).eq('id', workspace.id); if (res.error) throw res.error }
      const existing = new Set(profile.sources.map(s => s.source_id))
      const retained = new Set(next.sources.map(s => s.source_id))
      for (const old of profile.sources) if (!retained.has(old.source_id)) { const res = await db.from('approved_sources').delete().eq('id', old.source_id).eq('workspace_id', workspace.id); if (res.error) throw res.error }
      const normalized = [] as BrandProfile['sources']
      for (const s of next.sources) {
        const values = { workspace_id: workspace.id, title: s.title, source_text: s.text, owner_label: s.owner ?? null, kind: s.kind ?? null, valid_from: s.valid_from ?? null, valid_through: s.valid_through ?? null }
        if (existing.has(s.source_id)) { const res = await db.from('approved_sources').update(values).eq('id', s.source_id).select().single(); if (res.error) throw res.error; normalized.push({ ...s, source_id: res.data.id }) }
        else { const res = await db.from('approved_sources').insert({ ...values, created_by: session.user.id }).select().single(); if (res.error) throw res.error; normalized.push({ ...s, source_id: res.data.id }) }
      }
      setProfile({ ...next, sources: normalized }); setNotice('Workspace saved to Supabase.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save workspace.') }
    finally { setBusy(false) }
  }
  async function checkDraft() {
    if (!canEdit || !draftId || !draft.trim()) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await analyzeDraft(draft, profile)
      const number = (revisions.at(-1)?.analysis ? revisions.length : 0) + 1
      const rev = await db.from('draft_revisions').insert({ workspace_id: workspace.id, draft_id: draftId, revision_number: number, content: draft, created_by: session.user.id }).select().single()
      if (rev.error) throw rev.error
      const review = await db.from('reviews').insert({ workspace_id: workspace.id, draft_id: draftId, draft_revision_id: rev.data.id, overall_status: result.overall_status, final_approval_required: true, summary: result.summary, sources_snapshot: profile.sources, analysis_note: result.analysis_note ?? null, created_by: session.user.id }).select().single()
      if (review.error) throw review.error
      let findings = result.findings
      if (findings.length) {
        const inserted = await db.from('findings').insert(findings.map(f => ({ workspace_id: workspace.id, review_id: review.data.id, claim: f.claim, category: f.category, status: f.status, severity: f.severity, explanation: f.explanation, evidence: f.evidence, suggested_action: f.suggested_action, reviewer_role: f.reviewer_role, reviewer_question: f.reviewer_question ?? null, requires_human_review: f.requires_human_review }))).select()
        if (inserted.error) throw inserted.error
        findings = inserted.data.map((f: any, i: number) => ({ ...result.findings[i], id: f.id }))
      }
      const snapshot: ReviewSnapshot = { ...result, findings, _reviewedContent: draft, _reviewedProfileId: profile.id, _reviewedSources: JSON.stringify(profile.sources) }
      setAnalysis(snapshot); setDecisions({}); setApproved(false); setManualReviewRequested(false); setCoverageAcknowledged(false); setSelectedId(findings[0]?.id ?? '')
      const revision: DraftRevision = { id: rev.data.id, content: draft, checked_at: rev.data.created_at, analysis: snapshot }
      setRevisions(old => [...old, revision]); setNotice('Review and revision saved to Supabase.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the review.') }
    finally { setBusy(false) }
  }
  async function addDecision(decision: Exclude<ReviewDecision, 'not_sent'>, note?: string) {
    const finding = analysis?.findings.find(f => f.id === selectedId); if (!finding || !canReview) return
    const res = await db.from('reviewer_decisions').insert({ workspace_id: workspace.id, finding_id: finding.id, decision, note: note ?? null, actor_id: session.user.id })
    if (res.error) setError(res.error.message); else { setDecisions(old => ({ ...old, [finding.id]: decision })); setNotice('Reviewer decision saved.') }
  }
  async function approve(mode: 'reviewed' | 'manual_review') {
    const revision = revisions.at(-1); if (!canReview || !analysis || !revision) return
    const unresolved = analysis.findings.some(f => f.requires_human_review && decisions[f.id] !== 'exception_approved')
    if (dirty || revision.content !== draft || (mode === 'reviewed' && (!analysis.findings.length || unresolved || !coverageAcknowledged)) || (mode === 'manual_review' && (!manualReviewRequested || analysis.findings.length !== 0))) {
      setError('This draft is not ready for approval. Check the current version and complete its required review first.')
      return
    }
    const review = await db.from('reviews').select('id').eq('draft_revision_id', revision.id).eq('workspace_id', workspace.id).single()
    if (review.error) { setError(review.error.message); return }
    const result = await db.from('final_approvals').insert({ workspace_id: workspace.id, review_id: review.data.id, draft_revision_id: revision.id, approval_mode: mode, coverage_acknowledged: mode === 'manual_review' ? false : coverageAcknowledged, approver_id: session.user.id })
    if (result.error) setError(result.error.message); else { setApproved(true); setApprovedRevisionId(revision.id); setNotice('Final approval recorded in Supabase.') }
  }

  const selectedFinding = analysis?.findings.find(f => f.id === selectedId) ?? analysis?.findings[0] ?? null
  const dirty = Boolean(analysis && (analysis._reviewedContent !== draft || analysis._reviewedSources !== JSON.stringify(profile.sources)))
  if (loading) return <main className="auth-shell"><p role="status">Loading your workspace…</p></main>

  return <div className="app-shell"><aside className="sidebar"><button className="brand-lockup brand-home-button" type="button" onClick={() => setSection('review')}>VerityBrand</button>
    <div className="workspace-switcher"><strong>{workspace.name}</strong><small>{member.member_role} · {profile.sources.length} approved sources</small></div>
    <nav className="primary-nav"><button className="nav-item" onClick={() => setSection('review')}>Content review</button><button className="nav-item" onClick={() => setSection('knowledge')}>Approved sources</button></nav>
    <div className="sidebar-bottom"><span>{session.user.email}</span><button className="text-button" onClick={onSignOut}>Sign out</button><button className="text-button" onClick={() => void load()}>Refresh workspace</button></div>
  </aside><div className="app-main"><header className="topbar"><strong>{profile.name}</strong><span>{busy ? 'Saving…' : 'Supabase workspace'}</span></header><main className="main-content" id="main-content">
    {error && <p className="auth-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {section === 'knowledge' ? <KnowledgePage profile={profile} onBack={() => setSection('review')} onSaveProfile={(p) => void saveProfile(p)} onLoadSample={() => setNotice('Daybreak remains available from the sign-in screen.')} isCloud canEdit={canEdit}/> : <ReviewWorkspace
      brandName={profile.name} isSample={false} sourceCount={profile.sources.length} draft={draft} setDraft={(v) => void persistDraft(v)} analysis={analysis} selectedFinding={selectedFinding} onSelectFinding={setSelectedId} isChecking={busy} dirty={dirty} decision={selectedFinding ? decisions[selectedFinding.id] ?? 'not_sent' : 'not_sent'} decisions={decisions} revisions={revisions} approvedRevisionId={approvedRevisionId} activity={activity} approved={approved} coverageAcknowledged={coverageAcknowledged} manualReviewRequested={manualReviewRequested} onCoverageAcknowledged={setCoverageAcknowledged} exceptionNote={exceptionNote} setExceptionNote={setExceptionNote} notice="" onDismissNotice={() => setNotice('')} onReview={() => void checkDraft()} onRequestReview={() => void addDecision('sent')} onConfirmReview={() => void addDecision('confirmed')} onRequestEvidence={() => void addDecision('evidence_requested')} onApproveException={() => { if (exceptionNote.trim()) { void addDecision('exception_approved', exceptionNote.trim()); setExceptionNote('') } }} onApplyWording={() => setNotice('Apply the suggested wording, then save and recheck.')} onApprove={() => void approve('reviewed')} onRequestManualReview={() => { setManualReviewRequested(true); setNotice('Manual review requested. Check again to persist the review state.') }} onApproveManualReview={() => void approve('manual_review')} onOpenSources={() => setSection('knowledge')} onLoadSample={() => setNotice('Daybreak remains available as a local guided demo.')} canEditContent={canEdit} canMakeDecisions={canReview} isCloud/>}</main></div></div>
}

export function SupabaseApp({ onTryDemo }: { onTryDemo: () => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [member, setMember] = useState<Member | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceRow | null>(null)
  const [error, setError] = useState('')
  const bootstrapTasks = useRef(new Map<string, Promise<{ member: Member; workspace: WorkspaceRow }>>())
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, next) => {
      if (!next) bootstrapTasks.current.clear()
      setSession(next)
    })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session || !supabase) { setMember(null); setWorkspace(null); setLoading(false); return }
    let active = true
    setLoading(true); setError('')
    const userId = session.user.id
    let task = bootstrapTasks.current.get(userId)
    if (!task) {
      task = (async () => {
        const memberships = await supabase!.from('workspace_members').select('workspace_id,user_id,member_role').eq('user_id', userId)
        if (memberships.error) throw memberships.error
        if (memberships.data?.length) {
          const selected = memberships.data[0] as Member
          const workspaceResult = await supabase!.from('workspaces').select('id,name').eq('id', selected.workspace_id).single()
          if (workspaceResult.error) throw workspaceResult.error
          return { member: selected, workspace: workspaceResult.data as WorkspaceRow }
        }

        // Reuse any workspace left by an interrupted prior bootstrap instead of creating duplicates.
        const ownWorkspaces = await supabase!.from('workspaces').select('id,name').eq('created_by', userId).order('created_at').limit(1).maybeSingle()
        if (ownWorkspaces.error) throw ownWorkspaces.error
        let workspace = ownWorkspaces.data as WorkspaceRow | null
        if (!workspace) {
          const created = await supabase!.from('workspaces').insert({ name: 'My brand', created_by: userId }).select('id,name').single()
          if (created.error) throw created.error
          workspace = created.data as WorkspaceRow
        }
        const owner = await createInitialOwnerMembership(supabase!, workspace.id, userId)
        return { member: owner as Member, workspace }
      })()
      bootstrapTasks.current.set(userId, task)
      void task.catch(() => bootstrapTasks.current.delete(userId))
    }
    void task.then((loaded) => {
      if (active) { setMember(loaded.member); setWorkspace(loaded.workspace) }
    }).catch((e) => {
      if (active) setError(e instanceof Error ? e.message : 'Could not load workspace.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session?.user.id])
  if (!supabase) return <main className="auth-shell"><section className="auth-card"><h1>Supabase is not configured</h1><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local.</p></section></main>
  if (loading) return <main className="auth-shell"><p role="status">Loading account…</p></main>
  if (!session) return <>{error && <p role="alert">{error}</p>}<AuthPanel onTryDemo={onTryDemo} /></>
  if (error) return <main className="auth-shell"><section><p role="alert">{error}</p><button onClick={() => void supabase!.auth.signOut()}>Sign out</button></section></main>
  if (!workspace || !member) return <main className="auth-shell"><p role="status">Setting up workspace…</p></main>
  return <CloudWorkspace key={workspace.id} session={session} member={member} workspace={workspace} onSignOut={() => void supabase!.auth.signOut()} />
}
