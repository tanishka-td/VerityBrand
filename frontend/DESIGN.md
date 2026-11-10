# VerityBrand · the paper trail

## Concept card

**Idea:** VerityBrand connects each campaign claim to the approved source and human decision that can support it.
**Metaphor:** The print proof: a marked-up draft, a source slip, and a sign-off at the edge of the page.
**Signature moment:** Selecting a finding threads its exact excerpt into a labelled proof card beside the approved evidence and next action.
**Emotion:** Curious, precise, and calm enough to make a publishing decision.
**Motion verb:** Pull and settle. Findings slide into the proof margin; controls move a few pixels on hover; no movement is needed to understand the review.
**Screenshot:** A campaign draft with its mismatched offer joined visually to a dated source, owner, recommended action, and review state.
**Entry:** Visitors choose a creator/reviewer or brand steward work area, with the Daybreak sample review offered as a clearly marked one-click trial.

## Art direction

- Ground `#F4EFE8`, paper `#FFFDF9`, ink `#271E21`, wine `#45192D`, proof orange `#D95A3D`, and approval green `#2C725E`.
- Georgia gives the review copy the feel of a marked proof. Aptos/Segoe UI keeps the controls familiar. Cascadia Code/Consolas is reserved for source IDs and small process labels. Fonts are local system stacks; the prototype has no font download dependency.
- A dark wine navigation ribbon frames a warm paper work surface. The review desk gets the widest area. Its claim list and evidence card share a column to keep context close.
- Layered paper surfaces, ruled grids, soft edge shadows, and a concentric proof-stamp motif give the blank brand workspace a distinct identity without obscuring the review.
- Respect reduced-motion preferences. Review feedback and focus states remain visible without animation.

## Product boundaries for this prototype

- New visitors choose between the creator/reviewer desk and brand steward source cabinet. Both work areas share a private browser workspace, and the Daybreak Coffee sample opens with its mismatch already checked.
- Visitors can create and rename multiple workspaces, add/edit/remove approved references, import `.txt` / `.md` text, and check their own copy.
- The built-in general checker is a conservative local heuristic. It looks for selected claim cues, compares text and numbers with approved references, and marks unclear matches for a person. It is not a trained AI model, does not inspect images or video, and cannot establish that an unmatched claim is true.
- Owner routing and owner decisions are simulated in the browser so one person can complete the workflow. Workspaces, drafts, and activity stay in local browser storage; content is not sent to a server unless a review API is configured.
- Multi-user accounts, shared reviewer routing, server-side storage, full source ingestion, and multimodal AI analysis require connected services beyond this frontend prototype.

## Stack

React 19, TypeScript, and Vite. The prototype runs without an account or server setup.
