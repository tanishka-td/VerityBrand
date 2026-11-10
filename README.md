# VerityBrand

VerityBrand is a prototype for checking marketing copy against approved brand sources. Creators can review a draft and inspect evidence; brand stewards can maintain the approved sources used for checks. The Daybreak Coffee sample is available to anyone who wants to explore a preloaded example.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
cd frontend
npm ci
npm run dev
```

Open the local address printed by Vite. To create and preview the production build, run `npm run build` followed by `npm run preview` from `frontend/`.

## What's included

- `frontend/` — React, TypeScript, and Vite web prototype.
- `analysis part/` — dependency-free Python claim-checking component and its integration notes.

The browser prototype uses local browser storage and a conservative built-in checker. The Python analyzer is a separate component; it is not currently connected to the web interface. Final decisions remain with a human reviewer.

See [the frontend guide](frontend/README.md) for the user workflow and prototype boundaries, and [the analyzer guide](analysis%20part/README.md) for its input and output format.

## Publish a preview with GitHub Pages

The included GitHub Actions workflow builds the frontend and publishes it to GitHub Pages when changes are pushed to `main`.

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages** and set the publishing source to **GitHub Actions**.
3. Open **Actions** and wait for **Deploy VerityBrand to GitHub Pages** to finish.
4. Copy the live address shown in the successful deployment or under **Settings → Pages**.

The GitHub Pages address is created by GitHub after the first deployment; it cannot be known from this local folder. The site is a static prototype and stores work in each visitor's own browser.

## Supabase handoff

Supabase is not connected in this version. The web app remains a static frontend; the included Pages workflow publishes it. For the current state and the work needed to connect a Supabase backend, see [the Supabase deployment handoff](SUPABASE_HANDOFF.md).
