begin;

-- Owner-controlled, workspace-scoped authorization for reviewers to record
-- final approvals. Existing members remain unauthorized by default.
alter table public.workspace_members
  add column can_final_approve boolean not null default false;

alter table public.workspace_members
  add constraint workspace_members_final_approval_reviewer_only
  check (not can_final_approve or member_role = 'reviewer');

-- Restrict membership updates to the authorization flag. RLS below makes
-- changing that flag an Owner-only action.
revoke update on table public.workspace_members
  from public, anon, authenticated;

grant update (can_final_approve)
  on table public.workspace_members
  to authenticated;

create policy workspace_members_update_final_approval_authorization_owner
on public.workspace_members
for update
to authenticated
using (
  public.has_workspace_role(workspace_id, array['owner'])
)
with check (
  public.has_workspace_role(workspace_id, array['owner'])
);

-- Editors retain member read access but may no longer manage approved sources.
drop policy if exists approved_sources_insert_editor
  on public.approved_sources;

create policy approved_sources_insert_owner
on public.approved_sources
for insert
to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner'])
  and created_by = (select auth.uid())
);

drop policy if exists approved_sources_update_editor
  on public.approved_sources;

create policy approved_sources_update_owner
on public.approved_sources
for update
to authenticated
using (
  public.has_workspace_role(workspace_id, array['owner'])
)
with check (
  public.has_workspace_role(workspace_id, array['owner'])
);

drop policy if exists approved_sources_delete_editor
  on public.approved_sources;

create policy approved_sources_delete_owner
on public.approved_sources
for delete
to authenticated
using (
  public.has_workspace_role(workspace_id, array['owner'])
);

-- Replace the permissive all-Reviewer policy. Owners do not need the extra
-- authorization flag; reviewers must have it set on their membership row.
drop policy if exists final_approvals_insert_reviewer
  on public.final_approvals;

create policy final_approvals_insert_owner_or_authorized_reviewer
on public.final_approvals
for insert
to authenticated
with check (
  approver_id = (select auth.uid())
  and (
    public.has_workspace_role(workspace_id, array['owner'])
    or (
      public.has_workspace_role(workspace_id, array['reviewer'])
      and exists (
        select 1
        from public.workspace_members as wm
        where wm.workspace_id = final_approvals.workspace_id
          and wm.user_id = (select auth.uid())
          and wm.member_role = 'reviewer'
          and wm.can_final_approve
      )
    )
  )
);

-- Keep approved_sources_select_member, findings/reviews read policies, and all
-- workspace-scoping helpers and relationships unchanged.

commit;
