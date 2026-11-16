begin;

-- The browser RPC remains available for compatibility, but its rows stay
-- explicitly browser_unverified. Only the signed server wrapper can mark a
-- review as server_analyzed.
alter table public.reviews drop constraint if exists reviews_analysis_origin_check;
alter table public.reviews add constraint reviews_analysis_origin_check
  check (analysis_origin in ('legacy_unverified', 'browser_unverified', 'server_analyzed'));

create table app_private.review_analysis_signing_keys (
  id boolean primary key default true check (id),
  secret bytea not null check (octet_length(secret) = 32)
);
insert into app_private.review_analysis_signing_keys (id, secret)
values (true, extensions.gen_random_bytes(32));
revoke all on app_private.review_analysis_signing_keys from public, anon, authenticated;

create or replace function public.sign_review_analysis_payload(p_payload jsonb)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_secret bytea;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server signing is restricted' using errcode = '42501';
  end if;
  select secret into strict v_secret from app_private.review_analysis_signing_keys where id;
  return encode(extensions.hmac(convert_to(p_payload::text, 'UTF8'), v_secret, 'sha256'), 'hex');
end;
$$;
revoke all on function public.sign_review_analysis_payload(jsonb) from public, anon, authenticated;
grant execute on function public.sign_review_analysis_payload(jsonb) to service_role;

