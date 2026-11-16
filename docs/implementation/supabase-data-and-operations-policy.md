# VerityBrand data and operations decisions

This document records what the repository currently supports, the product decisions already supplied by the owner, and operational choices that still need approval. A schema or recommendation is not evidence that a live service has been configured.

## Trusted review operations update (2026-11-17)

Cloud review checks use the authenticated `submit-review` Edge Function. It loads persisted draft text and current immutable approved-source versions under the user's authorization context and computes findings server-side. The browser sends only draft/workspace/request context and expected source-version IDs; browser-local Daybreak/demo analysis remains available.

The Edge Function uses a user-scoped Supabase client for reads and the final `SECURITY INVOKER` transaction. Its service-role client is used only to invoke the database signer and must be configured as an Edge secret. Never place the secret/service-role key in frontend environment variables or browser code. New server-computed reviews are labeled `server_analyzed`. The compatible direct RPC is still labeled `browser_unverified`, and older records stay `legacy_unverified`; neither label represents final human approval.

Before production use, apply both additive migrations in order to a reviewed target, deploy the Edge Function and secrets, execute pgTAP and Edge tests on a disposable local Supabase instance, inspect source links, and confirm backups and recovery procedures. No live migration or function deployment was performed as part of this change.

## Customer, workspace, and roles

**Current repository facts:** the initial schema has `public.workspaces` and `public.workspace_members`, with one `owner`, `editor`, or `reviewer` role per user per workspace (`supabase/migrations/20261110173550_initial_veritybrand_schema.sql`). Membership is unique by `(workspace_id, user_id)`. The current browser bootstrap in `frontend/src/components/SupabaseApp.tsx` silently chooses the first membership, or creates a single “My brand” workspace for a user with none. There is no customer/organization table, invite flow, workspace switcher, or member administration UI.

**Owner decisions for Round 3:** Owner administers workspace and members, manages approved sources, drafts, analysis, review decisions, and final approval. Editor creates/edits drafts and analyzes; can view sources/findings and submit review requests; cannot manage sources or approve finally. Reviewer reads sources/findings and records review decisions/revision requests; final approval requires an Owner-set authorization. Approved-source writes are Owner-only, reads remain available to workspace members. These decisions are enforced only to the extent of the local migrations; see [database review](supabase-database-review.md).

**Requires business approval before customer launch:** initial customer type, whether a workspace means one brand/team or an organization with multiple brands, expected team size, billing/customer boundary, whether one person can hold multiple roles, and whether a distinct steward role is ever needed. The current schema gives each person one role per workspace and has no role-combination mechanism. Preserve that behavior until a product decision and matching migration/tests exist.

## Workspace lifecycle and data model

**Implemented in repository:** workspaces, memberships, approved source text, drafts, draft revisions, review snapshots, findings, reviewer decisions, and final approvals. Several relationships constrain records to the same workspace; workspace deletion cascades for top-level data, while revision/review evidence relationships use `RESTRICT`. There is no implemented archive, transfer, export, tenant offboarding, retention job, or deletion request workflow.

Phase 1 repository implementation adds an atomic authenticated `submit_review` RPC: revision, review, and findings are inserted in one transaction; a parent-draft lock allocates revision numbers; and a database uniqueness constraint plus SHA-256 payload comparison supports idempotent request retries. This migration is pending and has not been run against a local or live database. New reviews are marked `browser_unverified`: the browser still supplies analysis and findings, and the database stores them atomically without independently validating their evidentiary correctness. Do not treat the RPC as a trusted analysis engine or as production evidence provenance.

A follow-up additive migration gates authenticated INSERTs to these three tables with restrictive RLS policies that allow the `submit_review` invoker function context. The existing role policies and grants remain in place, preserving Owner/Editor submission via RPC and Reviewer denial while blocking supported cloud clients from using the old direct table-write path. Retry request IDs and SHA-256 payload fingerprints are stored in tab-scoped `sessionStorage`; submission content itself is not stored there. These database policies and the retry recovery path require local runtime integration testing before deployment.

**Recommended lifecycle (requires owner/business approval):** create workspace; assign an Owner; add invited members with least privilege; suspend access immediately on offboarding; export data before closure if requested; then delete/anonymize workspace records according to a published retention schedule and legal holds. Decide who may transfer ownership and what happens if the last Owner leaves. Do not implement irreversible deletion behavior until retention and contractual requirements are approved.

