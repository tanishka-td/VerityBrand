# VerityBrand database and RLS review

Static review of the repository’s local Round 3 SQL and tests. No SQL was executed, no live project was queried, and this review does not prove that remote policies match these files.

## Trusted analysis and source provenance (2026-11-17)

Migration `20261117100000_immutable_source_versions.sql` backfills each current approved source as immutable version 1, appends a new row for source edits and deactivation, and controls the active version pointer in the database. New review snapshots and finding evidence containing `source_version_id` are linked through `review_source_versions` and `finding_source_versions`. Existing review JSON snapshots, reviews, and approvals are retained as legacy records.

Migration `20261117110000_trusted_review_submission.sql` adds `submit_review_trusted`, which remains `SECURITY INVOKER` and verifies a server-side HMAC before delegating to the existing atomic `submit_review` RPC. The Edge Function reads the user, workspace membership, draft and current approved source versions with the user's JWT, runs the shared deterministic analyzer, and submits the derived result using that JWT. A separate service-role client can only ask the database to sign the generated payload; its key remains an Edge Function secret. Direct legacy RPC submissions continue to be labeled `browser_unverified`; historic rows remain `legacy_unverified`.

The signature proves that the configured Edge Function generated the result from the signed payload. It does not make the current deterministic matching rules a general-purpose or independently validated fact-checking engine. Human approval requirements remain in effect. Neither migration nor function has been applied/deployed or tested against a database in this workspace.

## Migration history and order

The project owner reports live history contains `20261110173550 | initial_veritybrand_schema`, while the former repository baseline was version `20261110120000`. The baseline SQL was renamed locally to `supabase/migrations/20261110173550_initial_veritybrand_schema.sql`; it is intended to preserve the original baseline body and align local versioning. Keep only this renamed baseline in the local migration directory. Do **not** rerun the baseline against the live project and do not run migration repair. Before any remote operation, inspect `supabase migration list --linked` and confirm that the initial version is recognized as applied and only the two later versions are pending. Stop if history differs.

Pending order:

1. `20261115170000_enforce_owner_source_and_reviewer_approval_permissions.sql`
2. `20261115180000_enforce_final_approval_integrity.sql`
3. `20261116120000_atomic_review_submission.sql`
4. `20261116130000_enforce_atomic_review_submission.sql`
5. `20261117100000_immutable_source_versions.sql`
6. `20261117110000_trusted_review_submission.sql`

The new Phase 1 migration adds an authenticated, `SECURITY INVOKER` `submit_review` RPC that writes the draft revision, review, and findings in one PostgreSQL transaction. It fingerprints the canonical JSONB submission payload with SHA-256 and stores a unique request ID on the review; same-ID/same-payload retries return the saved record IDs, while a changed payload is rejected. A `BEFORE INSERT` revision trigger locks the parent draft and allocates `max(revision_number) + 1`; the existing uniqueness constraint remains in place. Existing rows are labeled `legacy_unverified`; new browser analyses are labeled `browser_unverified`. The migration does not change existing RLS policies or role permissions and does not make browser-supplied analysis trustworthy. It has not been applied or tested against a database in this workspace.

The follow-up migration adds restrictive INSERT policies to draft revisions, reviews, and findings. They require the function-local `veritybrand.atomic_review_submission` setting that PostgreSQL applies on `submit_review` entry and restores on function exit. Existing permissive role policies and table grants remain unchanged; authenticated direct table inserts must still satisfy the restrictive gate. Owners and Editors retain submission through the RPC, and Reviewers remain unable to submit. These policies also constrain any other permissive policies applying to authenticated INSERTs. The behavior is covered by three new pgTAP assertions but remains unexecuted until local database tooling is available.

The permission migration adds `workspace_members.can_final_approve` (false by default; a check constraint permits true only for `reviewer`), restricts membership UPDATE to that column and Owner RLS, replaces source write policies with Owner-only policies, and replaces final approval INSERT with Owner-or-authorized-Reviewer. The later migration installs a `BEFORE INSERT` trigger validating approval mode/state and required documented exceptions. It does not enforce the actor’s role; that is the preceding RLS policy’s job.

## Static permission and integrity findings

