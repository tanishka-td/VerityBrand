-- Persist cloud reviews through one transaction and make retries addressable.
-- Existing review rows are preserved and explicitly labeled as legacy,
-- browser-unverified analysis. New submissions remain browser-unverified until
-- analysis moves to a trusted server-side execution path.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to authenticated;
grant execute on function extensions.digest(bytea, text) to authenticated;

alter table public.reviews
  add column submission_request_id uuid,
  add column submission_payload_hash bytea,
  add column analysis_origin text not null default 'legacy_unverified'
    check (analysis_origin in ('legacy_unverified', 'browser_unverified'));

alter table public.reviews
  alter column analysis_origin set default 'browser_unverified';

alter table public.reviews
  add constraint reviews_submission_hash_sha256
  check (submission_payload_hash is null or octet_length(submission_payload_hash) = 32);

create unique index reviews_submission_request_id_unique
  on public.reviews (submission_request_id)
  where submission_request_id is not null;

alter table public.findings
  add column client_finding_key text;

create unique index findings_client_key_per_review_unique
  on public.findings (review_id, client_finding_key)
  where client_finding_key is not null;

-- A parent-row lock serializes all revision inserts for the same draft,
-- including inserts made outside the new RPC. The existing unique constraint
-- remains the final integrity backstop.
create or replace function public.allocate_draft_revision_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_next_revision integer;
begin
  perform 1
  from public.drafts as d
  where d.id = new.draft_id
    and d.workspace_id = new.workspace_id
  for update;

  if not found then
    raise exception 'Draft is unavailable for revision allocation'
      using errcode = '42501';
  end if;

  select coalesce(max(r.revision_number), 0) + 1
    into v_next_revision
  from public.draft_revisions as r
  where r.draft_id = new.draft_id
    and r.workspace_id = new.workspace_id;

  new.revision_number := v_next_revision;
  return new;
end;
$$;

revoke all on function public.allocate_draft_revision_number() from public, anon, authenticated;

create trigger draft_revisions_allocate_number
before insert on public.draft_revisions
for each row execute function public.allocate_draft_revision_number();

