# Supabase Auth and deployment guide

This guide describes the checked-in behavior and the settings the project owner must configure. It contains placeholders only. Do not put service-role keys, database passwords, or provider secrets in the browser or GitHub Pages variables.

## Current authentication behavior

`frontend/src/components/SupabaseApp.tsx` calls Supabase email/password `signUp` and `signInWithPassword`, restores a session with `getSession`, subscribes to `onAuthStateChange`, and signs out. Signup does not pass an explicit `emailRedirectTo`; confirmation therefore uses the Supabase Site URL default. The Supabase JS client handles browser session persistence and refresh using library defaults. There is no password-reset request form, recovery route/flow, explicit session-expiry UX, invitation UI, or Auth callback route. Keep confirmation enabled for production, but test that the current static app successfully returns to the intended URL and consumes the session.

There is one account system for both role-specific entry contexts; choosing “Content review” or “Approved sources” is not authorization. Workspace roles and database policies must decide access. Current bootstrap selects the first membership silently and does not expose workspace/member administration.

## Dashboard setup (manual owner action)

For each environment, open the correct Supabase project and configure **Authentication → URL Configuration**:

1. **Site URL:** set to that environment’s exact application origin/root. For local development this is `http://localhost:5173/`. For production, copy the deployed URL from GitHub Pages; do not guess the repository owner, custom domain, or project URL. If the app is deployed under a repository path, verify the actual URL shown by the deployment before setting it.
2. **Redirect URLs:** allow the exact local app URL `http://localhost:5173/**` (or narrower exact route if confirmed) and the exact production Pages URL/path. Add separate staging/preview URLs only when intentionally used; avoid broad wildcards. The current code does not set `redirectTo`, so Site URL is the operative default today. If a recovery/confirmation route is later added, explicitly allow its exact route and pass `emailRedirectTo` / `redirectTo` from the app.
3. In **Authentication → Sign In / Providers → Email**, enable email/password sign-in and email confirmations for production. Verify the confirmation template and sender configuration. Test signup in a clean browser; the app currently only displays a “check email” style state when signup returns no session. Email delivery, sender domain, SPF/DKIM, rate limits, and template behavior require live configuration and testing.
4. Keep other providers disabled unless product-approved and individually configured. Do not create a public signup pathway into any shared customer/demo workspace without an invitation/tenant policy.
5. In **Authentication → Sessions**, use the provider’s default access-token expiry (normally one hour) unless a documented risk review says otherwise. Do not shorten it before the app has tested expiry/re-auth handling. Inactivity/max-session limits are a product/security decision; configure only with a tested user recovery path. Session persistence currently follows Supabase JS client defaults; the app does not provide custom expiry controls.
6. For password recovery, the product needs UI to request a reset, an allowed recovery redirect, and a handler/state for the recovered session and password update. These do not currently exist; configuring a dashboard redirect alone does not complete the feature. Do not advertise password recovery as supported until the full flow is implemented and tested.

Supabase’s official guidance: [URL and redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls), [password-based Auth](https://supabase.com/docs/guides/auth/passwords), and [session configuration](https://supabase.com/docs/guides/auth/sessions).

## Local and production environment values

`frontend/.env.example` is safe and contains placeholders only:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

For local browser development, copy this file to `frontend/.env` and replace only with the local Supabase URL and publishable key printed by the local CLI. `.env` is ignored by Git. Do not use a production URL for local test data by default. The repo’s current `supabase/config.toml` only identifies `project_id = "veritybrand"`; it does not configure Auth redirect URLs or prove a local stack is running.

For GitHub Pages, add repository **Actions variables** (not secrets) named exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, with the intended environment’s public project URL and publishable key. `.github/workflows/deploy-pages.yml` checks both are nonempty and injects them at build time. The publishable key will appear in built JavaScript and is designed to be public. Never use `service_role`, secret API keys, database credentials, or model-provider keys in `VITE_*` or Pages variables. Privileged server credentials belong only in server-side secret storage.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are also the only Supabase variables currently read by `frontend/src/services/supabase.ts`. The workflow deploys on a push to `main` or manual dispatch; this guide does not authorize a deployment.

## Staging and release procedure

1. Create/identify separate local, staging, production, and (if needed) demo Supabase projects. Keep customer data out of demo/staging.
2. Set the correct URL and publishable key for the target build. Confirm no privileged credential is present in repository files or frontend build output.
3. Configure exact Auth Site URL/Redirect URLs and email confirmation settings for that environment; test signup, confirmation, sign-in, sign-out, refresh, and session expiry.
4. Review pending migration versions and SQL against the target schema. The reported live initial version is `20261110173550`; do not replay the baseline. Apply pending versions in order only after the owner approves the remote operation.
5. Run database pgTAP tests on a disposable local/staging database, then manually test a fresh anonymous browser, Owner, Editor, authorized Reviewer, unauthorized Reviewer, and two separate workspaces.
6. Verify sample remains usable without login, authenticated records remain private, and the final approval ties to the exact checked revision. Verify server-side analysis is not claimed or enabled: it is not integrated yet.
7. Use GitHub Pages workflow only after repository variables and the target Supabase environment are verified. Inspect Actions build output and the published URL; then retest the published app.
8. Record who approved each migration/deploy and the observed test result. This repository does not confirm live Auth, Pages variables, database policies, email delivery, backups, or deployment health.

## Public judge demo account requirement

The Round 3 judge link must show a dedicated demo account's email and password directly on the website, with a clear way to use the credentials. These are intentionally public demo credentials, not secrets. Provision the account only in a separate demo Supabase project and restrict it to synthetic judge data and the minimum role/permissions needed to try the submitted workflow. Never reuse a team member's account, customer workspace, development/production account, service-role key, or privileged provider credential.

Before publishing the credentials, verify sign-in and the full judge journey in a clean browser, confirm RLS prevents access to all non-demo workspaces, and establish a safe reset/recovery process for shared edits plus appropriate rate limiting. If those controls or a working demo account are not ready, do not display placeholder or fabricated credentials; record the judge-account requirement as unfinished until the isolated account is provisioned and verified.

## Runtime and test limitation

The project owner reports Docker Desktop is unavailable. Prior local checks found no usable Docker engine pipe, no WSL access, and no local `psql`/`pg_ctl`; do not keep retrying Docker. Supabase CLI `test db` requires a running local Supabase/Postgres stack, so no database assertions have been represented as passing. Use an approved disposable PostgreSQL/Supabase CI runner or staging project only after explicitly provisioning and authorizing it; do not use the production/live project for tests. See [database review](supabase-database-review.md) for static findings and the exact verification steps.
