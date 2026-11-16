# Trusted Analysis and Source Versioning Design

## Intent

Move authenticated cloud review analysis to a trusted server path and retain immutable source versions for every new review. Keep public Daybreak and browser-local review behavior unchanged, preserve old history and approvals, and make provenance explicit.

## Goals

- Add append-only source version rows created for source creation, edits, and deactivation.
- Bind each new review to the active source versions considered, and each finding to the versions it cites.
- Keep Owner-only source management and the current Owner/Editor submission and Reviewer decision boundaries.
- Add an authenticated Edge Function that loads the authoritative draft and active source versions, runs the existing deterministic analyzer, validates its results, and submits through the atomic review path.
- Ensure only a valid Edge-generated signature can mark a review `server_analyzed`; browser-supplied findings remain explicitly `browser_unverified`.
- Keep Daybreak browser-local and maintain browser-local analysis.

## Non-goals and constraints

- No UI, CSS, copy, layout, or animation changes.
- No role or permission redesign, live migration, deployment, commit, or push.
- No changes to existing approvals or reinterpretation of legacy reviews.
- No new analysis rules or model; the same deterministic TypeScript analyzer is shared by local/browser and Edge paths.

## Approach

Use additive database migrations. A source-version trigger snapshots the mutable current source row into an append-only table and advances its current-version pointer. Removal becomes an inactive version, while existing review/source snapshots remain untouched. New join tables connect reviews to all source versions in their analysis corpus and findings to cited versions. RLS allows workspace members to read immutable versions; authenticated clients receive no version mutation grants.

Extract the current browser analyzer into a pure shared module and call that same code from the Edge Function. The Edge Function verifies the user JWT, checks Owner/Editor membership, reads the persisted draft and active current source versions using the caller-scoped client, then signs and submits the generated result. A service-role-only database signer keeps its signing secret in a private schema; the trusted `SECURITY INVOKER` submission wrapper verifies the signature before calling the existing atomic RPC. This prevents browser clients from assigning trusted provenance while keeping the write path in the authenticated user's RLS context.

## Backward compatibility

- Existing review rows, JSON snapshots, and final approvals are not rewritten. Existing source rows are backfilled as version 1 without changing their data.
- Existing browser-local and Daybreak analysis continue to call the shared deterministic analyzer locally.
- Existing direct atomic RPC submissions remain labeled `browser_unverified`; only the verified Edge path produces `server_analyzed` records.
- Cloud source removal becomes soft deactivation so prior versions and review links remain available.

## Review focus

- Concurrent edits to one source must allocate distinct versions under its parent-row lock.
- Inactive sources must not be selected for new analysis, but historical version links must remain readable.
- Cross-workspace or nonexistent source-version IDs must fail through composite foreign keys.
- A changed request cannot reuse a server-analysis signature or idempotency ID for a different draft/source payload.
- Browser-supplied analysis cannot become `server_analyzed` without a valid service-only HMAC.
- Every output status and count must match the shared analyzer, including invalid/future/expired source dates.