create or replace function public.verify_review_analysis_signature(p_payload jsonb, p_signature text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_secret bytea; v_expected bytea; v_provided bytea;
begin
  if p_signature is null or p_signature !~ '^[0-9a-f]{64}$' then return false; end if;
  select secret into strict v_secret from app_private.review_analysis_signing_keys where id;
  v_expected := extensions.hmac(convert_to(p_payload::text, 'UTF8'), v_secret, 'sha256');
  v_provided := decode(p_signature, 'hex');
  return v_expected = v_provided;
end;
$$;
revoke all on function public.verify_review_analysis_signature(jsonb, text) from public, anon;
grant execute on function public.verify_review_analysis_signature(jsonb, text) to authenticated;

create table app_private.review_analysis_attestations (
  transaction_id bigint primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on app_private.review_analysis_attestations from public, anon, authenticated, service_role;

create or replace function app_private.attest_review_analysis(p_payload jsonb, p_signature text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
    or (p_payload ->> 'actor_id')::uuid is distinct from v_user_id
    or not public.has_workspace_role((p_payload ->> 'workspace_id')::uuid, array['owner', 'editor'])
    or not public.verify_review_analysis_signature(p_payload, p_signature) then
    raise exception 'Trusted analysis attestation is invalid' using errcode = '42501';
  end if;
  insert into app_private.review_analysis_attestations(transaction_id, payload)
    values (txid_current(), p_payload);
end;
$$;

create or replace function app_private.clear_review_analysis_attestation()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from app_private.review_analysis_attestations where transaction_id = txid_current();
end;
$$;

grant usage on schema app_private to authenticated;
revoke all on function app_private.attest_review_analysis(jsonb, text) from public, anon;
revoke all on function app_private.clear_review_analysis_attestation() from public, anon;
grant execute on function app_private.attest_review_analysis(jsonb, text) to authenticated;
grant execute on function app_private.clear_review_analysis_attestation() to authenticated;

create or replace function app_private.mark_server_analyzed_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_attestation jsonb;
begin
  select attestation.payload into v_attestation
  from app_private.review_analysis_attestations as attestation
  where attestation.transaction_id = txid_current();
  if not found then return new; end if;

  if jsonb_typeof(v_attestation -> 'sources_snapshot') is distinct from 'array'
    or v_attestation ->> 'workspace_id' is distinct from new.workspace_id::text
    or v_attestation ->> 'draft_id' is distinct from new.draft_id::text
    or v_attestation ->> 'request_id' is distinct from new.submission_request_id::text
    or v_attestation ->> 'actor_id' is distinct from new.created_by::text
    or v_attestation ->> 'content' is distinct from (
      select revision.content from public.draft_revisions as revision
      where revision.id = new.draft_revision_id and revision.workspace_id = new.workspace_id
    )
    or v_attestation -> 'sources_snapshot' is distinct from new.sources_snapshot
    or v_attestation #>> '{analysis,review_date}' is distinct from new.review_date::text
    or v_attestation #>> '{analysis,overall_status}' is distinct from new.overall_status
    or v_attestation #> '{analysis,summary}' is distinct from new.summary
    or v_attestation #>> '{analysis,analysis_note}' is distinct from new.analysis_note then
    raise exception 'Review rows do not match the signed server analysis' using errcode = '42501';
  end if;

  new.analysis_origin := 'server_analyzed';

    -- Lock the workspace and its source rows until the review transaction commits. This
    -- makes the signed source set current at a locked validation point relative to
    -- concurrent source edits/deactivation; a stale set is rejected.
    perform 1 from public.workspaces as workspace
    where workspace.id = new.workspace_id
    for update;
    perform 1
    from public.approved_sources as source
    where source.workspace_id = new.workspace_id
    order by source.id
    for update;

  if exists (
      select 1
      from public.approved_sources as source
      where source.workspace_id = new.workspace_id and source.is_active
        and not exists (
          select 1 from jsonb_array_elements(new.sources_snapshot) as item(value)
          where item.value ->> 'source_version_id' = source.current_version_id::text
        )
    ) or exists (
      select 1
      from jsonb_array_elements(new.sources_snapshot) as item(value)
      where not exists (
        select 1 from public.approved_sources as source
        join public.approved_source_versions as version
          on version.id = source.current_version_id
         and version.workspace_id = source.workspace_id
        where source.workspace_id = new.workspace_id and source.is_active
          and version.is_active
          and version.id::text = item.value ->> 'source_version_id'
      )
    ) then
    raise exception 'Approved sources changed during analysis; reload and retry'
      using errcode = '40001';
  end if;
  return new;
end;
$$;
revoke all on function app_private.mark_server_analyzed_review() from public, anon, authenticated;
create trigger reviews_mark_server_analyzed
before insert on public.reviews
for each row execute function app_private.mark_server_analyzed_review();

create or replace function public.submit_review_trusted(
  p_workspace_id uuid,
  p_draft_id uuid,
  p_request_id uuid,
  p_content text,
  p_sources_snapshot jsonb,
  p_analysis jsonb,
  p_server_signature text
)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_signed_payload jsonb;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.has_workspace_role(p_workspace_id, array['owner', 'editor']) then
    raise exception 'Only workspace Owners and Editors can submit reviews' using errcode = '42501';
  end if;
  if jsonb_typeof(p_sources_snapshot) is distinct from 'array'
    or jsonb_typeof(p_analysis) is distinct from 'object'
    or jsonb_typeof(p_analysis -> 'findings') is distinct from 'array'
    or jsonb_typeof(p_analysis -> 'summary') is distinct from 'object' then
    raise exception 'Trusted review payload is malformed' using errcode = '22023';
  end if;
  v_signed_payload := jsonb_build_object(
    'workspace_id', p_workspace_id, 'draft_id', p_draft_id,
    'request_id', p_request_id, 'actor_id', v_user_id,
    'content', p_content, 'sources_snapshot', p_sources_snapshot,
    'analysis', p_analysis
  );
  if not public.verify_review_analysis_signature(v_signed_payload, p_server_signature) then
    raise exception 'Server analysis signature is invalid' using errcode = '42501';
  end if;
  perform app_private.attest_review_analysis(v_signed_payload, p_server_signature);
  v_result := public.submit_review(p_workspace_id, p_draft_id, p_request_id, p_content, p_sources_snapshot, p_analysis);
  perform app_private.clear_review_analysis_attestation();
  return jsonb_set(v_result, '{analysis_origin}', '"server_analyzed"'::jsonb, true);
end;
$$;
revoke all on function public.submit_review_trusted(uuid, uuid, uuid, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.submit_review_trusted(uuid, uuid, uuid, text, jsonb, jsonb, text) to authenticated;
commit;
