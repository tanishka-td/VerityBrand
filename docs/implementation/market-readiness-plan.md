# VerityBrand market-readiness implementation plan

This document is the implementation brief for taking the current prototype to a dependable, end-to-end product. Work in the phases below; do not describe a planned or partly built capability as finished. Keep the Daybreak sample available as an optional guided example throughout.

## Product goal

VerityBrand gives a content creator a clear review of campaign claims against approved sources, gives brand stewards a separate place to maintain those sources, and lets an authorized person make and record the final decision. A source match is evidence for a reviewer, not automatic permission to publish. Missing or ambiguous evidence must be called **unverified**, never silently treated as false.

## Round 3 commitments from the Round 2 submission

The three submitted improvements are included in this plan and map to the phases below:

1. **Shared workspaces and real collaboration** — Phase 2 defines secure shared persistence and membership; Phase 4 completes draft ownership, reviewer assignment, decisions, and notifications.
2. **Stronger evidence-grounded AI analysis** — Phase 3 defines the authenticated analysis service, source-grounded findings, abstention, and an evaluation set. Automated analysis proposes findings; a person retains final approval.
3. **Multimodal source and content review** — Phase 5 adds document extraction and image OCR with traceable page or image-region references. Video, audio, and broader visual interpretation remain later extensions.

These are development commitments, not claims that the capabilities are already complete. The current browser checker remains rule-based. A first browser-local image OCR slice is now implemented, but document extraction, shared collaboration, and the authenticated evidence-grounded analysis service are still pending.

## Keep the two entry views

Keep two distinct starting points: **Content review** for creators and reviewers, and **Approved sources** for brand stewards. Give each view a tailored sign-in entry and navigation, but use one account identity and one authentication system underneath. The chosen entry point is a landing context, not an authorization check. Enforce permissions from the signed-in user's workspace role in database policies and in the interface.

Recommended permission model:

- **Owner:** manage workspace and members, sources, drafts, review decisions, and final approval.
- **Editor/creator:** maintain drafts, run checks, revise, and request review; cannot make reviewer decisions or final approval.
- **Reviewer:** inspect evidence, record a decision or documented exception, and give final approval; source editing is not implied.
- Permit a person to hold multiple roles only through explicit workspace membership grants. Do not infer role from which sign-in page they used.

The current schema has owner/editor/reviewer roles. Before relying on it for customers, decide whether source stewardship needs its own role or remains an owner permission. Update the app and policies together, with tests, rather than assuming the sidebar protects data.

## Current state verified in this repository

- The React 19, TypeScript, and Vite interface has distinct creator/reviewer and steward entry points, a Daybreak sample, local browser mode, and a Supabase client path.
- A Supabase SQL migration defines workspaces, memberships, sources, drafts, revisions, reviews, findings, reviewer decisions, approvals, and RLS policies. This is a schema in the repository; it does not prove that a live project has been provisioned or deployed.
- The web checker runs in the browser. It uses conservative rules and has a sample-specific Daybreak path plus a source-matching path for other profiles.
- A first English image-text extraction path uses Tesseract.js in the browser. It supports PNG/JPG/WebP uploads and the Daybreak sample creative, shows OCR confidence and selectable regions, and requires people to check extracted text before adding it to a draft. OCR is not visual analysis or verification; uploaded images are not persisted. The first use downloads the recognition engine and language data from a public CDN.
- `analysis/analyzer.py` is a separate Python implementation with a documented profile/output contract. It is not connected to the frontend or a deployed API.
- No service-role credential belongs in the frontend. No customer data should be used in the public judge sample.

## Implementation phases

### Phase 0 — Stabilize the prototype

1. Keep the project structure small: `frontend/`, `analysis/`, `supabase/`, `docs/`, `.github/`, and the root project instructions. Remove only verified generated artifacts, caches, stale copies, or temporary files; retain source, lockfiles, tests, migrations, demo assets, and decision history.
2. Keep setup and handoff documents consistent with the actual code and migrations. Record what is implemented, what is configured in a live environment, and what remains separate.
3. Add repeatable Python regression tests and maintain frontend tests for entry routing, review workflow, evidence, role gating, and sample flow.
4. Establish a single canonical review contract: request includes workspace/profile, draft revision, and a fixed review date; response has validated finding statuses, source IDs, explanations, and explicit `final_approval_required: true`.
5. Resolve the existing analyzer split. Prefer one canonical implementation behind a server endpoint. Port the Python rules to the chosen server runtime or host the Python analyzer as a private authenticated service; do not maintain two drifting checkers indefinitely.

