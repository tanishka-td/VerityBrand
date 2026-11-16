-- Restrict authenticated table inserts to the SECURITY INVOKER submit_review RPC.
-- The function-local GUC is automatically restored when the RPC returns.

create policy draft_revisions_atomic_submission_only on public.draft_revisions
as restrictive for insert to authenticated
with check (
  current_setting('veritybrand.atomic_review_submission', true) = 'on'
);

create policy reviews_atomic_submission_only on public.reviews
as restrictive for insert to authenticated
with check (
  current_setting('veritybrand.atomic_review_submission', true) = 'on'
);

create policy findings_atomic_submission_only on public.findings
as restrictive for insert to authenticated
with check (
  current_setting('veritybrand.atomic_review_submission', true) = 'on'
);

alter function public.submit_review(uuid, uuid, uuid, text, jsonb, jsonb)
  set "veritybrand.atomic_review_submission" = 'on';
