# VerityBrand

VerityBrand is a brand-governance prototype for checking campaign copy against approved brand sources. It explains the evidence behind a finding and keeps review and final approval with people.

## Try it locally

Requirements: Node.js 20.19+ or 22.12+.

```powershell
cd frontend
npm ci
npm run dev
```

Open the local address Vite prints. No Supabase account or environment variables are needed to try the browser-local product and Daybreak sample. To create a production build, run `npm run build`; to serve that build locally, run `npm run preview` from `frontend/`.

## Start with the sample

From the welcome page, choose **Try the Daybreak sample**. The fictional campaign is preloaded with four review outcomes:

- **Supported:** a product fact matched to the approved product source.
- **Contradicted:** a discount claim conflicts with the approved offer.
- **Outdated:** a seasonal claim relies on an expired source.
- **Unverified:** a superlative has no approved evidence.

Select each finding to inspect its explanation and source. The sample is optional; users can return to the welcome page and start a workspace of their own.

## Use your own brand

1. Choose **Review content** or **Manage approved sources**. These are separate entry points into the browser-local prototype.
2. Add approved source text in the source cabinet. Sources can include an owner and optional validity dates. Import `.txt` or `.md` files under 2 MB.
3. In content review, enter or import a draft and run **Check against sources**.
4. Inspect the claim findings, explanations, evidence, and suggested next steps. Missing evidence is marked **unverified**, not false.
5. Revise and recheck the draft as needed. Human review actions, exceptions, revision history, and final approval remain explicit steps.

Image upload accepts PNG, JPG, and WebP for local preview and English OCR. Review the extracted text and confirm it before adding it to the draft. OCR may misread an image and does not interpret visuals or verify claims. Uploaded images are not persisted.

## What works in this prototype

- Separate creator/reviewer and brand-steward entry views.
- Browser-local workspaces with separate drafts and source libraries.
- Add, edit, remove, and import approved sources with owner and validity-date information.
- Deterministic checks for selected factual, numeric, offer, date, and evidence-sensitive claim cues.
- Findings labelled **supported**, **contradicted**, **outdated**, or **unverified**, with explanations and source evidence when available.
- Draft revision and recheck, finding-level human review actions, documented exceptions, activity history, and explicit human approval.
- The guided Daybreak Coffee example, with one sample for each of the four finding outcomes.
- Local image preview and English OCR for PNG, JPG, and WebP, with human confirmation before extracted text enters a draft.
- Responsive interface, keyboard focus styles, and reduced-motion support.

The checker is deterministic and conservative; it is not an LLM and cannot establish truth. It evaluates text cues against the configured source text. The separate Python analyzer in `analysis/` is not connected to the web app.

## Optional Supabase path

The repository includes a Supabase authentication/workspace integration, migrations, and an authenticated `submit-review` Edge Function. The cloud submission path is designed to load saved drafts and current source versions, run deterministic checks, and persist signed review provenance. This code does not mean that a Supabase project is configured, deployed, or security-verified. Do not use it with real team or customer information until migrations, RLS policies, authentication, and the Edge Function have been deployed and tested in an isolated project.

To configure the frontend, copy `frontend/.env.example` to `frontend/.env.local` and set the project URL and publishable key for a project you control. Never put a service-role key or other privileged secret in a `VITE_*` variable. Optional `VITE_JUDGE_DEMO_EMAIL` and `VITE_JUDGE_DEMO_PASSWORD` values are included in the public browser build; set them only for a provisioned, isolated judge account containing synthetic data. Leave them blank to hide the demo sign-in helper.

Database setup and operational constraints are documented in [`docs/implementation/supabase-auth-and-deployment.md`](docs/implementation/supabase-auth-and-deployment.md) and [`docs/implementation/supabase-data-and-operations-policy.md`](docs/implementation/supabase-data-and-operations-policy.md). The detailed product roadmap and acceptance criteria are in [`docs/implementation/market-readiness-plan.md`](docs/implementation/market-readiness-plan.md).

## Tests

Install frontend dependencies with `npm ci` from `frontend/`. Run the frontend suite with:

```powershell
npm test -- --run --pool=threads --maxWorkers=1 --configLoader native
npm run build -- --configLoader native
```

The native config loader is a workaround for a Windows process-spawn restriction that can affect Vite's default loader in some environments. Supabase integration tests require project environment settings and are skipped without them.

Run the standalone Python analyzer tests from `analysis/`:

```powershell
python -m unittest -v
```

## Project structure

- `frontend/` — React, TypeScript, and Vite application.
- `analysis/` — standalone Python analyzer and tests; not wired into the web app.
- `supabase/` — database migrations, shared review logic, and Edge Functions.
- `docs/implementation/` — deployment notes, data/security policies, and product plan.
- `.github/workflows/` — GitHub Pages build and deployment workflow.

## Current limitations

- Live Supabase configuration, deployed Edge Functions, RLS behavior, and cross-account collaboration have not been verified as part of this repository handoff.
- Member invitations, reviewer assignment, and notifications are not complete collaboration flows.
- The analyzer uses deterministic text checks; it is not an LLM and does not prove a claim true.
- Image support is preview and OCR only. PDF, DOCX, video, audio, and visual claim analysis are not supported.
- Browser-local workspace data stays in that browser and is not shared with other users.
