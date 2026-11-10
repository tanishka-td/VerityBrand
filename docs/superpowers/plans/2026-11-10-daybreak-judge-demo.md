# Daybreak Judge Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the deterministic Daybreak Coffee review automatically while preserving custom browser workspaces and enforcing separate source confirmation, creator revision, exception, and final approval stages.

**Architecture:** Keep the React/Vite app and localStorage architecture. Reuse the existing sample data, analyzer branch, source cabinet, and review components; add focused typed state and UI only where the workflow is missing. Do not add Supabase or connect the Python analyzer.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library, jsdom.

**Spec:** Approved Daybreak judge demo design in the preceding conversation.

## Global Constraints

- Preserve all custom workspaces and existing user drafts.
- Preserve any saved non-sample review result, decision, approval, and activity when changing the startup workspace to Daybreak.
- Do not overwrite custom workspace data when initializing the judge demo.
- Keep the Daybreak review date fixed at `2026-11-10` and use the approved November offer through `2026-11-15`.
- Unmatched claims remain `unverified`; never label them false.
- Keep automated findings, human exceptions, and final human approval distinct.
- Do not introduce Supabase, commit, or push.
- Run focused tests and the production build before reporting completion.

## Review Focus

- Malformed or absent localStorage: app still initializes the canonical Daybreak sample.
- Existing custom workspaces and drafts: all values remain unchanged and accessible after startup switches to Daybreak.
- Stale async review response: an earlier analysis cannot replace the latest checked draft.
- Edit after confirmation or approval: prior analysis/approval cannot be applied to the changed draft; recheck is required.
- Missing/ambiguous evidence: finding remains `unverified` with non-accusatory wording and no false claim.

---

### Task 1: Add focused frontend test infrastructure and analyzer tests

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/services/reviewApi.test.ts`
- Create: `frontend/src/test/setup.ts`

**Interfaces:**
- Consumes: `analyzeDraft(content: string, profile: BrandProfile): Promise<AnalysisResult>`.
- Produces: `npm test --prefix frontend -- --run` runs Vitest in jsdom and the tests can render React components.

- [ ] Add Vitest, jsdom, `@testing-library/react`, `@testing-library/user-event`, and jest-dom as development dependencies, and add the `test` script.
- [ ] Configure Vitest with the React plugin, jsdom environment, and a setup file that imports jest-dom matchers.
- [ ] Add a failing analyzer test for the exact sample draft: supported `250 ml` and `80 mg` findings with `product-daybreak-01` evidence, contradicted `20% off through November 30` with `offer-2026-11` evidence and fixed review date.
- [ ] Add a test using a sample profile with no relevant approved evidence and assert the finding is `unverified`, requires human review, and does not say “false”.
- [ ] Run the focused analyzer tests and verify they pass against existing behavior before modifying demo logic.

### Task 2: Start in the canonical sample without replacing user data

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `DEMO_PROFILE`, `DEMO_DRAFT`, existing saved state and `analyzeDraft`.
- Produces: startup state with Daybreak active, review open, and analysis completed; preserved non-sample profiles and drafts.

- [ ] Add a failing React test that mounts with empty storage and expects the Daybreak review, exact draft, and findings without clicking the entry-screen sample button.
- [ ] Add a failing hydration test with an existing custom profile and unique draft, then assert the custom profile and draft survive while Daybreak opens as the active sample.
- [ ] Initialize startup state around the canonical sample and start its analysis automatically without routing through an entry-screen flash.
- [ ] Merge the demo profile without replacing non-demo profiles/drafts; initialize only the sample draft to the canonical text and retain custom saved values byte-for-byte.
- [ ] Migrate the existing single active review snapshot/decision state to a profile-keyed saved state before activating Daybreak, then restore it when returning to that profile.
- [ ] Keep the entry screen reachable through the existing app navigation and keep existing sample reload behavior deterministic.
- [ ] Run the focused App tests and confirm clean and populated storage cases pass.

### Task 3: Generate and display the Offer Manager confirmation question

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/services/reviewApi.ts`
- Modify: `frontend/src/components/ReviewWorkspace.tsx`
- Modify: `frontend/src/services/reviewApi.test.ts`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- `Finding.reviewer_question?: string` holds a finding-specific question when the human reviewer needs one.
- Sample promotion finding question: “The approved offer is 10% off through November 15, 2026, but this draft says 20% off through November 30. Is the approved offer still current, or is there updated approval for the draft terms?”

- [ ] Add a failing analyzer assertion for the exact Offer Manager question and verify the approved offer remains attached as evidence.
- [ ] Add a failing app-flow test that the question appears in the Offer Manager response stage and is absent from unrelated findings.
- [ ] Add the optional typed question to the sample promotion finding without changing finding statuses, evidence references, or generic workspace analysis.
- [ ] Render the question clearly in the human review UI next to the existing response controls.
- [ ] Run analyzer and component tests.

### Task 4: Preserve checked draft revisions and separate workflow stages

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ReviewWorkspace.tsx`
- Create: `frontend/src/App.workflow.test.tsx`

**Interfaces:**
- Add a `DraftRevision` record with stable ID, content, checked timestamp/date, and associated review snapshot/status.
- Store revisions by workspace ID; append a revision when a draft is successfully checked, deduplicating an identical consecutive checked draft.
- Keep `ReviewDecision` values for source confirmation/exception separate from the final `approved` flag.

- [ ] Add failing component/workflow tests for the sequence: source confirmed → creator edits → new analysis → final approval.
- [ ] Add tests proving source confirmation alone cannot clear a contradicted finding or approve the draft; exception approval is recorded separately and still requires final sign-off.
- [ ] Record immutable checked draft versions and associate final approval with the latest checked revision. Do not store an entry for each keystroke.
- [ ] Invalidate analysis-dependent sign-off when the draft changes, and require a successful fresh check before final approval.
- [ ] Display the checked revision history in the review workspace while retaining the existing activity trail.
- [ ] Verify saved revisions hydrate from localStorage and custom-workspace revision histories are preserved during sample initialization.
- [ ] Run focused workflow tests.

### Task 5: Full verification

**Files:**
- No additional files unless verification exposes a defect.

- [ ] Run all frontend tests with `npm test --prefix frontend -- --run` and confirm every test passes.
- [ ] Run `npm run build --prefix frontend` and confirm the Vite production build succeeds.
- [ ] Manually verify a fresh browser session opens the Daybreak review with all three sources available and the expected three findings.
- [ ] Manually verify a browser session with a custom workspace and draft preserves both while the sample opens.
- [ ] Walk through Offer Manager confirmation, creator correction/recheck, exception handling, and final human approval; verify each stage is visibly distinct.
- [ ] Report changed files, test command/results, build command/result, and any unverified behavior. Do not commit or push.
