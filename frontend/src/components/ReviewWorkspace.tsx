import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { DraftRevision, Finding, ReviewDecision, ReviewSnapshot } from '../types'
import { extractImageText } from '../services/imageOcr'
import type { ImageOcrResult, OcrProgress } from '../services/imageOcr'
import { Icon } from './Icon'

interface Props {
  brandName: string
  isSample: boolean
  sourceCount: number
  draft: string
  setDraft: (value: string) => void
  analysis: ReviewSnapshot | null
  selectedFinding: Finding | null
  onSelectFinding: (id: string) => void
  isChecking: boolean
  dirty: boolean
  decision: ReviewDecision
  decisions: Record<string, ReviewDecision>
  revisions: DraftRevision[]
  approvedRevisionId: string | null
  activity: string[]
  approved: boolean
  coverageAcknowledged: boolean
  manualReviewRequested: boolean
  onCoverageAcknowledged: (value: boolean) => void
  exceptionNote: string
  setExceptionNote: (value: string) => void
  notice: string
  onDismissNotice: () => void
  onReview: () => void
  onRequestReview: () => void
  onConfirmReview: () => void
  onRequestEvidence: () => void
  onApproveException: () => void
  onApplyWording: () => void
  onApprove: () => void
  onRequestManualReview: () => void
  onApproveManualReview: () => void
  onOpenSources: () => void
  onLoadSample: () => void
  canEditContent?: boolean
  canMakeDecisions?: boolean
  canApproveFinal?: boolean
  isCloud?: boolean
}

function StatusBadge({ status }: { status: Finding['status'] }) {
  const label = status === 'supported' ? 'Supported' : status === 'contradicted' ? 'Mismatch' : status === 'outdated' ? 'Out of date' : 'Unverified'
  return <span className={`status-badge status-${status}`}><span className="status-dot" />{label}</span>
}

function formatSourceDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
}

