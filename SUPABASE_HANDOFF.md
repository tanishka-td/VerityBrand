# Supabase deployment handoff

This note describes the current project state for the teammate setting up Supabase.

## Current state

- The React/Vite frontend is a static website. The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` publishes that website to GitHub Pages.
- Brand workspaces, sources, drafts, findings, and decisions are currently saved in the visitor's browser. There is no shared database, sign-in, or real reviewer routing yet.
- The frontend performs its claim checks in the browser. `analysis part/analyzer.py` is a separate Python component and is not connected to the website.
- No Supabase project configuration, database migrations, Edge Functions, or Supabase credentials are included in this repository.

## Keep the deployment roles clear

Use GitHub Pages (or another static web host) for the Vite frontend. Use Supabase for backend services such as Postgres, Auth, Storage, and Edge Functions. Supabase's GitHub deployment flow handles backend resources such as database migrations, Edge Functions, and declared Storage buckets; it does not publish this Vite frontend as the website. See [Supabase deployment](https://supabase.com/docs/guides/deployment).

## Before connecting the frontend to Supabase

1. Create or select the Supabase project and decide whether Round 2 will remain a browser-only prototype or use shared user data.
2. If adding shared data, define the workspace, approved-source, review, finding, and decision tables, then add Row Level Security policies before exposing them to the client.
3. Decide the identity and access model. The current UI has no authentication, so do not expose private team data through anonymous client access.
4. If analysis moves to an Edge Function, adapt `frontend/src/services/reviewApi.ts` to call the deployed function URL. Its current optional API integration calls `${VITE_API_BASE_URL}/api/reviews/analyze`, which is a generic HTTP API route; Supabase functions use a URL shaped like `https://<project-ref>.supabase.co/functions/v1/<function-name>`.
5. Keep privileged secrets, especially the Supabase service-role key, in server-side secrets only. Never put them in `VITE_*` variables or browser code. Only public client configuration belongs in frontend environment variables.
6. Add example variable names without real values to `.env.example`, set the actual values in the frontend host's environment settings, and verify the production build and access policies.

## Handoff checklist

- [ ] Supabase project created and teammate has access.
- [ ] Database schema and Row Level Security policies reviewed.
- [ ] Any Edge Function is deployed and its request/response contract matches the frontend.
- [ ] Frontend environment variables are configured only if the app integration is implemented.
- [ ] GitHub Pages remains enabled for the website, or an alternative static frontend host is selected.
- [ ] Production URL is opened in a fresh browser and the Daybreak sample workflow is checked.

For the current Supabase function deployment steps, see [Deploy Edge Functions](https://supabase.com/docs/guides/functions/deploy). For the frontend's current API contract, see [the frontend guide](frontend/README.md#prototype-boundaries).