**Exit criteria:** clean install, successful production build, passing frontend and analyzer tests, sample can be completed from draft to human approval, and docs accurately describe the live limits.

### Phase 1 — Define the product and data boundaries

1. Decide initial customer type, workspace lifecycle, data retention, supported content formats, supported languages, expected team size, and what counts as an approved source.
2. Define database ownership and relationships for organizations/workspaces, members, sources and source versions, campaigns, drafts and revisions, checks, findings, reviewer assignments, decisions, approvals, and audit events.
3. Treat each check as an immutable snapshot of one exact draft revision and one versioned set of sources. An edit or source change makes that check stale and requires a new check.
4. Add explicit source states (draft, approved, expired/revoked) and validity dates. Only approved, current sources may support a `supported` result.
5. Define deletion, export, retention, backup, and account-offboarding behavior before storing real campaign material.

**Exit criteria:** reviewed data model, role matrix, threat model, and written acceptance criteria for each state transition.

### Phase 2 — Authentication, workspace membership, and secure persistence

1. Configure Supabase Auth for the chosen email sign-in flow, redirects, recovery, verification, and session expiry. Use the same account for both role-specific entry routes.
2. Add workspace creation, switching, invitations, membership changes, and explicit role assignment. Avoid selecting the first membership silently once people can belong to multiple workspaces.
3. Review every RLS policy and SQL grant for each table and operation. Add automated database policy tests for anonymous users, unrelated signed-in users, owners, editors, and reviewers. Include cross-workspace read/write denial and self-promotion prevention.
4. Test that records cannot be reassigned across workspaces by changing IDs in requests. Make revision, finding, decision, and approval relationships enforceable in the database.
5. Add private Storage buckets only when file uploads are implemented. Add per-workspace storage policies, file size/type checks, malware scanning or safe processing, retention, and signed access where needed.
6. Keep only the Supabase URL and publishable/anon key in frontend build settings. Store service-role keys, AI provider keys, and other privileged secrets in server-side secret management. Never place them in source, `.env.example` with real values, `VITE_*`, browser storage, or public logs.

**Exit criteria:** tested identity and role behavior, reviewed RLS/grants, cross-tenant access tests pass, no privileged secret is shipped to the browser.

### Phase 3 — Canonical evidence-based analysis service

1. Route analysis through a server-side endpoint (for example, an authenticated Supabase Edge Function) that verifies membership and role, validates payload size/schema, and loads approved sources itself. Do not trust source data or role claims supplied by the browser.
2. Start with deterministic checks for structured facts, claims, offers, dates, and required terms. Return only `supported`, `contradicted`, `outdated`, or `unverified`.
3. Require every supported/contradicted/outdated result to identify the exact source version and relevant passage. If no clear evidence exists, return `unverified` and explain why.
4. If an LLM is added, use it to extract candidate claims or retrieve likely passages, not to declare a claim true. The server must ground outputs in approved evidence, validate structured output, reject invented source IDs, and abstain on low confidence.
5. Maintain a versioned evaluation set covering matches, conflicts, missing evidence, stale sources, ambiguous sources, negation, units, dates, multiple claims, irrelevant sources, and adversarial text. Measure precision/recall per category and review false support before release.
6. Add rate limits, timeouts, retries with safe idempotency, request IDs, privacy-aware logs, and clear user-facing errors.

**Exit criteria:** one canonical endpoint used by both web entry contexts, evidence is traceable to immutable source versions, evaluation thresholds are met, and all uncertain results remain reviewable.

### Phase 4 — Complete the end-to-end team workflow

1. Creator starts a campaign, enters or uploads copy, chooses a workspace, and saves a draft.
2. System stores a draft revision and launches analysis against approved current sources.
3. Review screen shows every finding with status, the exact claim span, why it was flagged, source passage, source date/owner, and a clear next action.
4. Creator revises and rechecks; the UI clearly marks old findings and approvals as stale when draft text or sources change.
5. Creator requests review. The system assigns a reviewer, records status, and notifies them through the chosen in-product/email mechanism.
6. Reviewer confirms evidence, asks for more evidence, or approves a documented exception. Exception is recorded separately and never changes an automated finding to `supported`.
7. Authorized reviewer explicitly approves the exact reviewed revision. Keep a durable audit record of actor, time, revision, source snapshot, decisions, and approval mode.
8. Add recovery states for failed analysis, failed persistence, duplicate requests, missing reviewer, and concurrent edits.