Migration `20261117100000_immutable_source_versions.sql` adds append-only source versions and binds new review snapshots and finding evidence to exact source version IDs. It preserves historical JSON snapshots and approvals. The separate `20261117110000_trusted_review_submission.sql` adds signed trusted provenance and validates/locks the current source set in the review transaction. These changes exist in the repository only; they remain unverified until applied and tested in a disposable local Supabase stack.

## Supported content and languages

**Current code facts:** `frontend/src/components/ReviewWorkspace.tsx` imports plain text files with `.txt` or `.md` extensions, capped at 2 MB, and reads them as browser text. Text can also be entered directly. No PDF, DOCX, image, video, audio, or OCR ingestion is implemented. `analysis/analyzer.py` and the browser checker use English-oriented number, offer-date, and superlative patterns. The repository does not define or test a supported-language list.

**Safe product statement today:** text entry plus `.txt`/`.md` import for the existing interface; no language-coverage promise. This does not mean every statement in those files is understood. PDF/DOCX and other modalities are later plan phases, after extraction offsets, evidence citations, privacy controls, and safe failure are built.

**Requires product approval:** whether English is the only supported launch language, whether Markdown formatting is retained or flattened, file-size and encoding rules, and any future formats/languages. Do not describe PDF/DOCX or multilingual review as available.

## Approved-source rules

Round 3 decision: only Owners may insert, update, or delete source rows; all workspace members may read them. Source content remains in `public.approved_sources`, with `owner_label`, `kind`, `valid_from`, and `valid_through`; the additive source-version migration snapshots every edit/deactivation. There are still no formal approval actor/time fields, and date validity alone does not prove a source is substantively approved/current. Source stewardship remains an Owner permission, not a separate role.

Before treating “approved” as a production evidence guarantee, define source entry review, required metadata, effective/expiry behavior, revocation policy, and owner of record. Version history and exact review source links are implemented additively in the pending migration but have not been applied or runtime tested.

## Retention, export, deletion, backup, and offboarding

These are operational recommendations, not implemented controls. The business and counsel must approve retention periods, export format, deletion deadline, legal hold behavior, backup retention, and customer notification terms before real customer content is stored.

| Area | Current implementation | Recommended control / approval needed |
|---|---|---|
| Retention | No scheduled retention/deletion policy or timestamps for purge state. | Approve schedule by data class (drafts, source material, audit/approval records, auth account, backups); implement scheduled deletion only after legal review. |
| Export | No user/workspace export feature. | Provide a documented, authenticated export of workspace, revisions, sources, findings, decisions, approvals, and relevant metadata; test completeness and access isolation. |
| Deletion | Workspace/member cascades exist in parts of the schema, but no verified end-user deletion workflow; related `RESTRICT` relationships can prevent deletion. | Build an Owner-controlled closure and user deletion process, record request/status, resolve retention/legal holds, and verify backups expire on schedule. Never promise immediate erasure from backups without an implemented process. |
| Backup/recovery | No repository evidence of a live backup schedule or restore test. | Configure provider backups/PITR appropriate to the chosen plan, define RPO/RTO, protect access, and periodically restore into an isolated environment. Verify with the project owner; this repo cannot verify Dashboard settings. |
| Offboarding | A member can leave through a row policy, but there is no UI/process for revoking sessions, transferring ownership, or reviewing authored records. | Remove membership promptly, revoke active Auth sessions when warranted, rotate any shared credentials, transfer ownership before removing the last Owner, and retain audit records as approved. |
| Incident response | No operational incident plan or monitoring configuration is present. | Assign an incident owner and escalation route; preserve logs, contain access, assess tenant exposure, notify affected parties/regulators under counsel-approved deadlines, rotate credentials, and document remediation. |
| Test accounts | Local pgTAP fixtures use synthetic `.invalid` addresses. No approved hosted judge account or credential lifecycle exists. | Round 3 requires the website to display a dedicated judge demo account's login credentials. Treat them as public: isolate the account in a separate demo project, limit its role and data to synthetic judge content, test RLS, rate-limit access, and reset shared changes. Inventory account ownership, expiry, and cleanup. Never use customer content or privileged credentials. |

## Demo boundary

Keep the public Daybreak Coffee sample fictional, local/browser-contained, deterministic, and available without authentication. Do not allow public anonymous writes to shared workspace data. The judge sign-in path must also provide the demo account credentials directly on the website; this makes those credentials public, so use only an isolated demo Supabase project, constrained permissions, synthetic data, tested RLS, and a reset path for shared edits. The public static frontend may contain only the project URL and publishable key; those values are public and RLS—not key secrecy—protects data. Never expose privileged credentials. The current repository alone does not prove that a demo account/project or its controls are configured.