- Initial schema enables RLS for all nine public tables and uses `is_workspace_member` / `has_workspace_role` SECURITY DEFINER helpers with empty `search_path`; execution is revoked from `public`/`anon` and granted to `authenticated`.
- Initial grants revoke table access from `anon` and `authenticated` then grant authenticated CRUD-like privileges; RLS policies constrain rows. `workspace_members` has broad table grants initially, but Round 3 revokes table UPDATE and grants only `UPDATE(can_final_approve)` to authenticated. That prevents editing role/workspace/user columns through the regular authenticated table grant.
- Source SELECT remains membership-scoped. New INSERT requires Owner and `created_by = auth.uid()`; UPDATE/DELETE require Owner. No other permissive source write policy exists in the repository migration chain after the old editor policies are dropped. PostgreSQL permissive policies OR together, so the target live database must still be checked for manually-created policies not represented here.
- Reviewer authorization is stored on that user’s membership row. Owners may always insert their own final approval. Reviewers require the flag; Editors match neither role. The check constraint rejects authorizing an Editor. The Owner policy’s `USING` and `WITH CHECK` makes the authorization change workspace-scoped.
- The approval trigger requires a matching review/revision requiring approval. `manual_review` is allowed only when there are no findings; `reviewed` requires at least one finding and an `exception_approved` decision for every finding flagged `requires_human_review`. A documented exception remains a decision record; it does not change the finding status.
- The trigger checks that a matching decision exists, but current decision rows are append-only and the test does not exercise edits/deletes by privileged database roles. Trigger/foreign-key/RLS behavior should receive runtime tests before production.
- The direct INSERT path for revisions, reviews, and findings is restricted by the atomic-submission migration. The legacy `submit_review` RPC remains callable by Editors/Owners and labels its browser-supplied findings `browser_unverified`; the new signed Edge path performs server analysis and stores `server_analyzed`. The trusted migration and Edge Function are still unexecuted here, so runtime authorization, signing, source locks, and provenance remain unverified until local database tests run.
- The existing trigger is `BEFORE INSERT`, not UPDATE. The table currently grants no UPDATE to `final_approvals`; keep that boundary. A privileged service operation could bypass normal user assumptions, so service credentials must stay server-side.

## Test inventory and known gaps

`supabase/tests/role_permissions.test.sql` declares `plan(22)` and contains the Round 3 role cases for Owner source CRUD and approval, Editor source write denial/read access/cross-workspace source isolation/cannot authorize Reviewer/decision and approval denial, Reviewer source write denial/read access/decision permission/unauthorized approval denial, and Owner authorization followed by authorized Reviewer approval. JWT identity is set with transaction-local claims. Fixed test rows are synthetic and the transaction rolls back.

Static inspection indicates the plan is intended to match 22 assertions; it has not been executed. It is not full RLS coverage. Add or verify runtime cases for anonymous access, unrelated signed-in outsiders, cross-workspace writes and reassignment of IDs, membership self-promotion/owner transfer, authorization revocation, invalid reviewer-only flag, every trigger failure branch, `manual_review`, missing findings/decisions, duplicate approvals, and data consistency under stale draft/source edits. Also verify no extra permissive RLS policies or grants exist in the actual target.

`supabase/verify/round3_role_permissions.sql` is read-only SQL for inspecting columns, constraints, policies, grants, helper function definitions, and authorized membership rows. It is not a simulation of RLS and has not been executed. Review its output from a safe staging/local database before production.

`supabase/tests/review_submission.test.sql` prepares pgTAP coverage for atomic rollback, retry identity, payload conflict rejection, database-assigned numbering, direct-insert denial, and Owner/Editor/Reviewer authorization. It has not been executed. `frontend/src/services/reviewSubmission.integration.test.ts` contains an opt-in concurrency test for two simultaneous submissions against one disposable local draft; it is skipped unless explicit local-only environment values are supplied and refuses a non-local hostname. A real concurrent database run is still required to verify revision locking and request-key collision behavior.

## Test and deployment gate

No local database test run is recorded because Docker is unavailable and no alternate PostgreSQL/Supabase runtime is present. Do not claim tests pass from static inspection. Required order: review SQL; run `supabase start` and `supabase test db` on a disposable local environment (or approved isolated CI); confirm initial migration is recognized and no baseline replay is planned; inspect catalog verification output; manually exercise all roles and tenants; then obtain explicit owner authorization before any remote migration push. Never use `supabase migration repair` to resolve a version mismatch without a separate reviewed recovery plan.
