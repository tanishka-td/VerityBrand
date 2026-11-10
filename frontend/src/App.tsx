import { useEffect, useRef, useState } from 'react'
import type { BrandProfile, DraftRevision, Finding, ReviewDecision, ReviewSnapshot } from './types'
import { analyzeDraft } from './services/reviewApi'
import { DEMO_DRAFT, DEMO_PROFILE } from './data/demoKnowledge'
import { Icon } from './components/Icon'
import { EntryScreen } from './components/EntryScreen'
import { KnowledgePage } from './components/KnowledgePage'
import { ReviewWorkspace } from './components/ReviewWorkspace'
import { SupabaseApp } from './components/SupabaseApp'
import { supabase, supabaseConfigMissing } from './services/supabase'

const STORAGE_KEY = 'veritybrand-workspaces-v3'
type Section = 'entry' | 'review' | 'knowledge'
type SavedState = Record<string, unknown> | null

interface WorkspaceReviewState {
  analysis: ReviewSnapshot | null
  selectedId: string
  decisions: Record<string, ReviewDecision>
  approved: boolean
  approvedRevisionId: string | null
  coverageAcknowledged: boolean
  manualReviewRequested: boolean
  activity: string[]
}

interface InitialAppState {
  profiles: BrandProfile[]
  activeProfileId: string
  returnProfileId: string
  drafts: Record<string, string>
  reviewStates: Record<string, WorkspaceReviewState>
  draftRevisionsByProfile: Record<string, DraftRevision[]>
}

const emptyReviewState: WorkspaceReviewState = {
  analysis: null,
  selectedId: '',
  decisions: {},
  approved: false,
  approvedRevisionId: null,
  coverageAcknowledged: false,
  manualReviewRequested: false,
  activity: [],
}

function readSavedState(): SavedState {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SavedState } catch { return null }
}

function createInitialAppState(): InitialAppState {
  const saved = readSavedState()
  const storedProfiles = Array.isArray(saved?.profiles) && saved.profiles.length
    ? saved.profiles as BrandProfile[]
    : [{ id: 'my-brand', name: 'My brand', sources: [] }]
  const profiles = [...storedProfiles.filter((profile) => profile.id !== DEMO_PROFILE.id), DEMO_PROFILE]
  const previousActiveProfileId = String(saved?.activeProfileId ?? storedProfiles[0].id)
  const customProfiles = profiles.filter((profile) => !profile.isSample)
  const savedReturnProfileId = String(saved?.returnProfileId ?? '')
  const returnProfileId = customProfiles.some((profile) => profile.id === savedReturnProfileId)
    ? savedReturnProfileId
    : customProfiles.some((profile) => profile.id === previousActiveProfileId)
      ? previousActiveProfileId
      : customProfiles[0]?.id ?? ''
  const reviewStates = saved?.reviewStates && typeof saved.reviewStates === 'object'
    ? { ...(saved.reviewStates as Record<string, WorkspaceReviewState>) }
    : {}

  // Migrate the prior single active review state before Daybreak becomes active.
  if (previousActiveProfileId !== DEMO_PROFILE.id && !reviewStates[previousActiveProfileId]) {
    reviewStates[previousActiveProfileId] = {
      analysis: saved?.analysis as ReviewSnapshot | null ?? null,
      selectedId: String(saved?.selectedId ?? ''),
      decisions: saved?.decisions as Record<string, ReviewDecision> ?? {},
      approved: Boolean(saved?.approved),
      approvedRevisionId: saved?.approvedRevisionId as string | null ?? null,
      coverageAcknowledged: Boolean(saved?.coverageAcknowledged),
      manualReviewRequested: Boolean(saved?.manualReviewRequested),
      activity: saved?.activity as string[] ?? [],
    }
  }

  return {
    profiles,
    activeProfileId: DEMO_PROFILE.id,
    returnProfileId,
    drafts: { ...(saved?.drafts as Record<string, string> ?? {}), [DEMO_PROFILE.id]: DEMO_DRAFT },
    reviewStates: { ...reviewStates, [DEMO_PROFILE.id]: emptyReviewState },
    draftRevisionsByProfile: saved?.draftRevisionsByProfile && typeof saved.draftRevisionsByProfile === 'object'
      ? saved.draftRevisionsByProfile as Record<string, DraftRevision[]>
      : {},
  }
}

