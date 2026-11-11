import type { BrandProfile } from '../types'
import { Icon } from './Icon'

interface Props {
  profile: BrandProfile
  onReviewContent: () => void
  onManageSources: () => void
  onTrySample: () => void
  hasCloudAuth?: boolean
}

export function EntryScreen({ profile, onReviewContent, onManageSources, onTrySample, hasCloudAuth = false }: Props) {
  return <div className="entry-page">
    <header className="entry-topbar">
      <div className="brand-lockup"><span className="brand-mark"><Icon name="mark" size={27} /></span><div className="brand-wordmark"><span>VerityBrand</span><small>brand governance</small></div></div>
      <span className="entry-local-label"><span className="live-dot" />{hasCloudAuth ? 'EARLY ACCESS · SIGN-IN FOR WORKSPACES' : 'EARLY ACCESS · NO SIGN-IN'}</span>
    </header>

    <main id="main-content" className="entry-main">
      <section className="entry-heading" aria-labelledby="entry-title">
        <div className="eyebrow"><span className="eyebrow-rule" />THE VERITY DESK <span className="eyebrow-dot">✳</span> {profile.name.toUpperCase()}</div>
        <h1 id="entry-title">Where would you<br /><em>like to begin?</em></h1>
        <p>Choose the work you have today. Both paths use the same approved brand workspace.</p>
      </section>

      <section className="entry-roles" aria-label="Choose a starting point">
        <article className="entry-role entry-review-role">
          <div className="entry-role-top"><span className="entry-role-icon"><Icon name="review" size={21} /></span><span>FOR CREATORS & REVIEWERS</span></div>
          <h2>Review content</h2>
          <p>Check a draft against approved sources, inspect evidence, revise claims, and record a human decision.</p>
          <button type="button" className="entry-role-action" onClick={onReviewContent}>Open the review desk <Icon name="arrow" size={16} /></button>
          <span className="entry-role-index" aria-hidden="true">01</span>
        </article>
        <article className="entry-role entry-steward-role">
          <div className="entry-role-top"><span className="entry-role-icon"><Icon name="library" size={21} /></span><span>FOR BRAND STEWARDS</span></div>
          <h2>Manage approved sources</h2>
          <p>Maintain the facts and guidance reviewers use, with an owner and validity dates for each reference.</p>
          <button type="button" className="entry-role-action" onClick={onManageSources}>Open the source cabinet <Icon name="arrow" size={16} /></button>
          <span className="entry-role-index" aria-hidden="true">02</span>
        </article>
      </section>

      <section className="entry-sample" aria-labelledby="sample-title">
        <span className="entry-sample-mark"><Icon name="spark" size={19} /></span>
        <div className="entry-sample-copy"><span>NEW TO VERITYBRAND?</span><h2 id="sample-title">Try the Daybreak Coffee sample</h2><p>Open a preloaded review with a real mismatch to inspect.</p></div>
        <button type="button" className="entry-sample-action" onClick={onTrySample}>Try the sample review <Icon name="arrow" size={16} /></button>
      </section>
      <p className="entry-footnote">{hasCloudAuth ? 'Sign in to use shared workspaces. The Daybreak sample is available without an account.' : 'No account needed. This prototype saves work in the current browser only.'}</p>
    </main>
  </div>
}
