# VerityBrand

VerityBrand is an early-access brand governance prototype. Start from separate entry points for creators/reviewers or brand stewards. Daybreak Coffee is an optional, one-click sample review. When Supabase is configured, the app also includes a shared account/workspace path; confirm deployment and policy state for the target environment before using real data.

## Run the prototype

Use Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Build the static bundle with `npm run build`; preview it with `npm run preview`.

## Start with your own brand

1. Choose **Review content** or **Manage approved sources** on the welcome screen.
2. Add approved wording for a product fact, offer, or guideline. Set an information owner and optional validity dates. You can paste text or import a `.txt` / `.md` reference under 2 MB.
3. In **Content review**, write or import copy and choose **Check against sources**.
4. Inspect each finding and its matched source. Clear matches can continue to human sign-off; conflicting values, stale sources, and unclear wording remain open for a person.
5. Edit or remove sources in the source cabinet, then recheck the draft against the current references.

Choose **Try the sample review** to open Daybreak Coffee with its claims already checked. The fictional launch campaign demonstrates a supported product fact, a conflicting offer, an expired seasonal claim, and an unsupported superlative. The four-outcome guide selects each finding so visitors can inspect its source and human next step. The sidebar keeps a sample shortcut available from either work area.

## What is implemented

- Multiple browser-local brand workspaces with separate source libraries and drafts.
- Source cabinet for adding, editing, removing, importing, and tracking approved references and validity dates.
- General claim-cue checks that compare wording and numeric values with workspace references, explain mismatches, identify missing or ambiguous evidence, and link findings to source owners.
- An optional deterministic Daybreak Coffee example with a scripted offer review.
- Separate welcome entry points for creators/reviewers and brand stewards, with shared navigation and a one-click prechecked Daybreak example.
- Review queue, source evidence, simulated owner decisions, revision suggestions, human-only review for unrecognized copy, and explicit human sign-off.
- Responsive layouts, reduced-motion support, keyboard focus styles, and local activity history.

## Prototype boundaries

The app has a browser-local path and an optional Supabase path. Browser-local records remain in the current browser. The Supabase UI and initial migration are present in the repository, but a live project must be separately configured, deployed, and security-tested. The built-in checker runs in the browser; it is a conservative heuristic, not a trained AI model or a guarantee of truth. It detects selected claim cues and compares them with text sources; it does not inspect images or video. The separate Python analyzer is not connected to the web app. Unmatched or ambiguous copy remains for human review.

The optional `VITE_API_BASE_URL` adapter expects `${VITE_API_BASE_URL}/api/reviews/analyze` and the response shape in `src/types.ts`. It is not a substitute for authentication, server-side membership checks, or evidence validation. Do not send privileged keys or trust source/role data supplied by the browser.

## Stack

React 19, TypeScript, and Vite. Styling uses local system font stacks and inline SVG icons so the preview does not depend on external font or icon downloads.
