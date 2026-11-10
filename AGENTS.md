# VerityBrand project instructions

## Project architecture

- The frontend is a React 19, TypeScript, and Vite application in `frontend/`.
- The current application stores brand workspaces, approved sources, drafts, findings, decisions, approvals, and activity in browser state and `localStorage`. Treat this as the existing persistence behavior unless a task explicitly changes it.
- `analysis part/analyzer.py` is a separate, dependency-free Python claim analyzer. It is not currently connected to the frontend. Keep its profile and output contracts explicit when adding an integration.
- `.github/workflows/deploy-pages.yml` builds the frontend and deploys the static output to GitHub Pages.
- Supabase is not yet integrated. Do not assume that a handoff document or planned integration means database, authentication, or server functionality already exists.

## Development principles

- Preserve existing working functionality and user flows.
- Do not rewrite the application unnecessarily. Make focused changes that fit the existing architecture.
- Inspect the relevant existing components, services, types, and data flow before modifying them.
- Prefer reusable, maintainable components and clear service boundaries over duplicated logic.
- Keep frontend responsibilities separate from backend responsibilities. Do not put privileged server work or secrets in browser code.
- Follow the repository documentation as product-boundary guidance, but verify implementation claims against the code before relying on them.

## Product requirements

Changes to the product should preserve or deliberately account for these workflows and requirements:

- Users can maintain brand workspaces and their approved sources.
- Claim verification must be evidence-based: show the source supporting a finding, and do not infer that an unsupported claim is false.
- Findings use the classifications `supported`, `contradicted`, `outdated`, and `unverified`.
- Claims needing a person can go through exception-based human review; an exception decision must remain distinguishable from automated verification.
- Preserve revision history and make final human approval explicit. Automated checks alone must not silently approve a draft.
- Keep the Daybreak Coffee preloaded judge demo available and usable as a guided example.

## Security

- Never expose a Supabase service-role key or other privileged credential in frontend code, browser storage, or a `VITE_*` variable.
- Require and review Row Level Security (RLS) policies before exposing shared Supabase data to clients.
- Never commit credentials, secrets, or `.env` files. Use environment-specific secret management and commit only safe examples with placeholder values when needed.
- Keep public frontend configuration separate from privileged server-side secrets. Only values intended to be public may be included in the frontend build.

## Engineering workflow

- Use the Superpowers workflow for planning and implementation. For non-trivial work, clarify the design and plan before changing application code.
- Use the `systematic-debugging` skill when troubleshooting bugs, unexpected behavior, or failing checks.
- Use `verification-before-completion` before declaring a task complete. Run the relevant checks and report what was actually verified.
- Run the production frontend build after relevant frontend or build-configuration changes.
- Never claim a feature is implemented unless its behavior has been tested. Distinguish implementation from verification and state any untested paths.
- Keep changes scoped to the requested task and do not install dependencies unless the task requires it.

## Git and collaboration

- Work on the current development branch, `round2/veritybrand-development`, unless the user explicitly directs otherwise.
- Never push directly to `main`.
- Avoid destructive Git operations, including resetting, cleaning, or force-updating shared work.
- Inspect the working tree before editing and preserve uncommitted or teammate changes. Never overwrite teammates' work.
- Do not commit or push unless explicitly requested.
