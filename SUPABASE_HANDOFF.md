# Supabase implementation handoff

## What is already in the repository

- `frontend/src/services/supabase.ts` creates a browser client only when the public project URL and publishable key are set.
- `frontend/src/components/SupabaseApp.tsx` contains account, workspace, source, review, decision, and approval flows.
- `supabase/migrations/20261110173550_initial_veritybrand_schema.sql` is the local baseline for the live initial migration version reported by the project owner. Its SQL body is preserved; do not replay it against the live database.
- `supabase/migrations/20261115170000_enforce_owner_source_and_reviewer_approval_permissions.sql` makes source writes Owner-only and adds Owner-managed Reviewer final-approval authorization.
- `supabase/migrations/20261115180000_enforce_final_approval_integrity.sql` adds the final-approval state integrity trigger and must follow the permission migration.
- `supabase/tests/role_permissions.test.sql` contains pgTAP role-policy checks; `supabase/verify/round3_role_permissions.sql` contains read-only catalog/data checks.
- `frontend/.env.example` contains safe placeholders. No live project credentials are committed.
- `analysis/analyzer.py` is separate from the web app; the frontend checker does not call it.

These files do not prove that a Supabase project is deployed or that its policies have been tested. Confirm live state with the project owner before enabling real data.

## Round 3 database migration order

The live project records its initial schema as `20261110173550`, while the repository previously named the same baseline `20261110120000`. The repository baseline file has been renamed to `20261110173550_initial_veritybrand_schema.sql` without changing its SQL. This aligns the local migration version with the reported live version; it does not alter remote migration history. Do not apply the former `20261110120000` version or replay the initial schema. Verify the live policies and grants before pushing pending migrations.

Apply pending migrations in version order:

1. `20261115170000_enforce_owner_source_and_reviewer_approval_permissions.sql`
2. `20261115180000_enforce_final_approval_integrity.sql`

The first migration changes authorization: only Owners may insert, update, or delete approved sources; members retain source reads; Owners may always approve; Reviewers need `workspace_members.can_final_approve = true`; Editors cannot approve. Owners grant or revoke that flag through the authenticated database path. The second migration validates approval state and exceptions; it does not replace the RLS authorization policy.

The local role test suite assumes both migrations are applied to a disposable local/test database. The Supabase CLI is not bundled in this repository, and no live migration has been run as part of this preparation.

Suggested commands for the project owner to run after reviewing the SQL:

```sh
supabase start
supabase test db
supabase migration list --linked
supabase db push --linked
```

The first two commands use the local Supabase stack. The last command applies pending migrations to the linked remote project and should be run only after reviewing the migration list and SQL. Do not run `supabase migration repair` for this version alignment.

## Safe setup checklist

1. Use a dedicated demo Supabase project for public judges, separate from any development or production project.
2. Apply the migration only after reviewing it against the target project. Verify grants and every RLS policy, especially workspace bootstrap and membership changes.
3. Add database tests that prove anonymous access is denied and that users cannot read, update, delete, or cross-link another workspace's records. Test every operation for owner, editor, and reviewer roles.
4. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the frontend host. The publishable key is public configuration and must never be treated as an authorization boundary.
5. Keep service-role keys and model-provider secrets in server-side secret management only. Never add them to frontend code, Vite variables, browser storage, committed `.env` files, or screenshots.
6. Use synthetic demo data only. Keep the Daybreak public sample read-only or browser-local, and provide dedicated limited demo accounts if judges must inspect authenticated views.
7. Open the deployed site in a fresh browser. Try the anonymous sample and both role-specific entry routes; verify persistence, access denial, and exact-revision human approval.
8. Do not route analysis to a generic API variable until an authenticated endpoint exists and its schema, role checks, evidence contract, limits, and logs have been reviewed. The Python analyzer is currently not integrated.

