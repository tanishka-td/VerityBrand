begin;

alter table public.approved_sources
  add column is_active boolean not null default true,
  add column current_version_id uuid;

create table public.approved_source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  workspace_id uuid not null,
  version_number integer not null check (version_number > 0),
  title text not null check (length(btrim(title)) > 0),
  source_text text not null check (length(btrim(source_text)) > 0),
  owner_label text,
  kind text,
  valid_from date,
  valid_through date,
  is_active boolean not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (valid_from is null or valid_through is null or valid_through >= valid_from),
  unique (source_id, version_number),
  unique (id, workspace_id),
  foreign key (source_id, workspace_id)
    references public.approved_sources(id, workspace_id) on delete restrict
);

-- Preserve each current source as its first version without rewriting review or
-- approval history.
with created_versions as (
  insert into public.approved_source_versions (
    source_id, workspace_id, version_number, title, source_text,
    owner_label, kind, valid_from, valid_through, is_active, created_by, created_at
  )
  select id, workspace_id, 1, title, source_text,
    owner_label, kind, valid_from, valid_through, is_active, created_by, updated_at
  from public.approved_sources
  returning id, source_id, workspace_id
)
update public.approved_sources as s
set current_version_id = v.id
from created_versions as v
where s.id = v.source_id and s.workspace_id = v.workspace_id;

alter table public.approved_sources
  alter column current_version_id set not null,
  add constraint approved_sources_current_version_fk
    foreign key (current_version_id, workspace_id)
    references public.approved_source_versions(id, workspace_id) on delete restrict;

create index approved_source_versions_workspace_source_idx
  on public.approved_source_versions(workspace_id, source_id, version_number desc);

alter table public.approved_source_versions enable row level security;
create policy approved_source_versions_select_member on public.approved_source_versions
for select to authenticated
using (public.is_workspace_member(workspace_id));
grant select on public.approved_source_versions to authenticated;
revoke insert, update, delete on public.approved_source_versions from public, anon, authenticated;
grant update (is_active) on public.approved_sources to authenticated;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.version_approved_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_version integer;
  v_version_id uuid;
begin
  if tg_op = 'UPDATE'
    and row(old.title, old.source_text, old.owner_label, old.kind, old.valid_from, old.valid_through, old.is_active)
      is not distinct from
        row(new.title, new.source_text, new.owner_label, new.kind, new.valid_from, new.valid_through, new.is_active)
  then
    return new;
  end if;

  select coalesce(max(sv.version_number), 0) + 1
    into v_next_version
  from public.approved_source_versions as sv
  where sv.source_id = new.id
    and sv.workspace_id = new.workspace_id;

  insert into public.approved_source_versions (
    source_id, workspace_id, version_number, title, source_text,
    owner_label, kind, valid_from, valid_through, is_active, created_by
  ) values (
    new.id, new.workspace_id, v_next_version, new.title, new.source_text,
    new.owner_label, new.kind, new.valid_from, new.valid_through,
    new.is_active, new.created_by
  ) returning id into v_version_id;

  update public.approved_sources
    set current_version_id = v_version_id
  where id = new.id and workspace_id = new.workspace_id;

  return new;
end;
$$;

-- Prevent table clients from rewinding or forging the pointer. The append
-- trigger's own nested pointer update is allowed (trigger depth > 1).
create or replace function app_private.protect_source_version_pointer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_version_id is distinct from old.current_version_id and pg_trigger_depth() <= 1 then
    raise exception 'Current source version is managed by the database'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.version_approved_source() from public, anon, authenticated;
revoke all on function app_private.protect_source_version_pointer() from public, anon, authenticated;
create trigger approved_sources_protect_version_pointer
before update of current_version_id on public.approved_sources
for each row execute function app_private.protect_source_version_pointer();
create trigger approved_sources_append_version
after insert or update on public.approved_sources
for each row execute function app_private.version_approved_source();

create table public.review_source_versions (
  review_id uuid not null,
  workspace_id uuid not null,
  source_version_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (review_id, source_version_id),
  unique (review_id, workspace_id, source_version_id),
  foreign key (review_id, workspace_id)
    references public.reviews(id, workspace_id) on delete restrict,
  foreign key (source_version_id, workspace_id)
    references public.approved_source_versions(id, workspace_id) on delete restrict
);

alter table public.findings
  add constraint findings_id_workspace_review_unique unique (id, workspace_id, review_id);

create table public.finding_source_versions (
  finding_id uuid not null,
  review_id uuid not null,
  workspace_id uuid not null,
  source_version_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (finding_id, source_version_id),
  foreign key (finding_id, workspace_id, review_id)
    references public.findings(id, workspace_id, review_id) on delete restrict,
  foreign key (review_id, workspace_id, source_version_id)
    references public.review_source_versions(review_id, workspace_id, source_version_id) on delete restrict
);

alter table public.review_source_versions enable row level security;
create policy review_source_versions_select_member on public.review_source_versions
for select to authenticated
using (public.is_workspace_member(workspace_id));
grant select on public.review_source_versions to authenticated;
revoke insert, update, delete on public.review_source_versions from public, anon, authenticated;

alter table public.finding_source_versions enable row level security;
create policy finding_source_versions_select_member on public.finding_source_versions
for select to authenticated
using (public.is_workspace_member(workspace_id));
grant select on public.finding_source_versions to authenticated;
revoke insert, update, delete on public.finding_source_versions from public, anon, authenticated;

create or replace function app_private.bind_review_source_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.review_source_versions (review_id, workspace_id, source_version_id)
  select distinct new.id, new.workspace_id, (source.value ->> 'source_version_id')::uuid
  from jsonb_array_elements(new.sources_snapshot) as source(value)
  where source.value ? 'source_version_id'
    and nullif(btrim(source.value ->> 'source_version_id'), '') is not null
  on conflict (review_id, source_version_id) do nothing;
  return new;
end;
$$;

create or replace function app_private.bind_finding_source_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.finding_source_versions (finding_id, review_id, workspace_id, source_version_id)
  select distinct new.id, new.review_id, new.workspace_id, (evidence.value ->> 'source_version_id')::uuid
  from jsonb_array_elements(new.evidence) as evidence(value)
  where evidence.value ? 'source_version_id'
    and nullif(btrim(evidence.value ->> 'source_version_id'), '') is not null
  on conflict (finding_id, source_version_id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.bind_review_source_versions() from public, anon, authenticated;
revoke all on function app_private.bind_finding_source_versions() from public, anon, authenticated;
create trigger reviews_bind_source_versions
after insert on public.reviews
for each row execute function app_private.bind_review_source_versions();
create trigger findings_bind_source_versions
after insert on public.findings
for each row execute function app_private.bind_finding_source_versions();

commit;
