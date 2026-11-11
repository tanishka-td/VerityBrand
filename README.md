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

The current submission summary is [VerityBrand Round 2 Submission](output/pdf/VerityBrand_Round_2_Submission.pdf).


## Supabase handoff

Supabase is not connected in this version. The web app remains a static frontend; the included Pages workflow publishes it. For the current state and the work needed to connect a Supabase backend, see [the Supabase deployment handoff](SUPABASE_HANDOFF.md).