For the complete implementation and judge plan, see [market-readiness-plan.md](docs/implementation/market-readiness-plan.md). For current Supabase documentation, use the official [Auth](https://supabase.com/docs/guides/auth), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [Edge Functions](https://supabase.com/docs/guides/functions) guides.

## Round 3 owner handoff status

This section records local preparation only. It does not mean the live Supabase project, GitHub Pages deployment, email delivery, backups, or production policies have been checked.

| Responsibility | Status | Evidence / remaining action |
|---|---|---|
| Reconcile local baseline filename to reported live migration version without replay | COMPLETE locally | The baseline is named `20261110173550_initial_veritybrand_schema.sql`; do not replay it. Confirm the linked migration list manually before pushing. |
| Owner-only approved-source INSERT/UPDATE/DELETE, member SELECT | COMPLETE in prepared SQL; runtime verification pending | Permission migration and role tests are local. Verify target has no additional permissive policies. |
| Owner-managed reviewer final approval authorization | COMPLETE in prepared SQL; runtime verification pending | `can_final_approve` defaults false, reviewer-only constraint, Owner-only update policy, Owner always allowed, authorized Reviewer only. |
| Final-approval integrity trigger sequencing | COMPLETE locally; runtime verification pending | Apply `170000` permission migration before `180000` integrity migration. |
| Static migration/RLS/test review and verification SQL | COMPLETE locally | See [database review](docs/implementation/supabase-database-review.md). The pgTAP suite is not a complete production RLS suite. |
| Live policy/grant/migration-history confirmation | REQUIRES MY ACTION | Run the read-only catalog checks and migration list from a trusted environment. No live database was queried by this preparation. |
| Supabase Auth Dashboard settings, email provider/delivery, recovery and redirect verification | REQUIRES MY ACTION / application gap | Follow [Auth and deployment guide](docs/implementation/supabase-auth-and-deployment.md). The app lacks a password recovery flow and explicit callback handler. |
| GitHub Pages public config values | REQUIRES MY ACTION | Set repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the intended project only. Never use a privileged key. |
| Retention, export/deletion, offboarding, backup, incident, test-account decisions | REQUIRES MY ACTION | Review [data and operations policy](docs/implementation/supabase-data-and-operations-policy.md) and obtain business/legal approval for the items marked pending. No operational process is represented as implemented. |
| Local pgTAP execution | BLOCKED | Docker Desktop is unavailable and the machine had no usable Docker engine/WSL/local PostgreSQL runtime. Do not retry Docker repeatedly; run on a disposable supported runner or after local runtime is restored. |
| Remote migration apply, migration repair, deploy | REQUIRES EXPLICIT AUTHORIZATION | Not done. Do not run `supabase migration repair`. Only push after reviewing the linked list and obtaining approval for that remote change. |

## Exact manual actions before any remote deployment

1. In a trusted terminal, select the intended project and run `supabase migration list --linked`. Confirm `20261110173550` is applied and only `20261115170000` and `20261115180000` are pending. If not, stop; do not repair history or replay the baseline.
2. Against a disposable local/test project, run `supabase start` then `supabase test db`. Inspect test output and fix failures before proceeding. If Docker is unavailable, use only an explicitly approved isolated CI/staging database, never production.
3. Run the read-only SQL in `supabase/verify/round3_role_permissions.sql` against local/staging; inspect all returned policies and grants. Confirm no unknown permissive policy broadens writes.
4. Configure Auth Site URL, exact Redirect URLs, email confirmation and session settings per `docs/implementation/supabase-auth-and-deployment.md`; separately implement and test recovery UI before advertising recovery.
5. Approve customer/data lifecycle decisions in `docs/implementation/supabase-data-and-operations-policy.md`. Configure provider backups and prove a restore before real customer data.
6. Set only the project URL and publishable key as GitHub Actions repository variables. Check that the intended Pages URL and Supabase project are paired.
7. After explicit approval, apply pending migrations in chronological order; then verify role behavior and approval integrity in staging. Deployment is a separate authorized action and has not been performed.

Do not use `supabase db push --linked` until the migration list, SQL review, staging tests, and explicit authorization are complete. The initial schema must not be replayed. The local `supabase/.temp/` directory is generated CLI state and is ignored by Git.
