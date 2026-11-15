# VerityBrand

VerityBrand helps teams review campaign copy against approved brand sources. It explains what matched or needs attention and keeps the final publication decision with a person.

## Project map

- `frontend/` — React 19, TypeScript, and Vite web app. Includes creator/reviewer and brand-steward entry points, a guided Daybreak sample, browser-local mode, and an optional Supabase-backed workspace.
- `analysis/` — standalone, dependency-free Python claim analyzer and regression tests. It is not currently called by the web app.
- `supabase/migrations/` — initial shared-workspace schema, role policies, and Row Level Security rules. Review and test policies in a Supabase project before exposing real data.
- `docs/` — product and implementation plans.
- `.github/workflows/` — GitHub Pages static frontend deployment.

## Run the web app

Requires Node.js 20.19+ or 22.12+.

```powershell
cd frontend
npm ci
npm run dev
```

To make a production build, run `npm run build` from `frontend/`. See [frontend/README.md](frontend/README.md) for environment variables and current workflow boundaries.

## Run the analyzer checks

Requires Python 3.10+; there are no third-party packages.

```powershell
cd analysis
python -m unittest -v
```

The current checker is rule-based. It is not an LLM, does not inspect images/video, and should be treated as a review aid rather than a truth oracle.

## Product roadmap and judge access

See [docs/implementation/market-readiness-plan.md](docs/implementation/market-readiness-plan.md) for the staged implementation plan, handoff instructions, acceptance criteria, and a safe way to let judges try the product without exposing private customer data or privileged credentials.
