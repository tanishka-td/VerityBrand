# Trusted Analysis and Source Versioning Implementation Plan

> **For agentic workers:** Execute inline with TDD. Do not commit, push, merge, deploy, or run a live migration.

**Goal:** Give each cloud review immutable source provenance and generate its findings in an authenticated Edge Function.

**Architecture:** Add immutable source-version and review/finding link tables with database triggers. Share the existing deterministic TypeScript analyzer between browser-local mode and an authenticated Edge Function. The Edge Function reads through the user JWT, signs its server-generated payload through a service-role-only signing RPC, and calls a signature-verifying `SECURITY INVOKER` wrapper that delegates to the existing atomic submission RPC.

**Tech Stack:** Supabase PostgreSQL migrations/RLS/pgTAP, Supabase Edge Functions (Deno/TypeScript), React/TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-trusted-analysis-source-versioning-design.md`

## Global Constraints

- Preserve all uncommitted work and remain on `round3/ui-polish`.
- Use additive migrations only; do not run live migrations.
- Do not change UI/CSS/copy, roles, or existing approvals.
- Keep service-role credentials in Edge Function runtime only.
- Preserve browser-local and public Daybreak paths.

## Review Focus

- Source update/deactivation and concurrent version allocation → pgTAP source-version tests.
- Cross-tenant version references → composite-FK and RLS pgTAP tests.
- Legacy review/approval preservation → pgTAP counts and unchanged JSON snapshots.
- Browser-supplied findings cannot obtain trusted provenance → HMAC negative/positive tests.
- Invalid, future, expired, or missing source dates → shared analyzer tests used by both frontend and Edge.

---

### Task 1: Immutable source versions and relational bindings

**Files:**
- Create: `supabase/migrations/20261117100000_immutable_source_versions.sql`
- Modify: `supabase/tests/review_submission.test.sql`
- Modify: `frontend/src/components/SupabaseApp.tsx`
- Modify: `frontend/src/types.ts`

- [ ] Add RLS-protected, append-only source-version rows and version links for reviews/findings.
- [ ] Backfill one version per existing source; do not rewrite existing review or approval rows.
- [ ] Add source snapshot triggers, current-version pointer, composite FKs, and soft deactivation.
- [ ] Update cloud source reads/writes to use active current versions and deactivate rows without hard deletion.
- [ ] Add pgTAP tests for backfill, append-on-edit, soft deletion, immutability, and version links.

### Task 2: Shared analyzer and trusted Edge path

**Files:**
- Create: `supabase/functions/_shared/reviewAnalyzer.ts`
- Create: `supabase/functions/_shared/trustedSubmission.ts`
- Create: `supabase/functions/_shared/trustedSubmission.test.ts`
- Create: `supabase/functions/submit-review/index.ts`
- Create: `supabase/functions/submit-review/deno.json`
- Modify: `frontend/src/services/reviewApi.ts`
- Modify: `frontend/src/services/reviewSubmission.ts`
- Modify: `frontend/src/services/reviewSubmission.test.ts`
- Modify: `frontend/src/components/SupabaseApp.tsx`

- [ ] Move the existing pure deterministic analyzer into the shared module without changing its rules; make browser-local review call it.
- [ ] Add an authenticated Edge handler that gets the user, checks Owner/Editor membership, loads persisted draft and active source versions, and rejects stale client source-version context.
- [ ] Validate analyzer statuses, summary counts, validity dates, and evidence version references before submission.
- [ ] Add private HMAC key storage, service-role-only signer, authenticated verifier, and `SECURITY INVOKER` trusted wrapper in an additive migration.
- [ ] Keep the atomic legacy RPC and mark its browser-supplied results `browser_unverified`; mark only signature-verified results `server_analyzed`.
- [ ] Change cloud frontend persistence to invoke the Edge Function without sending findings or source text; include source-version IDs only as retry/staleness context.
- [ ] Add Deno tests for auth/role rejection, authoritative data use, fake finding/source input rejection, valid signatures, and result mapping.
- [ ] Add frontend tests proving Edge invocation contains no browser findings/sources and preserves request IDs across reloads.

### Task 3: Verification and documentation

**Files:**
- Modify: `docs/implementation/supabase-database-review.md`
- Modify: `docs/implementation/supabase-data-and-operations-policy.md`

- [ ] Run full frontend tests, frontend production build, Deno Edge tests, and pgTAP tests when local tooling is available.
- [ ] Run static diff checks and report database/Edge runtime blockers separately.
- [ ] Document migration ordering, service-role secret boundary, provenance labels, and local test commands.

