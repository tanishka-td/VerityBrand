-- Initial shared-data schema for VerityBrand.
-- Apply only after reviewing the workspace membership and Auth setup.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null check (member_role in ('owner', 'editor', 'reviewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.approved_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  source_text text not null check (length(btrim(source_text)) > 0),
  owner_label text,
  kind text,
  valid_from date,
  valid_through date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_from is null or valid_through is null or valid_through >= valid_from),
  unique (id, workspace_id)
);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.draft_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  draft_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  content text not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (draft_id, revision_number),
  unique (id, workspace_id, draft_id),
  foreign key (draft_id, workspace_id)
    references public.drafts(id, workspace_id) on delete restrict
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  draft_id uuid not null,
  draft_revision_id uuid not null,
  review_date date not null default current_date,
  overall_status text not null check (overall_status in ('needs_human_review', 'ready_for_final_approval')),
  final_approval_required boolean not null default true,
  summary jsonb not null default '{"supported":0,"contradicted":0,"outdated":0,"unverified":0}'::jsonb
    check (jsonb_typeof(summary) = 'object'),
  sources_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources_snapshot) = 'array'),
  analysis_note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (id, workspace_id, draft_revision_id),
  foreign key (draft_id, workspace_id)
    references public.drafts(id, workspace_id) on delete restrict,
  foreign key (draft_revision_id, workspace_id, draft_id)
    references public.draft_revisions(id, workspace_id, draft_id) on delete restrict
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  review_id uuid not null,
  claim text not null,
  category text not null check (length(btrim(category)) > 0),
  status text not null check (status in ('supported', 'contradicted', 'outdated', 'unverified')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  explanation text not null,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  suggested_action text not null default '',
  reviewer_role text,
  reviewer_question text,
  requires_human_review boolean not null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (review_id, workspace_id)
    references public.reviews(id, workspace_id) on delete restrict
);

-- Decisions are append-only so reviewer actions and exception notes remain auditable.
create table public.reviewer_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  finding_id uuid not null,
  decision text not null check (decision in ('sent', 'confirmed', 'evidence_requested', 'exception_approved')),
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (decision <> 'exception_approved' or length(btrim(coalesce(note, ''))) > 0),
  foreign key (finding_id, workspace_id)
    references public.findings(id, workspace_id) on delete restrict
);

-- Approval always points to the exact reviewed revision; manual review remains distinct.
create table public.final_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  review_id uuid not null,
  draft_revision_id uuid not null,
  approval_mode text not null check (approval_mode in ('reviewed', 'manual_review')),
  coverage_acknowledged boolean not null default false,
  approver_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  unique (review_id),
  foreign key (review_id, workspace_id, draft_revision_id)
    references public.reviews(id, workspace_id, draft_revision_id) on delete restrict,
  check (approval_mode = 'manual_review' or coverage_acknowledged)
);

-- Create after workspace_members so PostgreSQL can validate these policy helpers.
-- SECURITY DEFINER avoids recursive RLS checks on workspace_members.
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_workspace_role(
  p_workspace_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
      and wm.member_role = any (p_roles)
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid, text[]) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

create index workspace_members_user_id_idx on public.workspace_members(user_id);
create index approved_sources_workspace_id_idx on public.approved_sources(workspace_id);
create index drafts_workspace_id_idx on public.drafts(workspace_id);
create index draft_revisions_workspace_draft_idx on public.draft_revisions(workspace_id, draft_id, revision_number desc);
create index reviews_workspace_created_at_idx on public.reviews(workspace_id, created_at desc);
create index findings_workspace_review_idx on public.findings(workspace_id, review_id);
create index reviewer_decisions_workspace_finding_idx on public.reviewer_decisions(workspace_id, finding_id, created_at desc);

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger approved_sources_set_updated_at
before update on public.approved_sources
for each row execute function public.set_updated_at();

