-- Keep database approval rules aligned with the review states enforced by the UI.
-- This does not make browser-generated findings trustworthy; analysis must move
-- server-side before the product handles real customer content.

create or replace function public.validate_final_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_final_approval_required boolean;
begin
  select r.final_approval_required
    into v_final_approval_required
  from public.reviews as r
  where r.id = new.review_id
    and r.workspace_id = new.workspace_id
    and r.draft_revision_id = new.draft_revision_id;

  if coalesce(v_final_approval_required, false) is not true then
    raise exception 'Approval must reference a review that requires final approval';
  end if;

  if new.approval_mode = 'manual_review' then
    if exists (
      select 1 from public.findings as f
      where f.workspace_id = new.workspace_id and f.review_id = new.review_id
    ) then
      raise exception 'Manual review approval is only available when analysis produced no findings';
    end if;
  else
    if not exists (
      select 1 from public.findings as f
      where f.workspace_id = new.workspace_id and f.review_id = new.review_id
    ) then
      raise exception 'A reviewed approval requires at least one finding';
    end if;

    if exists (
      select 1 from public.findings as f
      where f.workspace_id = new.workspace_id
        and f.review_id = new.review_id
        and f.requires_human_review
        and not exists (
          select 1 from public.reviewer_decisions as d
          where d.workspace_id = f.workspace_id
            and d.finding_id = f.id
            and d.decision = 'exception_approved'
        )
    ) then
      raise exception 'Every finding that needs human review must have a documented exception before approval';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_final_approval() from public, anon, authenticated;

create trigger final_approvals_validate_before_insert
before insert on public.final_approvals
for each row execute function public.validate_final_approval();
