# VerityBrand frontend

This folder contains the React 19, TypeScript, and Vite application. The app can be explored in browser-local mode without a login or Supabase configuration. For the full product description, feature boundaries, repository map, and setup notes, see the [project README](../README.md).

## Requirements and setup

Use Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Vite prints the local preview address. Create and preview a production build with:

```sh
npm run build
npm run preview
```

## Main journeys

- **Try the Daybreak sample** opens a fictional, preloaded content review without sign-in.
- **Review content** opens the creator/reviewer workspace.
- **Manage approved sources** opens the brand-steward source cabinet.
- In local mode, workspace, draft, source, and review data are stored in the current browser. They are not shared across browsers or accounts.
- Text and Markdown files can be imported as source material or draft content. The app also previews PNG, JPG, and WebP images and extracts English text locally with OCR. Confirm extracted text before adding it to a draft; the image itself is not saved.

## Optional Supabase configuration

Copy `.env.example` to `.env.local` and set:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

The app also accepts optional public judge-account values:

```dotenv
VITE_JUDGE_DEMO_EMAIL=
VITE_JUDGE_DEMO_PASSWORD=
```

These values become visible in the built website. Only use them for a tested, isolated demo account with synthetic data; do not put team, customer, production, service-role, or other privileged credentials here.

The repository contains migrations and an authenticated `submit-review` Edge Function, but frontend configuration alone does not provision or verify a backend. Deploy and test migrations, RLS, authentication, and the function in an isolated Supabase project before relying on shared data. See the deployment and security documents under `../docs/implementation/`.

## Tests and build

```sh
npm test -- --run --pool=threads --maxWorkers=1 --configLoader native
npm run build -- --configLoader native
```

In some Windows environments the default Vite config loader hits a process-spawn permission error; `--configLoader native` avoids that issue. Supabase integration tests need project environment variables and are skipped otherwise.

## Implementation boundary

The browser review checker uses deterministic TypeScript rules and source matching. It is not an LLM. Image OCR extracts candidate text only; it does not interpret images or verify claims. The standalone Python analyzer is in `../analysis/` and is not connected to this frontend.