function formatFileSize(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function correctionPreview(finding: Finding): string | null {
  if (finding.category === 'promotion') {
    const terms = finding.evidence[0]?.text.match(/(\d{1,3}%\s*(?:off|discount)).*?(?:through|until)\s+([A-Za-z]+\s+\d{1,2})/i)
    const approvedDate = finding.evidence[0]?.text.match(/(?:through|until)\s+[A-Za-z]+\s+\d{1,2}(,?\s+\d{4})?/i)?.[1]
    return terms ? `${terms[1]} through ${terms[2]}${approvedDate ? `, ${approvedDate.trim().replace(/^,\s*/, '')}` : ''}` : null
  }
  if (finding.category === 'product_fact') {
    const values = finding.explanation.match(/draft says (\d+)\s?(ml|mg); the approved source says (\d+)\s?(?:ml|mg)/i)
    return values ? finding.claim.replace(new RegExp(`\\b${values[1]}\\s?${values[2]}\\b`, 'i'), `${values[3]} ${values[2]}`) : null
  }
  return null
}

export function ReviewWorkspace(props: Props) {
  const [importMessage, setImportMessage] = useState('')
  const [textFile, setTextFile] = useState<{ name: string; size: number; restoreDraft: string } | null>(null)
  const [creative, setCreative] = useState<{ name: string; size: number; type: string; previewUrl: string; result?: ImageOcrResult; text: string; confirmed: boolean; error?: string } | null>(null)
  const [ocrProgress, setOcrProgress] = useState<OcrProgress>({ status: 'Preparing image', percent: 0 })
  const [selectedOcrParagraph, setSelectedOcrParagraph] = useState(0)
  const [imageClaimRegion, setImageClaimRegion] = useState<number | null>(null)
  const [imageExpanded, setImageExpanded] = useState(false)
  const ocrRequest = useRef(0)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageDialogRef = useRef<HTMLDialogElement>(null)
  const {
    brandName, isSample, sourceCount, draft, setDraft, analysis, selectedFinding, onSelectFinding, isChecking, dirty, decision,
    activity, decisions, revisions, approvedRevisionId, approved, coverageAcknowledged, manualReviewRequested, onCoverageAcknowledged, exceptionNote, setExceptionNote,
    notice, onDismissNotice, onReview, onRequestReview, onConfirmReview,
    onRequestEvidence, onApproveException, onApplyWording, onApprove, onRequestManualReview, onApproveManualReview, onOpenSources, onLoadSample,
    canEditContent = true, canMakeDecisions = true, canApproveFinal = canMakeDecisions, isCloud = false,
  } = props
  const unresolvedCount = analysis?.findings.filter((finding) => finding.requires_human_review && decisions[finding.id] !== 'exception_approved').length ?? 0
  const noCoverage = Boolean(analysis && analysis.findings.length === 0)
  const allClear = Boolean(analysis && !dirty && !noCoverage && unresolvedCount === 0)
  const selectedSource = selectedFinding?.evidence[0]
  const correction = selectedFinding ? correctionPreview(selectedFinding) : null
  const approvedRevisionNumber = revisions.findIndex((revision) => revision.id === approvedRevisionId) + 1
  const displayStatus = approved ? 'Approved' : dirty ? 'Draft changed' : noCoverage ? manualReviewRequested ? 'Manual review open' : 'Needs a closer look' : allClear ? 'Ready for your sign-off' : analysis ? 'Waiting on a person' : 'Ready to check'

  useEffect(() => () => {
    if (creative?.previewUrl) URL.revokeObjectURL(creative.previewUrl)
  }, [creative?.previewUrl])

  useEffect(() => {
    const dialog = imageDialogRef.current
    if (!dialog) return
    if (imageExpanded && !dialog.open) dialog.showModal()
    if (!imageExpanded && dialog.open) dialog.close()
  }, [imageExpanded])

  useEffect(() => {
    if (!selectedFinding || !creative?.result?.paragraphs.length) { setImageClaimRegion(null); return }
    const claimWords = new Set(selectedFinding.claim.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    const best = creative.result.paragraphs
      .map((paragraph, index) => {
        const words = new Set(paragraph.text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
        return { index, score: [...claimWords].filter((word) => words.has(word)).length / Math.max(1, claimWords.size) }
      })
      .sort((a, b) => b.score - a.score)[0]
    if (best && best.score >= .55) {
      setSelectedOcrParagraph(best.index)
      setImageClaimRegion(best.index)
    } else setImageClaimRegion(null)
  }, [selectedFinding?.id, creative?.result])

  async function importCopy(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!canEditContent) { setImportMessage('You have read-only access to this draft.'); return }
    if (!/\.(txt|md)$/i.test(file.name)) {
      setImportMessage('Choose a .txt or .md file. Other file types are not read as campaign text.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setImportMessage('That file is over 2 MB. Paste a smaller text file instead.')
      return
    }
    try {
      const contents = await file.text()
      if (!contents.trim()) {
        setImportMessage('That file is empty. Choose a text file with campaign copy.')
        return
      }
      setTextFile({ name: file.name, size: file.size, restoreDraft: textFile?.restoreDraft ?? draft })
      setDraft(contents)
      setImportMessage(`${file.name} is ready to review in the working copy. Run a fresh check before approval.`)
    } catch {
      setImportMessage('We could not read that file. Try a .txt or .md file.')
    }
  }

  async function readCreative(file: File, isBundledExample = false) {
    if (!canEditContent) { setImportMessage('You have read-only access to this draft.'); return }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && !(isBundledExample && file.type === 'image/svg+xml')) {
      setImportMessage('Choose a PNG, JPG, or WebP image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportMessage('Choose an image smaller than 10 MB.')
      return
    }
    const requestId = ++ocrRequest.current
    const previewUrl = URL.createObjectURL(file)
    setCreative({ name: file.name, size: file.size, type: file.type, previewUrl, text: '', confirmed: false })
    setSelectedOcrParagraph(0)
    setOcrProgress({ status: 'Preparing image', percent: 0 })
    try {
      const result = await extractImageText(file, setOcrProgress)
      if (requestId !== ocrRequest.current) return
      setCreative({ name: file.name, size: file.size, type: file.type, previewUrl, result, text: result.text, confirmed: false })
    } catch (error) {
      if (requestId !== ocrRequest.current) return
      setCreative({ name: file.name, size: file.size, type: file.type, previewUrl, text: '', confirmed: false, error: error instanceof Error ? error.message : 'We could not read text from this image.' })
    }
  }

  async function importCreative(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) await readCreative(file)
  }

  async function openDaybreakCreative() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}daybreak-social-creative.svg`)
      if (!response.ok) throw new Error('The Daybreak creative could not be loaded. Try importing an image instead.')
      await readCreative(new File([await response.blob()], 'daybreak-social-creative.svg', { type: 'image/svg+xml' }), true)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'The Daybreak creative could not be loaded.')
    }
  }

  function useExtractedText(append: boolean) {
    if (!creative?.text.trim() || !creative.confirmed) return
    const nextDraft = append && draft.trim() ? `${draft.trim()}\n\n${creative.text.trim()}` : creative.text.trim()
    setDraft(nextDraft)
    setImportMessage(append && draft.trim() ? 'Image text added to the working copy. Run a fresh check.' : 'Image text is now the working copy. Run a fresh check.')
  }

  function removeTextFile() {
    if (!textFile) return
    setDraft(textFile.restoreDraft)
    setTextFile(null)
    setImportMessage('Imported text removed. The previous working copy has been restored.')
  }

  function removeImage() {
    ocrRequest.current += 1
    setCreative(null)
    setImageClaimRegion(null)
    setImageExpanded(false)
    setImportMessage('Image removed from this review. It was never stored or uploaded.')
  }

  function jumpToSelectedClaim() {
    if (!selectedFinding || !editorRef.current) return
    const start = draft.indexOf(selectedFinding.claim)
    if (start < 0) return
    editorRef.current.focus()
    editorRef.current.setSelectionRange(start, start + selectedFinding.claim.length)
  }

  return <>
    <section className="review-intro" aria-labelledby="review-title">
      <div className="review-intro-copy">
        <div className="eyebrow"><span className="eyebrow-rule" />THE VERITY DESK <span className="eyebrow-dot">✳</span> {brandName.toUpperCase()}</div>
        <h1 id="review-title">Make every claim<br /><em>earn its place.</em></h1>
        <p>Check your campaign against approved brand sources. See what matches, route what does not, and keep the final decision human.</p>
      </div>
      <div className={`review-stamp ${approved ? 'stamp-approved' : allClear ? 'stamp-ready' : noCoverage ? 'stamp-caution' : ''}`} aria-live="polite">
        <span className="stamp-label">REVIEW STATE</span><strong>{displayStatus}</strong>
        <small>{analysis ? `${analysis.findings.length} checks · ${unresolvedCount} open` : sourceCount ? `${sourceCount} approved source${sourceCount === 1 ? '' : 's'} ready` : 'Set up your source cabinet'}</small>
      </div>
    </section>

    <section className="process-ribbon" aria-label="Review steps">
      <div className={`process-step ${analysis ? 'is-done' : 'is-current'}`}><span>01</span><div><strong>Copy</strong><small>Read the draft</small></div></div>
      <i className="process-thread" />
      <div className={`process-step ${analysis && !noCoverage ? unresolvedCount ? 'is-current' : 'is-done' : ''}`}><span>02</span><div><strong>Evidence</strong><small>Compare each claim</small></div></div>
      <i className="process-thread" />
      <div className={`process-step ${allClear || approved || manualReviewRequested ? 'is-current' : ''}`}><span>03</span><div><strong>Decision</strong><small>A person signs off</small></div></div>
      <div className="review-id"><span>REVIEW ID</span><strong>VB · 014</strong></div>
    </section>

    {isSample && analysis && <section className="sample-journey" aria-label="Daybreak guided sample">
      <div className="sample-journey-heading"><span className="sample-journey-kicker">DAYBREAK COFFEE · GUIDED SAMPLE</span><strong>One campaign, four evidence outcomes.</strong><p>Choose a finding to see what the checker can support, what needs an update, and what should stay with a person.</p></div>
      <div className="sample-journey-grid">{(['supported', 'contradicted', 'outdated', 'unverified'] as const).map((status) => {
        const finding = analysis.findings.find((item) => item.status === status)
        if (!finding) return null
        const label = status === 'supported' ? 'Supported' : status === 'contradicted' ? 'Mismatch' : status === 'outdated' ? 'Out of date' : 'Unverified'
        return <button key={status} type="button" className={`sample-journey-item ${selectedFinding?.id === finding.id ? 'is-selected' : ''}`} aria-pressed={selectedFinding?.id === finding.id} onClick={() => onSelectFinding(finding.id)}>
          <span className={`sample-journey-status status-${status}`}><i />{label}</span>
          <strong>{finding.claim.length > 74 ? `${finding.claim.slice(0, 71)}…` : finding.claim}</strong>
          <small>Inspect source and next step <Icon name="arrow" size={12} /></small>
        </button>
      })}</div>
    </section>}

    <div className="workspace-grid">
      <section className="draft-panel" aria-labelledby="draft-title">
        <div className="panel-heading">
          <div className="panel-title-wrap"><span className="section-index">A</span><div><h2 id="draft-title">The draft</h2><p>Campaign copy · plain text</p></div></div>
          <span className="plain-tag">PLAIN TEXT</span>
        </div>
        <div className="editor-paper">
          <div className="editor-meta"><span><Icon name="file" size={15} />{textFile ? `DOCUMENT · ${textFile.name}` : `${brandName.toUpperCase()} / WORKING COPY`}</span><div className="editor-meta-tools">{canEditContent && <><label className="file-import" htmlFor="copy-upload"><input id="copy-upload" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={importCopy} /><Icon name="external" size={12} />{textFile ? 'Replace text file' : 'Upload text'}</label><label className="file-import image-import" htmlFor="image-upload"><input id="image-upload" ref={imageInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={importCreative} /><Icon name="spark" size={12} />{creative ? 'Replace image' : 'Upload image'}</label>{isSample && !creative && <button type="button" className="file-import image-import" onClick={() => void openDaybreakCreative()}><Icon name="spark" size={12} />Try Daybreak creative</button>}</>}</div></div>
          <label className="visually-hidden" htmlFor="draft-input">Edit campaign caption</label>
          <textarea id="draft-input" ref={editorRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste your campaign copy or claim here…" spellCheck readOnly={!canEditContent} />
          <div className="editor-footer"><span>{draft.trim() ? draft.trim().split(/\s+/).length : 0} words</span><span>{draft.length} characters</span><span className={`saved-indicator ${dirty ? 'is-dirty' : ''}`}><span />{dirty ? 'Needs a fresh check' : analysis ? 'This version was checked' : 'Waiting for first check'}</span></div>
        </div>
        {textFile && <div className="text-file-summary" aria-label="Text file being reviewed"><span className="text-file-icon"><Icon name="file" size={16}/></span><div><span>TEXT DOCUMENT · EDITABLE WORKING COPY</span><strong>{textFile.name}</strong><small>{formatFileSize(textFile.size)} · Read in this browser; review the text above before checking.</small></div><button type="button" className="text-button" onClick={removeTextFile}>Remove file</button></div>}
        {importMessage && <div className="import-message" role="status">{importMessage}</div>}

        {creative && <section className="creative-ocr" aria-labelledby="image-review-title">
          <div className="creative-ocr-heading"><div><span>IMAGE BEING ANALYSED</span><strong id="image-review-title">{creative.name}</strong><small>{formatFileSize(creative.size)} · {creative.type.replace('image/', '').toUpperCase()}{creative.result ? ` · ${creative.result.width} × ${creative.result.height} px` : ''}</small></div><div className="creative-file-actions">{canEditContent && <button type="button" className="text-button" onClick={() => imageInputRef.current?.click()}>Replace image</button>}<button type="button" className="text-button" onClick={removeImage}>Remove image</button></div></div>
          <p className="image-analysis-boundary">Visual preview only. VerityBrand extracts visible text locally; it does not interpret the image or verify visual claims.</p>
          <div className="creative-ocr-content">
            <div className="creative-visual-column"><div className="creative-preview"><img src={creative.previewUrl} alt={`Image being reviewed: ${creative.name}`} />{creative.result?.paragraphs.map((paragraph, index) => <button key={`${paragraph.text}-${index}`} type="button" className={`ocr-region ${selectedOcrParagraph === index ? 'is-selected' : ''}`} style={{ left: `${paragraph.box.x0 / creative.result!.width * 100}%`, top: `${paragraph.box.y0 / creative.result!.height * 100}%`, width: `${(paragraph.box.x1 - paragraph.box.x0) / creative.result!.width * 100}%`, height: `${(paragraph.box.y1 - paragraph.box.y0) / creative.result!.height * 100}%` }} aria-label={`Show extracted text region ${index + 1}`} aria-pressed={selectedOcrParagraph === index} onClick={() => setSelectedOcrParagraph(index)} />)}</div><button type="button" className="view-full-image" onClick={() => setImageExpanded(true)}>View full image <Icon name="external" size={13}/></button></div>
            <div className="creative-ocr-copy">{creative.error ? <p className="ocr-error" role="alert">{creative.error}</p> : !creative.result ? <div className="ocr-progress" role="status"><span className="spinner"/><div><strong>{ocrProgress.status === 'loading language traineddata' ? 'Preparing English text recognition' : ocrProgress.status === 'recognizing text' ? `Reading image text · ${ocrProgress.percent}%` : 'Preparing the image'}</strong><span>First use downloads the recognition engine. The image itself stays in this browser.</span></div></div> : <>
              <div className="ocr-confidence"><span>OCR CONFIDENCE · ENGLISH TEXT</span><strong>{creative.result.confidence}%</strong></div><p>Check the extracted wording against the preview. Only confirmed text enters the draft and source checker.</p><textarea aria-label="Extracted image text" value={creative.text} onChange={(event) => setCreative({ ...creative, text: event.target.value, confirmed: false })} rows={5} />
              {creative.result.paragraphs.length > 0 && <div className="ocr-regions" aria-label="Extracted text regions">{creative.result.paragraphs.map((paragraph, index) => <button key={`${paragraph.text}-${index}`} type="button" className={selectedOcrParagraph === index ? 'is-selected' : ''} onClick={() => setSelectedOcrParagraph(index)}><span>{paragraph.confidence}%</span>{paragraph.text}</button>)}</div>}
              <label className="ocr-confirm"><input type="checkbox" checked={creative.confirmed} onChange={(event) => setCreative({ ...creative, confirmed: event.target.checked })} /><span>I checked the extracted words against the image.</span></label>
              <div className="ocr-actions"><button type="button" className="primary-button" disabled={!creative.confirmed || !creative.text.trim()} onClick={() => useExtractedText(false)}>Use image text as draft</button><button type="button" className="secondary-button" disabled={!creative.confirmed || !creative.text.trim()} onClick={() => useExtractedText(true)}>Add to current draft</button></div>
              <small>The image stays in this tab only and is never saved. In a signed-in workspace, chosen draft text follows the existing workspace save flow.</small>
            </>}</div>
          </div>
        </section>}

        {selectedFinding && analysis && !noCoverage && <div className="draft-annotation">
          <span className="annotation-pin"><Icon name="pin" size={15} /></span>
          <div><span className="annotation-kicker">SELECTED CLAIM · {selectedFinding.category.replace('_', ' ').toUpperCase()}</span><strong>“{selectedFinding.claim}”</strong>{creative && imageClaimRegion !== null && <small className="image-finding-origin">OCR region {imageClaimRegion + 1} · {creative.name}</small>}</div>
          <button type="button" className="jump-claim" onClick={jumpToSelectedClaim} title="Highlight this excerpt in the draft"><Icon name="pin" size={13} /><span>Locate</span></button>
          <StatusBadge status={selectedFinding.status} />
        </div>}

        <div className="source-context">
          <div className="source-context-icon"><Icon name="loom" size={18} /></div>
          <div><strong>{sourceCount ? `Checking against ${brandName} sources` : 'Add sources to ground your review'}</strong><span>{sourceCount ? isSample ? 'Product quantities · offer terms · selected claims' : 'Claim cues · approved wording · source dates' : 'Approved facts and guidelines give checks something to compare against.'}</span></div>
          {sourceCount ? <span className="text-link-static">{sourceCount} source{sourceCount === 1 ? '' : 's'}</span> : <button type="button" className="source-add-link" onClick={onOpenSources}>Add sources <Icon name="arrow" size={13}/></button>}
        </div>
        <div className="checker-note"><Icon name="info" size={14} /><span>{isSample ? 'Sample rules only. Unmatched wording still needs a human read.' : 'This early-access checker is conservative. Unmatched claims stay with a human.'}</span></div>
        <div className="draft-actions">
          <button className="primary-button" type="button" onClick={onReview} disabled={!canEditContent || isChecking || !draft.trim()}>
            {isChecking ? <span className="spinner" /> : <Icon name="spark" size={17} />}
            {isChecking ? 'Comparing the copy…' : analysis && !dirty ? 'Run the check again' : 'Check against sources'}
            {!isChecking && <Icon name="arrow" size={16} />}
          </button>
          <span className="action-note">{isCloud ? 'Your draft is saved in this private workspace.' : 'Your text stays in this browser demo.'}</span>
        </div>
        <details className="activity-log revision-history">
          <summary><span>Draft revision history</span><span>{revisions.length} checked version{revisions.length === 1 ? '' : 's'} <Icon name="chevron" size={14} /></span></summary>
          <ol>{revisions.map((revision, index) => <li key={revision.id}>
            <strong>Version {String(index + 1).padStart(2, '0')}</strong>
            {revision.id === approvedRevisionId && <span className="revision-approved-label">Final authorized approval</span>}
            <p>{revision.content}</p>
            <small>{new Date(revision.checked_at).toLocaleString()} · {revision.analysis.overall_status === 'ready_for_final_approval' ? 'Ready for human sign-off' : 'Human review required'}</small>
          </li>)}</ol>
        </details>
      </section>

      <section className="findings-panel" aria-labelledby="findings-title" aria-live="polite">
        <div className="panel-heading findings-heading">
          <div className="panel-title-wrap"><span className="section-index">B</span><div><h2 id="findings-title">Evidence & decisions</h2><p>{analysis ? `${analysis.findings.length} matched checks from approved material` : 'The source trail will appear here'}</p></div></div>
          {analysis && <span className={`finding-count ${unresolvedCount ? 'count-open' : 'count-clear'}`}>{noCoverage ? 'NO MATCHES' : unresolvedCount ? `${unresolvedCount} OPEN` : 'CHECKS PASS'}</span>}
        </div>

        {!analysis ? <div className="empty-review">
          <div className="loom-illustration" aria-hidden="true"><span className="loom-thread thread-one"/><span className="loom-thread thread-two"/><span className="loom-thread thread-three"/><b>V</b></div>
          <h3>{sourceCount ? 'Let’s review your copy.' : 'Start with your brand standards.'}</h3><p>{sourceCount ? 'Paste a claim in the draft and check it against your approved sources.' : 'Add the facts and guidance your team already approves. Then check a draft against them.'}</p>
          <div className="empty-sources"><span><Icon name="check" size={14}/>{sourceCount ? `${sourceCount} approved sources` : 'Facts and product details'}</span><span><Icon name="calendar" size={14}/>{sourceCount ? 'Offer terms' : 'Offer dates and rules'}</span></div>
          {!sourceCount && <button type="button" className="empty-primary-link" onClick={onOpenSources}>Build your source cabinet <Icon name="arrow" size={14}/></button>}
          <button type="button" className="sample-try-link" onClick={onLoadSample}><Icon name="spark" size={13}/>{isSample ? 'Reload the Daybreak example' : 'Try the Daybreak Coffee example'} <Icon name="arrow" size={13}/></button>
        </div> : noCoverage ? <div className="coverage-gap"><span className="coverage-icon">?</span><div><strong>{dirty ? 'Your draft or brand sources changed since the last check.' : 'No checkable claims were found.'}</strong><p>That does not mean the copy is safe. The checker cannot clear a draft it could not assess. Read each claim against an approved source or try a manual review.</p><span className="coverage-action">No automatic approval is available when there are no matching checks.</span>
          {!manualReviewRequested && !approved && canMakeDecisions && <button type="button" className="manual-review-button" onClick={onRequestManualReview}><Icon name="send" size={15} />Send the full draft for manual review</button>}
          {manualReviewRequested && !approved && canMakeDecisions && <div className="manual-review-card"><span className="reviewer-label">HUMAN REVIEW</span><strong>Read the entire draft before deciding.</strong><p>This records a human-only decision. It does not claim that the checker verified the copy.</p>{canApproveFinal ? <button type="button" className="approve-button" onClick={onApproveManualReview}>Approve after manual review <Icon name="arrow" size={15} /></button> : <p className="approval-permission-note">You can record review decisions, but an Owner must authorize you to give final approval.</p>}</div>}
          {approved && <div className="approved-banner manual-approved"><span className="approved-icon"><Icon name="check" size={17} /></span><div><strong>Human-only approval recorded</strong><span>The draft has no automated verification findings.</span></div><span className="approved-seal">SIGNED</span></div>}
        </div></div> : <>
          <div className="finding-list" role="list" aria-label="Checks from this review">
            {analysis.findings.map((finding, index) => {
              const resolved = finding.requires_human_review && decisions[finding.id] === 'exception_approved'
              return <div role="listitem" key={finding.id}>
                <button className={`finding-row ${selectedFinding?.id === finding.id ? 'finding-selected' : ''} ${resolved ? 'finding-resolved' : ''}`} type="button" onClick={() => onSelectFinding(finding.id)} aria-pressed={selectedFinding?.id === finding.id}>
                  <span className={`finding-symbol symbol-${finding.status}`}>{finding.status === 'supported' ? <Icon name="check" size={15} /> : <Icon name="alert" size={15} />}</span>
                  <span className="finding-copy"><span className="finding-topline"><span className="finding-number">CHECK {String(index + 1).padStart(2, '0')}</span><StatusBadge status={finding.status} />{resolved && <span className="exception-status-badge">Exception approved</span>}</span><span className="finding-claim">{finding.claim}</span></span>
                  <Icon name="chevron" size={16} />
                </button>
              </div>
            })}
          </div>

          {selectedFinding && <article className="evidence-detail" key={selectedFinding.id}>
            <div className="detail-kicker"><span className="detail-mark" />THE PAPER TRAIL <span className="evidence-count">{selectedFinding.evidence.length ? `${selectedFinding.evidence.length} SOURCE${selectedFinding.evidence.length === 1 ? '' : 'S'}` : 'NO SOURCE'}</span></div>
            <div className="detail-title"><h3>{selectedSource?.title ?? 'No approved source found'}</h3></div>
            {selectedSource ? <blockquote className="evidence-quote">“{selectedSource.text}”</blockquote> : <div className="missing-evidence"><Icon name="alert" size={15} /><span>No approved material covers this claim. Treat it as unverified, not false.</span></div>}
            {selectedSource && <div className="source-provenance"><span>REF <strong>{selectedSource.source_id}</strong></span>{selectedSource.owner && <span>OWNER <strong>{selectedSource.owner}</strong></span>}{(selectedSource.valid_from || selectedSource.valid_through) && <span><Icon name="calendar" size={13} />{selectedSource.valid_from ? formatSourceDate(selectedSource.valid_from) : 'Start not set'} – {selectedSource.valid_through ? formatSourceDate(selectedSource.valid_through) : 'No expiry'}</span>}</div>}
            <div className="explanation"><span>WHY THIS NEEDS ATTENTION</span><p>{selectedFinding.explanation}</p></div>
            {selectedFinding.suggested_action && <div className="suggested-action"><span>RECOMMENDED NEXT STEP</span><p>{selectedFinding.suggested_action}</p></div>}

            {selectedFinding.requires_human_review && !approved && decision !== 'exception_approved' && canMakeDecisions && <div className="human-review-block">
              {decision === 'not_sent' && <>
                <div className="review-owner"><span className="owner-avatar">{selectedFinding.reviewer_role?.split(' ').map((part) => part[0]).join('').slice(0, 2) ?? 'BR'}</span><div><strong>Send to {selectedFinding.reviewer_role ?? 'Brand Manager'}</strong><span>This person owns the source behind this claim.</span></div></div>
                <button className="secondary-button" type="button" onClick={onRequestReview}><Icon name="send" size={16} />Send claim for review <Icon name="arrow" size={14} /></button>
              </>}
              {decision === 'sent' && <>
                <div className="handoff-status"><span className="handoff-pulse" /><div><strong>Owner response · demo mode</strong><span>Choose a sample decision to complete the handoff.</span></div></div>
                <div className="reviewer-preview"><span className="reviewer-label">{(selectedFinding.reviewer_role ?? 'BRAND OWNER').toUpperCase()} RESPONSE</span><p>{selectedFinding.reviewer_question ?? 'Does the approved source still apply, or should this claim be treated as an exception?'}</p><div className="reviewer-options"><button type="button" className="confirm-button" onClick={onConfirmReview}><Icon name="check" size={15} />Source is current</button><button type="button" className="evidence-request-button" onClick={onRequestEvidence}>Request more evidence</button></div>
                  <div className="exception-field"><label htmlFor="exception-note">Or record an approved exception</label><div><input id="exception-note" value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} placeholder="Add a short reason" /><button type="button" className="exception-button" disabled={!exceptionNote.trim()} onClick={onApproveException}>Record</button></div></div>
                </div>
              </>}
              {decision === 'confirmed' && <>
                <div className="confirmed-note"><Icon name="check" size={16} /><div><strong>Source confirmed. Claim still needs attention.</strong><span>Revise the wording to match the approved source, then check the new draft.</span></div></div>
                {correction && <div className="suggested-copy"><span>SUGGESTED WORDING</span><p>{correction}</p><button type="button" className="apply-link" onClick={onApplyWording}>Apply this change to the draft <Icon name="arrow" size={14} /></button></div>}
              </>}
              {decision === 'evidence_requested' && <div className="confirmed-note"><Icon name="clock" size={16} /><div><strong>More evidence requested</strong><span>This finding stays open until the claim is checked again with a source.</span></div></div>}
            </div>}
            {selectedFinding.requires_human_review && decision === 'exception_approved' && <div className="exception-approved"><Icon name="check" size={16} /><div><strong>Owner approved this exception</strong><span>{isCloud ? 'This reviewer decision is saved. Final sign-off is still required.' : 'The decision is saved in this browser demo. Final sign-off is still yours.'}</span></div></div>}
            {selectedFinding.status === 'supported' && <div className="supported-note"><Icon name="check" size={15} /><span>This value matches the approved source shown above.</span></div>}
          </article>}

          {allClear && !approved && <div className="approval-panel">
            <div className="approval-copy"><Icon name="seal" size={19} /><div><strong>One last human read</strong><span>These matched checks pass. Please review anything outside the sample rules before sign-off.</span></div></div>
            <label className="coverage-check"><input type="checkbox" checked={coverageAcknowledged} onChange={(event) => onCoverageAcknowledged(event.target.checked)} /><span>I reviewed the remaining copy and am comfortable approving this version.</span></label>
            {canApproveFinal ? <button className="approve-button" type="button" disabled={!coverageAcknowledged} onClick={onApprove}>Approve this version <Icon name="arrow" size={15} /></button> : canMakeDecisions && <p className="approval-permission-note">You can record review decisions, but an Owner must authorize you to give final approval.</p>}
          </div>}
          {approved && <div className="approved-banner"><span className="approved-icon"><Icon name="check" size={17} /></span><div><strong>Version approved</strong><span>{approvedRevisionNumber ? `Final authorized approval recorded for Version ${String(approvedRevisionNumber).padStart(2, '0')}.` : isCloud ? 'Final approval is saved in this workspace.' : 'Decision and activity are saved in this browser demo.'}</span></div><span className="approved-seal">SIGNED</span></div>}
          {activity.length > 0 && <details className="activity-log"><summary><span>Decision trail</span><span>{activity.length} event{activity.length === 1 ? '' : 's'} <Icon name="chevron" size={14} /></span></summary><ol>{activity.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol></details>}
        </>}
      </section>
    </div>
    {creative && <dialog ref={imageDialogRef} className="image-lightbox" aria-label={`Full image preview: ${creative.name}`} onClose={() => setImageExpanded(false)}><div className="image-lightbox-heading"><strong>{creative.name}</strong><button type="button" className="secondary-button" onClick={() => setImageExpanded(false)}>Close preview</button></div><img src={creative.previewUrl} alt={`Full-size image being reviewed: ${creative.name}`} /></dialog>}
    {notice && <div className="toast" role="status"><Icon name={approved ? 'check' : 'spark'} size={16} />{notice}<button type="button" aria-label="Dismiss message" onClick={onDismissNotice}><Icon name="close" size={15} /></button></div>}
  </>
}