create trigger drafts_set_updated_at
before update on public.drafts
for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.approved_sources enable row level security;
alter table public.drafts enable row level security;
alter table public.draft_revisions enable row level security;
alter table public.reviews enable row level security;
alter table public.findings enable row level security;
alter table public.reviewer_decisions enable row level security;
alter table public.final_approvals enable row level security;

-- A creator can read a new workspace long enough to add their initial owner membership.
create policy workspaces_select_member_or_creator on public.workspaces
for select to authenticated
using (public.is_workspace_member(id) or created_by = (select auth.uid()));

create policy workspaces_insert_self on public.workspaces
for insert to authenticated
with check (created_by = (select auth.uid()));

create policy workspaces_update_owner on public.workspaces
for update to authenticated
using (public.has_workspace_role(id, array['owner']))
with check (public.has_workspace_role(id, array['owner']));

create policy workspaces_delete_owner on public.workspaces
for delete to authenticated
using (public.has_workspace_role(id, array['owner']));

create policy workspace_members_select_member on public.workspace_members
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy workspace_members_insert_owner on public.workspace_members
for insert to authenticated
with check (
  (
    user_id = (select auth.uid())
    and member_role = 'owner'
    and exists (
      select 1 from public.workspaces as w
      where w.id = workspace_id and w.created_by = (select auth.uid())
    )
  )
  or (
    public.has_workspace_role(workspace_id, array['owner'])
    and member_role in ('editor', 'reviewer')
  )
);

create policy workspace_members_delete_by_role on public.workspace_members
for delete to authenticated
using (
  (public.has_workspace_role(workspace_id, array['owner']) and user_id <> (select auth.uid()))
  or (user_id = (select auth.uid()) and member_role <> 'owner')
);

create policy approved_sources_select_member on public.approved_sources
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy approved_sources_insert_editor on public.approved_sources
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = (select auth.uid())
);

create policy approved_sources_update_editor on public.approved_sources
for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

create policy approved_sources_delete_editor on public.approved_sources
for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'editor']));

create policy drafts_select_member on public.drafts
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy drafts_insert_editor on public.drafts
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = (select auth.uid())
);

create policy drafts_update_editor on public.drafts
for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

create policy drafts_delete_owner on public.drafts
for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner']));

create policy draft_revisions_select_member on public.draft_revisions
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy draft_revisions_insert_editor on public.draft_revisions
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = (select auth.uid())
);

create policy reviews_select_member on public.reviews
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy reviews_insert_editor on public.reviews
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner', 'editor'])
  and created_by = (select auth.uid())
);

create policy findings_select_member on public.findings
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy findings_insert_editor on public.findings
for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner', 'editor']));

create policy reviewer_decisions_select_member on public.reviewer_decisions
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy reviewer_decisions_insert_reviewer on public.reviewer_decisions
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner', 'reviewer'])
  and actor_id = (select auth.uid())
);

create policy final_approvals_select_member on public.final_approvals
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy final_approvals_insert_reviewer on public.final_approvals
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner', 'reviewer'])
  and approver_id = (select auth.uid())
);

-- Explicit grants keep anonymous clients out; RLS remains the row-level boundary.
revoke all on table
  public.workspaces,
  public.workspace_members,
  public.approved_sources,
  public.drafts,
  public.draft_revisions,
  public.reviews,
  public.findings,
  public.reviewer_decisions,
  public.final_approvals
from anon, authenticated;

grant select, insert, delete on table
  public.workspaces,
  public.workspace_members,
  public.approved_sources,
  public.drafts,
  public.draft_revisions,
  public.reviews,
  public.findings,
  public.reviewer_decisions,
  public.final_approvals
to authenticated;

-- Limit mutable columns so owners cannot rewrite workspace ownership or timestamps.
grant update (name) on table public.workspaces to authenticated;
grant update (title, source_text, owner_label, kind, valid_from, valid_through)
  on table public.approved_sources to authenticated;
grant update (content) on table public.drafts to authenticated;
