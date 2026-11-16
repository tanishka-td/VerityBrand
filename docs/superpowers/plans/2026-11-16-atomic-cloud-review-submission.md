# Atomic Cloud Review Submission Implementation Plan

> **For agentic workers:** Execute inline with the TDD workflow. Do not commit, push, merge, deploy, or run remote migrations.

**Goal:** Persist each cloud review as one idempotent PostgreSQL transaction with database-allocated revision numbers.

**Architecture:** Add an authenticated `SECURITY INVOKER` RPC that uses existing RLS and Owner/Editor role checks. Lock the draft row, verify submitted content matches the saved draft, allocate the revision number in the database, and insert the revision, review, and findings atomically. Store a request UUID and SHA-256 payload fingerprint on the review so same-payload retries return the existing IDs and changed-payload retries fail. Mark new analyses `browser_unverified`; this work does not make client-generated findings trustworthy.

**Tech Stack:** Supabase PostgreSQL migrations and pgTAP, React/TypeScript, Supabase JS, Vitest.

**Spec:** User request in the current VerityBrand development thread (Phase 1 cloud persistence improvements).

## Global Constraints

- Work only on `round3/ui-polish`; preserve existing source-validity changes.
- Do not change UI appearance, authentication, role permissions, or source versioning.
- Do not execute migrations against any live project or use a service-role key in the browser.
- Preserve existing unique constraints and final-approval integrity protections.
- Keep existing records readable and mark legacy analysis provenance explicitly.
- Do not commit, push, merge, or deploy.

## Review Focus

- An invalid finding after parent inserts must roll back the revision and review.
- Same request ID and same payload must return the same revision/review/finding IDs.
- Same request ID and changed payload must fail without adding rows.
- Concurrent submissions to one draft must receive distinct database-allocated revision numbers.
- Owner/Editor submissions remain allowed and Reviewer submissions remain denied by existing authorization.

---

### Task 1: Database transaction and pgTAP coverage

**Files:**
- Create: `supabase/migrations/20261116120000_atomic_review_submission.sql`
- Create: `supabase/tests/review_submission.test.sql`

**Interfaces:**
- Produces `public.submit_review(p_workspace_id uuid, p_draft_id uuid, p_request_id uuid, p_content text, p_sources_snapshot jsonb, p_analysis jsonb) returns jsonb`.
- Returns `{draft_revision_id, revision_number, review_id, finding_ids}` where `finding_ids` maps client finding keys to database finding IDs.

- [ ] Write pgTAP tests for allowed Owner submission, atomic rollback, same-payload retry, changed-payload rejection, and sequential revision allocation; run only if an isolated local DB is available.
- [ ] Add an additive migration with a revision-allocation trigger, review request/hash/provenance columns and uniqueness, finding client-key mapping, and the invoker RPC.
- [ ] Explicitly check `auth.uid()` and Owner/Editor membership; preserve existing RLS policies and grants.
- [ ] Keep the existing revision uniqueness and approval trigger/constraints intact.

### Task 2: Frontend atomic submission integration

**Files:**
- Create: `frontend/src/services/reviewSubmission.ts`
- Create: `frontend/src/services/reviewSubmission.test.ts`
- Modify: `frontend/src/components/SupabaseApp.tsx`
- Modify if required: `frontend/src/types.ts`

**Interfaces:**
- The service calls the RPC and retains an idempotency UUID across retries of the same payload; a changed payload receives a new UUID.
- `SupabaseApp.tsx` uses the RPC result to map client finding keys to persisted finding IDs.

- [ ] Test stable request ID across a failed call/retry and new ID for a changed payload.
- [ ] Serialize autosave writes and make review submission wait for the latest pending save.
- [ ] Replace separate revision/review/finding inserts with one RPC call and preserve existing UI state behavior.
- [ ] Verify database errors leave frontend review state unchanged and can be retried.

### Task 3: Local concurrency test and documentation

**Files:**
- Create: `frontend/src/services/reviewSubmission.integration.test.ts`
- Modify: `docs/implementation/supabase-database-review.md`
- Modify: `docs/implementation/supabase-data-and-operations-policy.md`

- [ ] Add a concurrency test that only runs against an explicitly configured localhost Supabase instance and submits two distinct requests to one draft concurrently.
- [ ] Document setup for the local integration test, migration behavior, legacy rows, and the remaining browser-analysis trust limitation.
- [ ] Run the complete frontend test suite and production build; report database test execution separately from prepared pgTAP coverage.

