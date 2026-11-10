import { useEffect, useRef, useState } from 'react'
import type { BrandProfile, Finding, ReviewDecision, ReviewSnapshot } from './types'
import { analyzeDraft } from './services/reviewApi'
import { DEMO_DRAFT, DEMO_PROFILE } from './data/demoKnowledge'
import { Icon } from './components/Icon'
import { EntryScreen } from './components/EntryScreen'
import { KnowledgePage } from './components/KnowledgePage'
import { ReviewWorkspace } from './components/ReviewWorkspace'

const STORAGE_KEY = 'veritybrand-workspaces-v3'
type Section = 'entry' | 'review' | 'knowledge'
type SavedState = Record<string, unknown> | null

function readSavedState(): SavedState {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SavedState } catch { return null }
}

const saved = readSavedState()
const initialProfiles = Array.isArray(saved?.profiles) && saved.profiles.length
  ? saved.profiles as BrandProfile[]
  : [{ id: 'my-brand', name: 'My brand', sources: [] }]
const storedActiveProfileId = String(saved?.activeProfileId ?? initialProfiles[0].id)
const initialActiveProfileId = initialProfiles.some((profile) => profile.id === storedActiveProfileId) ? storedActiveProfileId : initialProfiles[0].id
const initialReturnProfileId = String(saved?.returnProfileId ?? initialProfiles.find((profile) => !profile.isSample)?.id ?? initialProfiles[0].id)

function replacementFor(finding: Finding): string | null {
  if (finding.category === 'promotion') {
    const source = finding.evidence[0]?.text ?? ''
    const terms = source.match(/(\d{1,3}%\s*(?:off|discount)).*?(?:through|until)\s+([A-Za-z]+\s+\d{1,2})/i)
    return terms ? `${terms[1]} through ${terms[2]}` : null
  }
  if (finding.category === 'product_fact') {
    const values = finding.explanation.match(/draft says (\d+)\s?(ml|mg); the approved source says (\d+)\s?(?:ml|mg)/i)
    if (values) return finding.claim.replace(new RegExp(`\\b${values[1]}\\s?${values[2]}\\b`, 'i'), `${values[3]} ${values[2]}`)
  }
  return null
}

function App() {
  const [section, setSection] = useState<Section>('entry')
  const [profiles, setProfiles] = useState<BrandProfile[]>(initialProfiles)
  const [activeProfileId, setActiveProfileId] = useState(initialActiveProfileId)
  const [returnProfileId, setReturnProfileId] = useState(initialReturnProfileId)
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0]
  const [drafts, setDrafts] = useState<Record<string, string>>(() => saved?.drafts as Record<string, string> ?? {})
  const draft = drafts[activeProfile.id] ?? ''
  const [analysis, setAnalysis] = useState<ReviewSnapshot | null>(() => saved?.analysis as ReviewSnapshot | null ?? null)
  const [selectedId, setSelectedId] = useState(() => String(saved?.selectedId ?? ''))
  const [isChecking, setIsChecking] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(() => saved?.decisions as Record<string, ReviewDecision> ?? {})
  const [approved, setApproved] = useState(() => Boolean(saved?.approved))
  const [coverageAcknowledged, setCoverageAcknowledged] = useState(() => Boolean(saved?.coverageAcknowledged))
  const [manualReviewRequested, setManualReviewRequested] = useState(() => Boolean(saved?.manualReviewRequested))
  const [exceptionNote, setExceptionNote] = useState('')
  const [notice, setNotice] = useState('')
  const [activity, setActivity] = useState<string[]>(() => saved?.activity as string[] ?? [])
  const analysisRequestId = useRef(0)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles, activeProfileId, returnProfileId, drafts, analysis, selectedId, decisions, approved, coverageAcknowledged, manualReviewRequested, activity }))
  }, [profiles, activeProfileId, returnProfileId, drafts, analysis, selectedId, decisions, approved, coverageAcknowledged, manualReviewRequested, activity])

  const selectedFinding = analysis?.findings.find((finding) => finding.id === selectedId) ?? analysis?.findings[0] ?? null
  const selectedDecision = selectedFinding ? decisions[selectedFinding.id] ?? 'not_sent' : 'not_sent'
  const sourceDigest = JSON.stringify(activeProfile.sources)
  const dirty = Boolean(analysis && (analysis._reviewedContent !== draft || analysis._reviewedProfileId !== activeProfile.id || analysis._reviewedSources !== sourceDigest))

  function setDraft(value: string) {
    setDrafts((current) => ({ ...current, [activeProfile.id]: value }))
    setApproved(false)
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
    setCoverageAcknowledged(false)
    setManualReviewRequested(false)
    setExceptionNote('')
    setActivity([])
  }

  async function handleReview() {
    if (!draft.trim()) return
    const requestId = ++analysisRequestId.current
    setIsChecking(true)
    setNotice('')
    setDecisions({})
    setApproved(false)
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
    setActiveProfileId(id)
    setSection('review')
    clearReviewState()
    setNotice('Workspace changed. Check the draft against this brand’s sources.')
  }

  function handleNewProfile() {
    analysisRequestId.current += 1
    setIsChecking(false)
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
    setApproved(true)
    addActivity('Human reviewer approved the final version')
    setNotice('Final version approved. The decision is saved in this browser.')
  }

  function handleRequestManualReview() {
    setManualReviewRequested(true)
    addActivity('Draft sent for manual review because no claim rule matched')
    setNotice('Manual review opened. Read the full draft before deciding.')
  }

  function handleApproveManualReview() {
    if (!manualReviewRequested) return
    setApproved(true)
    addActivity('Human reviewer approved the unchecked draft')
    setNotice('Human-only approval recorded. The checker did not verify these claims.')
  }

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
          <p>Saved in this browser only.</p>
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

export default App