create or replace function public.submit_review(
  p_workspace_id uuid,
  p_draft_id uuid,
  p_request_id uuid,
  p_content text,
  p_sources_snapshot jsonb,
  p_analysis jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_payload_hash bytea;
  v_payload jsonb;
  v_saved_content text;
  v_existing_hash bytea;
  v_revision_id uuid;
  v_review_id uuid;
  v_revision_number integer;
  v_revision_created_at timestamptz;
  v_finding_ids jsonb;
  v_result jsonb;
  v_finding record;
  v_finding_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to submit a review'
      using errcode = '42501';
  end if;

  if not public.has_workspace_role(p_workspace_id, array['owner', 'editor']) then
    raise exception 'Only workspace Owners and Editors can submit reviews'
      using errcode = '42501';
  end if;

  if p_request_id is null or p_content is null then
    raise exception 'Request ID and draft content are required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_sources_snapshot) is distinct from 'array'
    or jsonb_typeof(p_analysis) is distinct from 'object'
    or jsonb_typeof(p_analysis -> 'summary') is distinct from 'object'
    or jsonb_typeof(p_analysis -> 'findings') is distinct from 'array'
    or p_analysis ->> 'final_approval_required' is distinct from 'true'
  then
    raise exception 'Review payload is malformed or does not require final approval'
      using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'draft_id', p_draft_id,
    'content', p_content,
    'sources_snapshot', p_sources_snapshot,
    'analysis', p_analysis
  );
  v_payload_hash := extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256');

  -- Fast retry path. The draft lock below serializes new submissions for a
  -- draft; the unique request ID handles simultaneous requests across drafts.
  select r.submission_payload_hash, r.id, r.draft_revision_id, dr.revision_number, dr.created_at
    into v_existing_hash, v_review_id, v_revision_id, v_revision_number, v_revision_created_at
  from public.reviews as r
  join public.draft_revisions as dr
    on dr.id = r.draft_revision_id
   and dr.workspace_id = r.workspace_id
   and dr.draft_id = r.draft_id
  where r.submission_request_id = p_request_id;

  if found then
    if v_existing_hash is distinct from v_payload_hash then
      raise exception 'Request ID was already used with a different payload'
        using errcode = '22023';
    end if;

    select coalesce(jsonb_object_agg(f.client_finding_key, f.id), '{}'::jsonb)
      into v_finding_ids
    from public.findings as f
    where f.review_id = v_review_id
      and f.client_finding_key is not null;

    return jsonb_build_object(
      'draft_revision_id', v_revision_id,
      'revision_number', v_revision_number,
      'created_at', v_revision_created_at,
      'review_id', v_review_id,
      'finding_ids', coalesce(v_finding_ids, '{}'::jsonb),
      'analysis_origin', 'browser_unverified'
    );
  end if;

  begin
    -- A matching persisted draft is required. Locking it serializes concurrent
    -- checks and prevents a stale autosave from being reviewed as current.
    select d.content
      into v_saved_content
    from public.drafts as d
    where d.id = p_draft_id
      and d.workspace_id = p_workspace_id
    for update;

    if not found then
      raise exception 'Draft is unavailable in this workspace'
        using errcode = '42501';
    end if;

    if v_saved_content is distinct from p_content then
      raise exception 'Draft changed before review submission; save and check it again'
        using errcode = '40001';
    end if;

    -- A same-draft concurrent retry may have committed while this call waited
    -- for the draft lock, so check the request key again before writing.
    select r.submission_payload_hash, r.id, r.draft_revision_id, dr.revision_number, dr.created_at
      into v_existing_hash, v_review_id, v_revision_id, v_revision_number, v_revision_created_at
    from public.reviews as r
    join public.draft_revisions as dr
      on dr.id = r.draft_revision_id
     and dr.workspace_id = r.workspace_id
     and dr.draft_id = r.draft_id
    where r.submission_request_id = p_request_id;

    if found then
      if v_existing_hash is distinct from v_payload_hash then
        raise exception 'Request ID was already used with a different payload'
          using errcode = '22023';
      end if;

      select coalesce(jsonb_object_agg(f.client_finding_key, f.id), '{}'::jsonb)
        into v_finding_ids
      from public.findings as f
      where f.review_id = v_review_id
        and f.client_finding_key is not null;

      return jsonb_build_object(
        'draft_revision_id', v_revision_id,
        'revision_number', v_revision_number,
        'created_at', v_revision_created_at,
        'review_id', v_review_id,
        'finding_ids', coalesce(v_finding_ids, '{}'::jsonb),
        'analysis_origin', 'browser_unverified'
      );
    end if;

    insert into public.draft_revisions (
      workspace_id, draft_id, revision_number, content, created_by
    ) values (
      p_workspace_id, p_draft_id, 1, p_content, v_user_id
    )
    returning id, revision_number, created_at into v_revision_id, v_revision_number, v_revision_created_at;

    insert into public.reviews (
      workspace_id, draft_id, draft_revision_id, review_date,
      overall_status, final_approval_required, summary, sources_snapshot,
      analysis_note, created_by, submission_request_id,
      submission_payload_hash, analysis_origin
    ) values (
      p_workspace_id, p_draft_id, v_revision_id,
      coalesce((p_analysis ->> 'review_date')::date, current_date),
      p_analysis ->> 'overall_status', true, p_analysis -> 'summary',
      p_sources_snapshot, p_analysis ->> 'analysis_note', v_user_id,
      p_request_id, v_payload_hash, 'browser_unverified'
    )
    returning id into v_review_id;

    v_finding_ids := '{}'::jsonb;
    for v_finding in
      select *
      from jsonb_to_recordset(p_analysis -> 'findings') as f(
        id text,
        claim text,
        category text,
        status text,
        severity text,
        explanation text,
        evidence jsonb,
        suggested_action text,
        reviewer_role text,
        reviewer_question text,
        requires_human_review boolean
      )
    loop
      if v_finding.id is null or length(btrim(v_finding.id)) = 0 then
        raise exception 'Each finding must have a stable client ID'
          using errcode = '22023';
      end if;

      insert into public.findings (
        workspace_id, review_id, client_finding_key, claim, category,
        status, severity, explanation, evidence, suggested_action,
        reviewer_role, reviewer_question, requires_human_review
      ) values (
        p_workspace_id, v_review_id, v_finding.id, v_finding.claim,
        v_finding.category, v_finding.status, v_finding.severity,
        v_finding.explanation, coalesce(v_finding.evidence, '[]'::jsonb),
        coalesce(v_finding.suggested_action, ''), v_finding.reviewer_role,
        v_finding.reviewer_question, v_finding.requires_human_review
      ) returning id into v_finding_id;

      v_finding_ids := v_finding_ids || jsonb_build_object(v_finding.id, v_finding_id);
    end loop;

    v_result := jsonb_build_object(
      'draft_revision_id', v_revision_id,
      'revision_number', v_revision_number,
      'created_at', v_revision_created_at,
      'review_id', v_review_id,
      'finding_ids', v_finding_ids,
      'analysis_origin', 'browser_unverified'
    );
    return v_result;

  exception when unique_violation then
    -- Concurrent calls with the same request ID can collide only after one
    -- transaction commits. The exception subtransaction rolls this call's
    -- revision/review/findings back before returning the committed result.
    select r.submission_payload_hash, r.id, r.draft_revision_id, dr.revision_number, dr.created_at
      into v_existing_hash, v_review_id, v_revision_id, v_revision_number, v_revision_created_at
    from public.reviews as r
    join public.draft_revisions as dr
      on dr.id = r.draft_revision_id
     and dr.workspace_id = r.workspace_id
     and dr.draft_id = r.draft_id
    where r.submission_request_id = p_request_id;

    if not found then
      raise;
    end if;
    if v_existing_hash is distinct from v_payload_hash then
      raise exception 'Request ID was already used with a different payload'
        using errcode = '22023';
    end if;

    select coalesce(jsonb_object_agg(f.client_finding_key, f.id), '{}'::jsonb)
      into v_finding_ids
    from public.findings as f
    where f.review_id = v_review_id
      and f.client_finding_key is not null;

    return jsonb_build_object(
      'draft_revision_id', v_revision_id,
      'revision_number', v_revision_number,
      'created_at', v_revision_created_at,
      'review_id', v_review_id,
      'finding_ids', coalesce(v_finding_ids, '{}'::jsonb),
      'analysis_origin', 'browser_unverified'
    );
  end;
end;
$$;

revoke all on function public.submit_review(uuid, uuid, uuid, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.submit_review(uuid, uuid, uuid, text, jsonb, jsonb)
  to authenticated;
