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
- Finding-level review actions, documented exceptions, revision and recheck history, and explicit human sign-off. Browser-local decisions stay in the current browser; cloud persistence depends on a configured and deployed Supabase project.
- Responsive layouts, reduced-motion support, keyboard focus styles, and local activity history.

## Prototype boundaries

The app has a browser-local path and an optional Supabase path. Browser-local records remain in the current browser. When configured and deployed, cloud review submissions use an authenticated Edge Function that loads the saved draft and current approved source versions, runs deterministic TypeScript checks, and submits signed provenance. This is not an LLM or a guarantee of truth. Repository migrations and Edge code do not prove a live project is configured, deployed, or security-tested. Unmatched or ambiguous copy remains for human review.

Campaign image upload runs English OCR locally in the browser for PNG, JPG, and WebP. People inspect the image and confirm extracted text before using it in a draft. The image itself is not persisted; OCR is not visual interpretation or claim verification. PDF, DOCX, video, and audio ingestion are not available. The separate Python analyzer is not connected to the web app.

For a public judge build, optional `VITE_JUDGE_DEMO_EMAIL` and `VITE_JUDGE_DEMO_PASSWORD` values show the demo credentials and enable a one-click sign-in on the auth screen. These values are public in the built site. Configure them only after provisioning and testing a limited account in a separate demo Supabase project; never use team, customer, production, or privileged credentials. Keep both unset to hide the demo login panel.

## Stack

React 19, TypeScript, and Vite. Styling uses local system font stacks and inline SVG icons so the preview does not depend on external font or icon downloads.
