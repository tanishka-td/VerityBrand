# VerityBrand

VerityBrand is an early-access brand governance prototype. Start from separate entry points for creators and reviewers, or for brand stewards. Both work areas use the same private browser workspace. Daybreak Coffee is an optional, one-click sample review.

## Run the prototype

Use Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. Build the static bundle with `npm run build`; preview it with `npm run preview`.

## Start with your own brand

1. Choose **Review content** or **Manage approved sources** on the welcome screen.
2. Add approved wording for a product fact, offer, or guideline. Set an information owner and optional validity dates. You can paste text or import a `.txt` / `.md` reference under 2 MB.
3. In **Content review**, write or import copy and choose **Check against sources**.
4. Inspect each finding and its matched source. Clear matches can continue to human sign-off; conflicting values, stale sources, and unclear wording remain open for a person.
5. Edit or remove sources in the source cabinet, then recheck the draft against the current references.

Choose **Try the sample review** to open Daybreak Coffee with its claims already checked. The offer mismatch and its approved source are selected so the review can be explored immediately. The sidebar keeps a sample shortcut available from either work area.

## What is implemented

- Multiple browser-local brand workspaces with separate source libraries and drafts.
- Source cabinet for adding, editing, removing, importing, and tracking approved references and validity dates.
- General claim-cue checks that compare wording and numeric values with workspace references, explain mismatches, identify missing or ambiguous evidence, and link findings to source owners.
- An optional deterministic Daybreak Coffee example with a scripted offer review.
- Separate welcome entry points for creators/reviewers and brand stewards, with shared navigation and a one-click prechecked Daybreak example.
- Review queue, source evidence, simulated owner decisions, revision suggestions, human-only review for unrecognized copy, and explicit human sign-off.
- Responsive layouts, reduced-motion support, keyboard focus styles, and local activity history.

## Prototype boundaries

This is a local early-access prototype, not a hosted multi-user market service. Workspaces, drafts, findings, and decisions stay in the current browser's local storage; reviewer routing is simulated and no content is shared with a team or server unless an API is configured. The built-in general checker is a conservative heuristic, not a trained AI model or a guarantee of truth. It only detects selected claim cues and compares them with text sources; it does not inspect images or video. Unmatched or ambiguous copy remains for human review.

If a review API is connected, set `VITE_API_BASE_URL`. The adapter posts to `${VITE_API_BASE_URL}/api/reviews/analyze` with `content`, `brand_profile_id`, `brand_profile`, and `as_of`, and expects the result shape in `src/types.ts`.

## Stack

React 19, TypeScript, and Vite. Styling uses local system font stacks and inline SVG icons so the preview does not depend on external font or icon downloads.
