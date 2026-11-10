import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { BrandProfile, EvidenceSource } from '../types'
import { DEMO_PROFILE } from '../data/demoKnowledge'
import { Icon } from './Icon'

interface Props {
  profile: BrandProfile
  onBack: () => void
  onSaveProfile: (profile: BrandProfile) => void
  onLoadSample: () => void
  isCloud?: boolean
  canEdit?: boolean
}

const emptySource = { title: '', text: '', owner: '', kind: 'Product fact', valid_from: '', valid_through: '' }

function prettyDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function sourceStatus(source: EvidenceSource) {
  if (!source.valid_through) return 'Current'
  const expires = new Date(`${source.valid_through}T00:00:00`).getTime()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (expires < today.getTime()) return 'Expired'
  if (expires - today.getTime() <= 14 * 86400000) return 'Renew soon'
  return 'Current'
}

export function KnowledgePage({ profile, onBack, onSaveProfile, onLoadSample, isCloud = false, canEdit = true }: Props) {
  const [brandName, setBrandName] = useState(profile.name)
  const [form, setForm] = useState(emptySource)
  const [formOpen, setFormOpen] = useState(profile.sources.length === 0)
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => { setBrandName(profile.name); setFormOpen(profile.sources.length === 0); setEditingSourceId(null); setForm(emptySource); setMessage('') }, [profile.id, profile.name, profile.sources.length])

  function saveBrandName() {
    if (!canEdit) { setMessage('You have read-only access to this workspace.'); return }
    const nextName = brandName.trim()
    if (!nextName) { setMessage('Give this workspace a name before saving.'); return }
    onSaveProfile({ ...profile, name: nextName })
    setMessage('Workspace name saved.')
  }

  function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit) { setMessage('You do not have permission to change approved sources.'); return }
    const title = form.title.trim()
    const text = form.text.trim()
    if (!title || !text) { setMessage('Add a title and approved wording to save this source.'); return }
    const source: EvidenceSource = {
      source_id: `src-${Date.now().toString(36)}`,
      title,
      text,
      owner: form.owner.trim() || 'Brand Manager',
      kind: form.kind,
      ...(form.valid_from ? { valid_from: form.valid_from } : {}),
      ...(form.valid_through ? { valid_through: form.valid_through } : {}),
    }
    const sources = editingSourceId
      ? profile.sources.map((existing) => existing.source_id === editingSourceId ? { ...source, source_id: editingSourceId } : existing)
      : [...profile.sources, source]
    onSaveProfile({ ...profile, sources })
    setForm(emptySource)
    setEditingSourceId(null)
    setFormOpen(false)
    setMessage(editingSourceId ? 'Approved source updated. Recheck any open draft to use it.' : 'Approved source added. Recheck any open draft to use it.')
  }

  function editSource(source: EvidenceSource) {
    setForm({ ...emptySource, ...source })
    setEditingSourceId(source.source_id)
    setFormOpen(true)
    setMessage('Update the approved wording, owner, or validity dates, then save your changes.')
  }

  function removeSource(sourceId: string) {
    if (!canEdit) { setMessage('You do not have permission to remove approved sources.'); return }
    onSaveProfile({ ...profile, sources: profile.sources.filter((source) => source.source_id !== sourceId) })
    setMessage('Source removed. Existing review results need to be checked again.')
    if (editingSourceId === sourceId) { setEditingSourceId(null); setForm(emptySource) }
  }

  async function importSourceText(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMessage('That file is over 2 MB. Paste a smaller reference instead.'); return }
    try {
      const text = await file.text()
      if (!text.trim()) { setMessage('That file is empty.'); return }
      setForm((current) => ({ ...current, text }))
      setMessage(`${file.name} loaded into the source wording field. Review it before saving.`)
    } catch { setMessage('We could not read that file. Use a .txt or .md file.') }
  }

  const renewalCount = profile.sources.filter((source) => sourceStatus(source) === 'Renew soon').length
  const expiredCount = profile.sources.filter((source) => sourceStatus(source) === 'Expired').length

  return <div className="knowledge-page">
    <button className="knowledge-back" type="button" onClick={onBack}><Icon name="arrow" size={14} /> Back to the review desk</button>
    <div className="knowledge-heading">
      <div><div className="eyebrow"><span className="eyebrow-rule" />BRAND WORKSPACE <span className="eyebrow-dot">✳</span> SOURCE CABINET</div><h1>Put your standards to work<span className="heading-period">.</span></h1><p>Add approved facts, offer terms, and guidance. VerityBrand uses these references when you check copy.</p></div>
      <span className="review-state state-ready"><span className="state-indicator" />{profile.isSample ? 'SAMPLE PROFILE' : 'PRIVATE WORKSPACE'}</span>
    </div>

    <section className="brand-profile-card" aria-label="Brand workspace details">
      <div className="profile-monogram">{brandName.trim().slice(0, 1).toUpperCase() || 'B'}</div>
      <div className="profile-name-field"><label htmlFor="brand-name">Brand or organization</label><input id="brand-name" value={brandName} readOnly={!canEdit} onChange={(event) => setBrandName(event.target.value)} onBlur={saveBrandName} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveBrandName() } }} placeholder="e.g. Northstar Skincare" /><span>{isCloud ? 'Workspace data is shared with authorized members.' : 'This name stays in your browser workspace.'}</span></div>
      <div className="profile-actions"><button type="button" className="profile-save-button" onClick={saveBrandName}>Save name</button><button type="button" className="sample-link" onClick={onLoadSample}>Try the Daybreak example <Icon name="arrow" size={14} /></button></div>
    </section>

    <div className="knowledge-summary"><div className="summary-card"><span>APPROVED REFERENCES</span><strong>{String(profile.sources.length).padStart(2, '0')}</strong></div><div className="summary-card"><span>RENEW SOON · 14 DAYS</span><strong>{String(renewalCount).padStart(2, '0')}</strong></div><div className="summary-card"><span>EXPIRED SOURCES</span><strong>{String(expiredCount).padStart(2, '0')}</strong></div></div>

      <section className="knowledge-table" aria-label="Approved brand sources">
      <div className="knowledge-section-heading"><div><span className="eyebrow-rule"/><h2>Approved references</h2><p>Only material you add here can support a matched claim.</p></div><button type="button" className="add-source-button" onClick={() => { setFormOpen((open) => !open); setEditingSourceId(null); setForm(emptySource) }}><Icon name="plus" size={15}/>{formOpen ? 'Close form' : 'Add a source'}</button></div>
      {formOpen && <form className="source-form" onSubmit={addSource}>
        <div className="source-form-heading"><span className="form-step">{editingSourceId ? 'EDIT REFERENCE' : 'NEW REFERENCE'}</span><strong>{editingSourceId ? 'Update this approved source' : 'Add a source your team has approved'}</strong><p>Paste the exact wording and name the person who owns it. You can add expiry dates for time-sensitive claims.</p></div>
        <div className="source-form-grid">
          <label>Reference title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Spring offer terms" required /></label>
          <label>Reference type<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}><option>Product fact</option><option>Offer or promotion</option><option>Brand voice</option><option>Legal or compliance</option><option>Other guideline</option></select></label>
          <div className="source-text-label"><label htmlFor="source-wording">Approved wording</label><textarea id="source-wording" value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} placeholder="Enter the approved statement or guideline exactly as it should be used…" rows={4} required /><span className="source-file-import"><Icon name="file" size={13}/><label htmlFor="source-upload">Import text from .txt / .md</label><input id="source-upload" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={importSourceText}/></span></div>
          <label>Information owner<input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="e.g. Product lead" /></label>
          <label>Valid from <input type="date" value={form.valid_from} onChange={(event) => setForm({ ...form, valid_from: event.target.value })} /></label>
          <label>Valid through <input type="date" value={form.valid_through} onChange={(event) => setForm({ ...form, valid_through: event.target.value })} /></label>
        </div>
        <div className="source-form-footer"><span>Sources are saved to this browser only.</span><button type="submit" className="primary-button"><Icon name="check" size={15}/>{editingSourceId ? 'Save source changes' : 'Save approved source'}</button></div>
      </form>}

      {profile.sources.length === 0 ? <div className="knowledge-empty"><div className="empty-proof-mark"><span/><span/><span/><i/></div><div><strong>Your source cabinet is ready for its first reference.</strong><p>Add a current fact or guideline, then check a draft against it. If you just want to see the flow, open the Daybreak example.</p></div><button type="button" className="secondary-button" onClick={() => setFormOpen(true)}>Add your first source <Icon name="arrow" size={14}/></button></div> : <>
        <div className="knowledge-table-head"><span>REFERENCE</span><span>APPROVED INFORMATION</span><span>OWNER · ID</span><span>VALIDITY</span></div>
        {profile.sources.map((source) => {
          const status = sourceStatus(source)
          return <article className="knowledge-row" key={source.source_id}>
            <strong>{source.title}<small>{source.kind ?? 'Approved reference'}</small></strong><p>{source.text}</p><span className="knowledge-date"><strong>{source.owner || 'Owner not set'}</strong><small>{source.source_id}</small></span><span className={`knowledge-tag ${status === 'Renew soon' ? 'tag-renew' : status === 'Expired' ? 'tag-expired' : ''}`}><Icon name={status === 'Expired' ? 'alert' : 'check'} size={12}/>{status}{source.valid_through ? <small> through {prettyDate(source.valid_through)}</small> : null}<span className="source-row-actions"><button type="button" aria-label={`Edit ${source.title}`} title={`Edit ${source.title}`} onClick={() => editSource(source)}><Icon name="edit" size={12}/></button><button type="button" aria-label={`Remove ${source.title}`} title={`Remove ${source.title}`} onClick={() => removeSource(source.source_id)}><Icon name="close" size={12}/></button></span></span>
          </article>
        })}
      </>}
      {message && <p className="knowledge-message" role="status">{message}</p>}
      <div className="knowledge-footnote"><Icon name="info" size={16}/><span>{isCloud ? 'Approved references are stored in your Supabase workspace.' : 'Local early-access profile. Uploads and reviewer decisions are not shared with a team or sent to a server.'}</span></div>
    </section>
  </div>
}