function replacementFor(finding: Finding): string | null {
  if (finding.category === 'promotion') {
    const source = finding.evidence[0]?.text ?? ''
    const terms = source.match(/(\d{1,3}%\s*(?:off|discount)).*?(?:through|until)\s+([A-Za-z]+\s+\d{1,2})(,?\s+\d{4})?/i)
    return terms ? `${terms[1]} through ${terms[2]}${terms[3] ? `, ${terms[3].trim().replace(/^,\s*/, '')}` : ''}` : null
  }
  if (finding.category === 'product_fact') {
    const values = finding.explanation.match(/draft says (\d+)\s?(ml|mg); the approved source says (\d+)\s?(?:ml|mg)/i)
    if (values) return finding.claim.replace(new RegExp(`\\b${values[1]}\\s?${values[2]}\\b`, 'i'), `${values[3]} ${values[2]}`)
  }
  return null
}

function LocalDemoApp({ configuredDemo = false, onExitDemo }: { configuredDemo?: boolean; onExitDemo?: () => void }) {
  const [initialState] = useState(createInitialAppState)
  const [section, setSection] = useState<Section>('review')
  const [profiles, setProfiles] = useState<BrandProfile[]>(initialState.profiles)
  const [activeProfileId, setActiveProfileId] = useState(initialState.activeProfileId)
  const [returnProfileId, setReturnProfileId] = useState(initialState.returnProfileId)
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0]
  const [drafts, setDrafts] = useState<Record<string, string>>(initialState.drafts)
  const draft = drafts[activeProfile.id] ?? ''
  const [reviewStates, setReviewStates] = useState(initialState.reviewStates)
  const [draftRevisionsByProfile, setDraftRevisionsByProfile] = useState(initialState.draftRevisionsByProfile)
  const revisions = draftRevisionsByProfile[activeProfile.id] ?? []
  const [analysis, setAnalysis] = useState<ReviewSnapshot | null>(emptyReviewState.analysis)
  const [selectedId, setSelectedId] = useState(emptyReviewState.selectedId)
  const [isChecking, setIsChecking] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(emptyReviewState.decisions)
  const [approved, setApproved] = useState(emptyReviewState.approved)
  const [approvedRevisionId, setApprovedRevisionId] = useState<string | null>(emptyReviewState.approvedRevisionId)
  const [coverageAcknowledged, setCoverageAcknowledged] = useState(emptyReviewState.coverageAcknowledged)
  const [manualReviewRequested, setManualReviewRequested] = useState(emptyReviewState.manualReviewRequested)
  const [exceptionNote, setExceptionNote] = useState('')
  const [notice, setNotice] = useState('')
  const [activity, setActivity] = useState<string[]>(emptyReviewState.activity)
  const analysisRequestId = useRef(0)

  useEffect(() => {
    if (configuredDemo) return
    const currentReviewState: WorkspaceReviewState = { analysis, selectedId, decisions, approved, approvedRevisionId, coverageAcknowledged, manualReviewRequested, activity }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      profiles, activeProfileId, returnProfileId, drafts,
      draftRevisionsByProfile,
      reviewStates: { ...reviewStates, [activeProfile.id]: currentReviewState },
      analysis, selectedId, decisions, approved, approvedRevisionId, coverageAcknowledged, manualReviewRequested, activity,
    }))
  }, [configuredDemo, profiles, activeProfileId, activeProfile.id, returnProfileId, drafts, draftRevisionsByProfile, reviewStates, analysis, selectedId, decisions, approved, approvedRevisionId, coverageAcknowledged, manualReviewRequested, activity])

  const selectedFinding = analysis?.findings.find((finding) => finding.id === selectedId) ?? analysis?.findings[0] ?? null
  const selectedDecision = selectedFinding ? decisions[selectedFinding.id] ?? 'not_sent' : 'not_sent'
  const sourceDigest = JSON.stringify(activeProfile.sources)
  const dirty = Boolean(analysis && (analysis._reviewedContent !== draft || analysis._reviewedProfileId !== activeProfile.id || analysis._reviewedSources !== sourceDigest))

  function setDraft(value: string) {
    setDrafts((current) => ({ ...current, [activeProfile.id]: value }))
    setApproved(false)
    setApprovedRevisionId(null)
    setCoverageAcknowledged(false)
    setManualReviewRequested(false)
  }

  function addActivity(message: string) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setActivity((items) => [`${message} · ${time}`, ...items].slice(0, 8))
  }

  function clearReviewState() {
    setAnalysis(null)
    setSelectedId('')
    setDecisions({})
    setApproved(false)
    setApprovedRevisionId(null)
    setCoverageAcknowledged(false)
    setManualReviewRequested(false)
    setExceptionNote('')
    setActivity([])
  }

  function captureCurrentReviewState(): WorkspaceReviewState {
    return { analysis, selectedId, decisions, approved, approvedRevisionId, coverageAcknowledged, manualReviewRequested, activity }
  }

  function restoreReviewState(state: WorkspaceReviewState | undefined) {
    const next = state ?? emptyReviewState
    setAnalysis(next.analysis)
    setSelectedId(next.selectedId)
    setDecisions(next.decisions)
    setApproved(next.approved)
    setApprovedRevisionId(next.approvedRevisionId ?? null)
    setCoverageAcknowledged(next.coverageAcknowledged)
    setManualReviewRequested(next.manualReviewRequested)
    setActivity(next.activity)
  }

  function recordCheckedRevision(profileId: string, content: string, snapshot: ReviewSnapshot) {
    setDraftRevisionsByProfile((current) => {
      const previous = current[profileId] ?? []
      const last = previous[previous.length - 1]
      if (last?.content === content && last.analysis._reviewedSources === snapshot._reviewedSources) return current
      const revision: DraftRevision = {
        id: `${profileId}-revision-${Date.now().toString(36)}`,
        content,
        checked_at: new Date().toISOString(),
        analysis: snapshot,
      }
      return { ...current, [profileId]: [...previous, revision] }
    })
  }

  async function handleReview() {
    if (!draft.trim()) return
    const requestId = ++analysisRequestId.current
    setIsChecking(true)
    setNotice('')
    setDecisions({})
    setApproved(false)
    setApprovedRevisionId(null)
    setCoverageAcknowledged(false)
    setManualReviewRequested(false)
    try {
      const result = await analyzeDraft(draft, activeProfile)
      if (requestId !== analysisRequestId.current) return
      const snapshot: ReviewSnapshot = {
        ...result,
        _reviewedContent: draft,
        _reviewedProfileId: activeProfile.id,
        _reviewedSources: sourceDigest,
      }
      setAnalysis(snapshot)
      recordCheckedRevision(activeProfile.id, draft, snapshot)
      setSelectedId(snapshot.findings.find((finding) => finding.requires_human_review)?.id ?? snapshot.findings[0]?.id ?? '')
      addActivity(`Draft checked against ${activeProfile.name} sources`)
      setNotice(snapshot.findings.length === 0
        ? 'No claim rules matched. Send the draft for a human-only review.'
        : snapshot.findings.some((finding) => finding.requires_human_review)
          ? 'Review complete. One or more claims need a decision.'
          : 'Review complete. Read any unrecognized copy before sign-off.')
    } catch (error) {
      if (requestId !== analysisRequestId.current) return
      setNotice(error instanceof Error ? error.message : 'Something went wrong while checking this draft.')
    } finally {
      if (requestId === analysisRequestId.current) setIsChecking(false)
    }
  }

  function handleProfileChange(id: string) {
    analysisRequestId.current += 1
    setIsChecking(false)
    setReviewStates((current) => ({ ...current, [activeProfile.id]: captureCurrentReviewState() }))
    setActiveProfileId(id)
    setSection('review')
    restoreReviewState(reviewStates[id])
    setNotice('Workspace changed. Check the draft against this brand’s sources.')
  }

  function handleNewProfile() {
    analysisRequestId.current += 1
    setIsChecking(false)
    setReviewStates((current) => ({ ...current, [activeProfile.id]: captureCurrentReviewState() }))
    const id = `brand-${Date.now().toString(36)}`
    const profile: BrandProfile = { id, name: 'New brand', sources: [] }
    setProfiles((items) => [...items, profile])
    setDrafts((items) => ({ ...items, [id]: '' }))
    setActiveProfileId(id)
    setSection('knowledge')
    clearReviewState()
    setNotice('New brand workspace created. Add its approved sources to get started.')
  }

  async function handleUseSample() {
    const requestId = ++analysisRequestId.current
    if (!activeProfile.isSample) setReturnProfileId(activeProfile.id)
    setReviewStates((current) => ({ ...current, [activeProfile.id]: captureCurrentReviewState() }))
    setProfiles((items) => [...items.filter((profile) => profile.id !== DEMO_PROFILE.id), DEMO_PROFILE])
    setDrafts((items) => ({ ...items, [DEMO_PROFILE.id]: DEMO_DRAFT }))
    setActiveProfileId(DEMO_PROFILE.id)
    setSection('review')
    clearReviewState()
    setIsChecking(true)
    setNotice('Opening the Daybreak sample review…')
    try {
      const result = await analyzeDraft(DEMO_DRAFT, DEMO_PROFILE)
      if (requestId !== analysisRequestId.current) return
      const snapshot: ReviewSnapshot = {
        ...result,
        _reviewedContent: DEMO_DRAFT,
        _reviewedProfileId: DEMO_PROFILE.id,
        _reviewedSources: JSON.stringify(DEMO_PROFILE.sources),
      }
      setAnalysis(snapshot)
      recordCheckedRevision(DEMO_PROFILE.id, DEMO_DRAFT, snapshot)
      setSelectedId(snapshot.findings.find((finding) => finding.requires_human_review)?.id ?? snapshot.findings[0]?.id ?? '')
      addActivity('Daybreak sample review opened')
      setNotice('Sample review ready. Start with the offer mismatch and its approved source.')
    } catch (error) {
      if (requestId !== analysisRequestId.current) return
      setNotice(error instanceof Error ? error.message : 'The sample review could not be opened.')
    } finally {
      if (requestId === analysisRequestId.current) setIsChecking(false)
    }
  }

  function handleExitSample() {
    const returnProfile = profiles.find((profile) => profile.id === returnProfileId && !profile.isSample)
      ?? profiles.find((profile) => !profile.isSample)
    if (returnProfile) handleProfileChange(returnProfile.id)
    else handleNewProfile()
  }

  function handleSaveProfile(updated: BrandProfile) {
    setProfiles((items) => items.map((profile) => profile.id === updated.id ? updated : profile))
    setNotice('Brand profile saved in this browser.')
  }

  function handleRequestReview() {
    if (!selectedFinding) return
    setDecisions((current) => ({ ...current, [selectedFinding.id]: 'sent' }))
    addActivity(`Claim sent to ${selectedFinding.reviewer_role ?? 'brand owner'}`)
    setNotice(`Claim sent to ${selectedFinding.reviewer_role ?? 'brand owner'}.`)
  }

  function handleConfirmReview() {
    if (!selectedFinding) return
    setDecisions((current) => ({ ...current, [selectedFinding.id]: 'confirmed' }))
    addActivity(`${selectedFinding.reviewer_role ?? 'Brand owner'} confirmed the source`)
    setNotice('The source was confirmed. Revise the claim to match it.')
  }

  function handleRequestEvidence() {
    if (!selectedFinding) return
    setDecisions((current) => ({ ...current, [selectedFinding.id]: 'evidence_requested' }))
    addActivity(`${selectedFinding.reviewer_role ?? 'Brand owner'} requested more evidence`)
    setNotice('More evidence requested. This finding remains open.')
  }

  function handleApproveException() {
    if (!selectedFinding || !exceptionNote.trim()) return
    setDecisions((current) => ({ ...current, [selectedFinding.id]: 'exception_approved' }))
    addActivity(`${selectedFinding.reviewer_role ?? 'Brand owner'} approved an exception: ${exceptionNote.trim()}`)
    setNotice('Exception recorded. Final sign-off still needs your review.')
    setExceptionNote('')
  }

  function handleApplyWording() {
    if (!selectedFinding) return
    let updatedDraft = draft
    const replacement = replacementFor(selectedFinding)
    if (selectedFinding.category === 'promotion' && replacement) {
      updatedDraft = draft.replace(/\d{1,3}%\s*(?:off|discount)\s+(?:through|until)\s+[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?/i, replacement)
    } else if (selectedFinding.category === 'product_fact') {
      const values = selectedFinding.explanation.match(/draft says (\d+)\s?(ml|mg); the approved source says (\d+)\s?(?:ml|mg)/i)
      if (values) updatedDraft = draft.replace(new RegExp(`\\b${values[1]}\\s?${values[2]}\\b`, 'i'), `${values[3]} ${values[2]}`)
    }
    if (updatedDraft === draft) return
    setDraft(updatedDraft)
    setDecisions({})
    setAnalysis(null)
    setCoverageAcknowledged(false)
    setNotice('Suggested wording applied. Recheck the draft to confirm it.')
    addActivity('Creator revised the campaign copy')
  }

  function handleApprove() {
    const latestRevision = revisions[revisions.length - 1]
    const unresolved = analysis?.findings.some((finding) => finding.requires_human_review && decisions[finding.id] !== 'exception_approved')
    if (!analysis || dirty || analysis.findings.length === 0 || unresolved || !coverageAcknowledged || latestRevision?.content !== draft) return
    setApproved(true)
    setApprovedRevisionId(latestRevision.id)
    addActivity('Human reviewer approved the final version')
    setNotice('Final version approved. The decision is saved in this browser.')
  }

  function handleRequestManualReview() {
    setManualReviewRequested(true)
    addActivity('Draft sent for manual review because no claim rule matched')
    setNotice('Manual review opened. Read the full draft before deciding.')
  }

  function handleApproveManualReview() {
    const latestRevision = revisions[revisions.length - 1]
    if (!manualReviewRequested || !analysis || dirty || analysis.findings.length !== 0 || latestRevision?.content !== draft) return
    setApproved(true)
    setApprovedRevisionId(latestRevision.id)
    addActivity('Human reviewer approved the unchecked draft')
    setNotice('Human-only approval recorded. The checker did not verify these claims.')
  }

  useEffect(() => {
    // StrictMode may invoke this twice in development; request IDs discard the stale result.
    void handleReview()
  }, [])

  const isSampleWorkspace = Boolean(activeProfile.isSample)
  const sidebarMode = isSampleWorkspace ? 'sample' : section === 'knowledge' ? 'steward' : 'review'
  const currentViewLabel = isSampleWorkspace
    ? section === 'knowledge' ? 'Sample sources' : 'Sample review'
    : section === 'knowledge' ? 'Approved sources' : 'Review desk'
  const returnProfileName = profiles.find((profile) => profile.id === returnProfileId && !profile.isSample)?.name
    ?? profiles.find((profile) => !profile.isSample)?.name
    ?? 'your workspace'

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {section === 'entry' ? <EntryScreen profile={activeProfile} onReviewContent={() => setSection('review')} onManageSources={() => setSection('knowledge')} onTrySample={() => { void handleUseSample() }} /> : <>
      <aside className={`sidebar sidebar-mode-${sidebarMode}`} aria-label={sidebarMode === 'sample' ? 'Daybreak sample navigation' : sidebarMode === 'steward' ? 'Brand steward navigation' : 'Creator and reviewer navigation'}>
        <button className="brand-lockup brand-home-button" type="button" title="Choose a starting point" onClick={() => setSection('entry')}><span className="brand-mark"><Icon name="mark" size={27} /></span><span className="brand-wordmark"><span>VerityBrand</span><small>brand governance</small></span></button>
        {sidebarMode !== 'review' && <div className="workspace-switcher">
          <span className="workspace-avatar">{activeProfile.name.slice(0, 1).toUpperCase()}</span>
          <label className="workspace-name"><span className="visually-hidden">Brand workspace</span><select aria-label="Brand workspace" value={activeProfile.id} onChange={(event) => handleProfileChange(event.target.value)}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}{profile.isSample ? ' · Sample' : ''}</option>)}</select><small>{activeProfile.sources.length} approved source{activeProfile.sources.length === 1 ? '' : 's'}</small></label>
          <button className="new-workspace-button" type="button" aria-label="Create brand workspace" title="Create brand workspace" onClick={handleNewProfile}><Icon name="plus" size={16} /></button>
        </div>}
        <div className={`sidebar-role-card sidebar-role-${sidebarMode}`}>
          <div className="sidebar-role-eyebrow"><Icon name={sidebarMode === 'steward' ? 'library' : sidebarMode === 'sample' ? 'spark' : 'review'} size={14} />{sidebarMode === 'steward' ? 'BRAND STEWARD' : sidebarMode === 'sample' ? 'GUIDED SAMPLE' : 'CREATOR & REVIEWER'}</div>
          <strong>{sidebarMode === 'sample' ? 'Daybreak Coffee' : sidebarMode === 'steward' ? 'Source cabinet' : 'Review desk'}</strong>
          <span>{sidebarMode === 'sample' ? 'One offer mismatch is ready to inspect.' : sidebarMode === 'steward' ? `${activeProfile.sources.length} approved reference${activeProfile.sources.length === 1 ? '' : 's'} to maintain.` : 'Check campaign claims and route questions.'}</span>
        </div>
        <nav className="primary-nav">
          <span className="nav-caption">{isSampleWorkspace ? 'SAMPLE WORKFLOW' : sidebarMode === 'steward' ? 'STEWARD TOOLS' : 'CREATOR WORKSPACE'}</span>
          {isSampleWorkspace ? <>
            <button className={`nav-item ${section === 'review' ? 'is-active' : ''}`} onClick={() => setSection('review')} type="button" aria-current={section === 'review' ? 'page' : undefined}><Icon name="review" size={18} /><span>Sample review</span>{section === 'review' && <span className="nav-pip" />}</button>
            <button className={`nav-item ${section === 'knowledge' ? 'is-active' : ''}`} onClick={() => setSection('knowledge')} type="button" aria-current={section === 'knowledge' ? 'page' : undefined}><Icon name="library" size={18} /><span>Sample sources</span>{section === 'knowledge' && <span className="nav-pip" />}</button>
          </> : section === 'knowledge' ? <button className="nav-item is-active" onClick={() => setSection('knowledge')} type="button" aria-current="page"><Icon name="library" size={18} /><span>Approved sources</span></button> : <button className="nav-item is-active" onClick={() => setSection('review')} type="button" aria-current="page"><Icon name="review" size={18} /><span>Content review</span><span className="nav-pip" /></button>}
        </nav>
        {isSampleWorkspace ? <button type="button" className="sidebar-sample sidebar-return" onClick={handleExitSample} title={`Return to ${returnProfileName}`}><Icon name="arrow" size={15} /><span>Back to {returnProfileName}</span></button> : <button type="button" className="sidebar-sample" onClick={() => { void handleUseSample() }} title="Open the Daybreak sample review"><Icon name="spark" size={15} /><span>Try Daybreak sample</span></button>}
        <div className="sidebar-bottom">
          <div className="demo-status"><span className="live-dot" /><span>{activeProfile.isSample ? 'Sample profile' : 'Private workspace'}</span></div>
          <p>{configuredDemo ? 'Guided sample · changes are temporary.' : 'Saved in this browser only.'}</p>
          {configuredDemo && <button className="text-button" type="button" onClick={onExitDemo}>Back to sign in</button>}
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar"><div className="breadcrumbs"><span>{isSampleWorkspace ? 'Daybreak sample' : 'VerityBrand'}</span><span className="crumb-separator">/</span><strong>{currentViewLabel}</strong></div><div className="topbar-actions"><span className="env-label"><span className="live-dot" />{isSampleWorkspace ? 'Guided sample · local' : 'Early access · local only'}</span><span className="avatar-button" aria-label={activeProfile.name}>{activeProfile.name.slice(0, 1).toUpperCase()}</span></div></header>
        <main id="main-content" className="main-content">
          {section === 'review' ? <ReviewWorkspace
            brandName={activeProfile.name}
            isSample={Boolean(activeProfile.isSample)}
            sourceCount={activeProfile.sources.length}
            draft={draft}
            setDraft={setDraft}
            analysis={analysis}
            selectedFinding={selectedFinding}
            onSelectFinding={setSelectedId}
            isChecking={isChecking}
            dirty={dirty}
            decision={selectedDecision}
            decisions={decisions}
            revisions={revisions}
            approvedRevisionId={approvedRevisionId}
            activity={activity}
            approved={approved}
            coverageAcknowledged={coverageAcknowledged}
            manualReviewRequested={manualReviewRequested}
            onCoverageAcknowledged={setCoverageAcknowledged}
            exceptionNote={exceptionNote}
            setExceptionNote={setExceptionNote}
            notice={notice}
            onDismissNotice={() => setNotice('')}
            onReview={handleReview}
            onRequestReview={handleRequestReview}
            onConfirmReview={handleConfirmReview}
            onRequestEvidence={handleRequestEvidence}
            onApproveException={handleApproveException}
            onApplyWording={handleApplyWording}
            onApprove={handleApprove}
            onRequestManualReview={handleRequestManualReview}
            onApproveManualReview={handleApproveManualReview}
            onOpenSources={() => setSection('knowledge')}
            onLoadSample={handleUseSample}
          /> : <KnowledgePage profile={activeProfile} onBack={() => setSection('review')} onSaveProfile={handleSaveProfile} onLoadSample={handleUseSample} />}
        </main>
      </div>
      </>}
    </div>
  )
}

function App() {
  const [showDemo, setShowDemo] = useState(false)
  if (supabase && !supabaseConfigMissing) return showDemo
    ? <LocalDemoApp configuredDemo onExitDemo={() => setShowDemo(false)} />
    : <SupabaseApp onTryDemo={() => setShowDemo(true)} />
  return <LocalDemoApp />
}

export default App
