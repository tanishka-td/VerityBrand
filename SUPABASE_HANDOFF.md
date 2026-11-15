# Supabase implementation handoff

## What is already in the repository

- `frontend/src/services/supabase.ts` creates a browser client only when the public project URL and publishable key are set.
- `frontend/src/components/SupabaseApp.tsx` contains account, workspace, source, review, decision, and approval flows.
- `supabase/migrations/20261110120000_initial_veritybrand_schema.sql` defines the initial tables, grants, RLS policies, and role helpers.
- `frontend/.env.example` contains safe placeholders. No live project credentials are committed.
- `analysis/analyzer.py` is separate from the web app; the frontend checker does not call it.

These files do not prove that a Supabase project is deployed or that its policies have been tested. Confirm live state with the project owner before enabling real data.

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