**Exit criteria:** one user can complete the whole flow; separate creator and steward users can collaborate across accounts; audit history remains consistent through revision and recheck.

### Phase 5 — File ingestion and multimodal work (in progress)

1. Harden the initial browser-local image OCR slice: test real campaign images, improve low-confidence handling, and carry confirmed OCR text and region pointers into evidence findings without treating OCR as proof.
2. Add safe PDF/DOCX extraction with page/paragraph offsets and citation pointers; retain existing text/Markdown import.
3. Add deeper campaign image review only when each claim can be linked back to a visible region. Treat extracted text as a candidate requiring evidence checks.
4. Consider video, audio, localization, and social-platform connectors as later extensions. Do not promise multimodal review before file handling, privacy controls, and evidence traceability are verified.
5. Keep raw files private, isolate processing jobs, validate formats and limits, and provide delete/retention controls.

**Exit criteria:** users can inspect exactly where extracted content came from, and errors or unsupported formats fail safely without losing the draft.

### Phase 6 — Product quality and launch readiness

1. Complete responsive layouts, keyboard access, screen-reader labels, focus handling, accessible status colors, and reduced-motion support.
2. Add component/integration tests, analyzer evaluation, database RLS tests, and end-to-end browser tests for both views, revision invalidation, errors, and approval.
3. Add operational monitoring for endpoint failures, analysis latency, auth failures, and storage processing without logging sensitive draft text by default.
4. Prepare privacy notice, terms, support route, incident process, onboarding, source setup guide, and data export/delete workflow.
5. Pilot with a small number of consenting teams. Measure false support rate, unresolved finding rate, time to resolve, reviewer completion, and user-reported clarity before widening claims about accuracy.

**Exit criteria:** launch checklist passed, support and privacy processes exist, no critical cross-tenant or approval-integrity defects remain, and product claims reflect measured results.

## Public judge demo and security

Judges can try a public prototype without receiving access to customer data or privileged credentials:

1. Publish the static frontend at a public URL. Use a **separate demo Supabase project** from any development or future production project.
2. Keep a prominent **Try Daybreak sample** action that opens a fictional, self-contained sample flow without requiring sign-in. Prefer a local deterministic sample or a read-only demo account/data path; do not let anonymous visitors write into a shared workspace.
3. Keep the two role-specific sign-in entries visible for judges who need to inspect the authenticated creator/reviewer and steward views. Provide a dedicated judge demo account and show its login credentials directly on the website beside a clear **Use demo account** action, so judges can sign in without requesting access or receiving a walkthrough. Credentials shown on a public page are public; the account must therefore be isolated to a separate demo Supabase project, contain only synthetic data, and have tightly limited permissions. Never give judges a service-role key or access to development, production, or customer workspaces.
4. Seed only fictional brands, sources, drafts, and decisions. Constrain writes to the demo workspace and make the demo recoverable: reset shared demo data on a schedule or provide a safe reset path so one judge's edits do not block another judge. Add rate limits and monitoring appropriate to a public account. Do not rely on the visible demo password as a secret.
5. In the public frontend, expose only the project URL and publishable/anon key. This key is designed to be public; it is safe only when database grants, RLS policies, Storage policies, and server endpoints correctly enforce access.
6. Keep AI provider credentials and Supabase service-role credentials server-side. Call privileged analysis through a server function that authenticates the user, checks workspace membership, validates inputs, and limits usage.
7. Before sharing the link, test it in a fresh/incognito browser as an anonymous visitor, using the website's displayed demo credentials, and as at least two separate workspace users. Confirm the demo account can complete the intended judge journey, shared changes can be reset, and one tenant cannot read or modify another tenant's data; verify the public sample, both entry routes, and human approval work.
8. Display a brief demo-data note and a clear boundary between the sample workspace and private user workspaces. Do not load real submissions or team records into the demo project.

### Daybreak guided judge journey

Use a fictional launch campaign for **Daybreak Coffee**. The sample starts with a realistic short campaign containing four claims, then puts those claims beside a small, believable source cabinet. It should demonstrate how the product handles different evidence outcomes rather than only presenting a single discount mismatch.

| Campaign claim | Approved reference | Expected result | What the judge should see |
| --- | --- | --- | --- |
| 250 ml can with 80 mg caffeine | Current product facts | Supported | Exact product source, matched values, no automatic final approval |
| 20% off through November 30 | Current offer says 10% through November 15 | Contradicted | Both terms, offer owner, suggested wording, and a review handoff |
| Summer Blend still available after August 31 | Archived summer approval valid through August 31 | Outdated | Expired source date and a prompt to remove or confirm the seasonal claim |
| “Best cold brew in the city” | No approved comparative-claim evidence | Unverified | No fabricated citation; clear explanation that missing evidence does not prove the claim false |

The review view should make the example self-explanatory: a compact four-outcome strip appears above the draft and evidence panels. Each card selects its finding so a first-time visitor can jump straight to the matching source and decision controls. Keep the preloaded draft editable. The demo should show this short path:

1. Open **Try the Daybreak sample** from the public landing page without signing in.
2. Select the supported claim and inspect its approved product source.
3. Select the mismatch, send it to the Offer Manager, record that the source is current, apply the approved wording, and recheck the revised draft.
4. Inspect the expired seasonal source and the unsupported superlative. Demonstrate that both remain open until the creator removes/revises the wording or a reviewer records a reasoned exception.
5. Complete the required human review for any remaining findings and explicitly approve the exact checked revision. The activity/revision trail should make the recheck and final sign-off visible.

Use a fixed `as_of` date for this fictional scenario so offer and expiry results do not change between judging sessions. Keep the source validity dates, campaign copy, expected findings, and regression assertions together as one fixture. Add an automated check that the sample produces one of each expected status and that evidence points to the product, offer, and expired seasonal references; the unverified claim must have no unrelated source attached.

Keep the existing text campaign as the first guided path, and add an optional Daybreak social creative for multimodal review. The creative should visibly contain the same fictional offer mismatch and unsupported comparative claim, so the judge can compare the image with the approved offer and brand sources. OCR text must be shown as extracted content with a confidence cue and a way to inspect the image; uncertain or unreadable text must be called out for human confirmation. OCR is text extraction, not visual truth verification: the system must not infer product facts from appearance, approve a logo or design automatically, or treat an OCR result as evidence. The four evidence outcomes and human sign-off remain grounded in the approved source cabinet. Keep the text-only path available for visitors who do not want to upload or inspect an image.

For a public judge link, use browser-local sample data or a read-only demo path with no shared anonymous writes. Keep authenticated creator/reviewer and brand-steward entry points available separately, using only a dedicated demo Supabase project and synthetic data for any signed-in judge access.

**Judge acceptance checklist:** public URL opens; sample is discoverable without assistance; creator and steward entry routes are distinct; the website visibly provides working demo-account credentials and a clear way to use them; that account is isolated, limited, synthetic-data-only, and tested/resettable; unconfigured/local mode explains that data stays in that browser; authenticated mode has tested RLS; sample facts and sources are fictional; checks show source evidence; exceptions remain distinguishable; final approval is a human action; no privileged secret is present in built assets or browser storage.

## Working instructions for future implementation tasks

- Start each task by checking the current branch and working tree; preserve uncommitted work and teammate changes. Work on `round2/veritybrand-development` unless directed otherwise. Do not push or commit unless explicitly requested.
- Inspect the relevant component, service, type, migration, and tests before changing them. Prefer focused changes that preserve existing routes and the Daybreak sample.
- Do not add dependencies unless the chosen implementation needs them. Keep lockfiles consistent when dependencies change.
- For each behavior change, add or update a regression test. Do not claim an untested path works.
- Run Python checks from `analysis/` with `python -m unittest -v`. Run frontend checks from `frontend/` with `npm test -- --run` and `npm run build` once dependencies are installed.
- Database changes require migration review plus tests for allowed and denied access by role and workspace. UI-only hiding is not authorization.
- Never store privileged secrets in client code or Vite variables. Never use live customer data in screenshots, test fixtures, or public judge demo.
- Update this plan and the project README when architecture changes. Keep implemented, deployed/configured, and planned status clearly separate.

## Known boundaries at the start of this plan

- The web checker and Python analyzer are separate implementations; neither should be marketed as a general AI fact-checker.
- A committed migration does not establish that a live Supabase project has been provisioned, configured, deployed, or security-reviewed.
- A publishable key can be visible in a public web build. Security comes from tested RLS, grants, server-side secret handling, and data separation—not from hiding the public key.
- OCR is limited to English text extraction from images in the current browser tab; it does not interpret visuals, documents, video, or audio. Production notifications, broad integrations, and market-scale operations are not established by the current prototype.
