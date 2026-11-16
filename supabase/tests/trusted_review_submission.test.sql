begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000031', 'veritybrand-trusted-owner@example.invalid')
on conflict (id) do nothing;
insert into public.workspaces (id, name, created_by) values
  ('10000000-0000-4000-8000-000000000031', 'Trusted submission test', '00000000-0000-4000-8000-000000000031');
insert into public.workspace_members (workspace_id, user_id, member_role, can_final_approve) values
  ('10000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000031', 'owner', false);
insert into public.drafts (id, workspace_id, content, created_by) values
  ('20000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000031', 'Coffee contains 80 mg.', '00000000-0000-4000-8000-000000000031');

create temporary table trusted_payload_fixture (payload jsonb not null, signature text);
grant select, insert, update on trusted_payload_fixture to authenticated, service_role;
insert into trusted_payload_fixture(payload) values (jsonb_build_object(
  'workspace_id', '10000000-0000-4000-8000-000000000031'::uuid,
  'draft_id', '20000000-0000-4000-8000-000000000031'::uuid,
  'request_id', '30000000-0000-4000-8000-000000000031'::uuid,
  'actor_id', '00000000-0000-4000-8000-000000000031'::uuid,
  'content', 'Coffee contains 80 mg.',
  'sources_snapshot', '[]'::jsonb,
  'analysis', jsonb_build_object(
    'review_date', '2026-11-16', 'overall_status', 'ready_for_final_approval',
    'final_approval_required', true,
    'summary', '{"supported":0,"contradicted":0,"outdated":0,"unverified":0}'::jsonb,
    'findings', '[]'::jsonb
  )
));

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000031';
insert into public.approved_sources (id, workspace_id, title, source_text, created_by) values
  ('50000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000031', 'Coffee facts', 'Coffee contains 80 mg.', auth.uid());
update pg_temp.trusted_payload_fixture
set payload = jsonb_set(payload, '{sources_snapshot}', (
  select jsonb_build_array(jsonb_build_object(
    'source_id', source.id, 'source_version_id', version.id,
    'title', version.title, 'text', version.source_text
  ))
  from public.approved_sources source
  join public.approved_source_versions version on version.id = source.current_version_id
  where source.id = '50000000-0000-4000-8000-000000000031'
));
select throws_ok(
  $$select public.sign_review_analysis_payload((select payload from pg_temp.trusted_payload_fixture))$$,
  '42501', null, 'Authenticated clients cannot sign trusted payloads'
);

set local role service_role;
set local "request.jwt.claim.role" = 'service_role';
update pg_temp.trusted_payload_fixture
set signature = public.sign_review_analysis_payload(payload);

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
select lives_ok(
  $$select public.submit_review_trusted(
    '10000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000031',
    '30000000-0000-4000-8000-000000000031',
    'Coffee contains 80 mg.',
    (select payload -> 'sources_snapshot' from pg_temp.trusted_payload_fixture),
    (select payload -> 'analysis' from pg_temp.trusted_payload_fixture),
    (select signature from pg_temp.trusted_payload_fixture)
  )$$,
  'A signed server-generated analysis is submitted under the authenticated user'
);
select is(
  (select analysis_origin from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000031'),
  'server_analyzed', 'Trusted RPC records server provenance'
);
select is(
  (select count(*) from public.review_source_versions rsv join public.reviews r on r.id = rsv.review_id where r.submission_request_id = '30000000-0000-4000-8000-000000000031'),
  1::bigint, 'Trusted review links the exact signed source version'
);
update public.approved_sources set title = 'Updated Coffee facts'
where id = '50000000-0000-4000-8000-000000000031';
select throws_ok(
  $$select public.submit_review_trusted(
    '10000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000031',
    '30000000-0000-4000-8000-000000000032',
    'Coffee contains 80 mg.',
    (select payload -> 'sources_snapshot' from pg_temp.trusted_payload_fixture),
    (select payload -> 'analysis' from pg_temp.trusted_payload_fixture),
    (select signature from pg_temp.trusted_payload_fixture)
  )$$,
  '40001', null, 'A source edit between loading and submit rejects the stale signed version set'
);
select is(
  (select count(*) from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000032'),
  0::bigint, 'A stale source set leaves no partial trusted review'
);
select throws_ok(
  $$select public.submit_review_trusted(
    '10000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000031',
    '30000000-0000-4000-8000-000000000032',
    'Coffee contains 80 mg.', '[]'::jsonb,
    jsonb_build_object(
      'review_date','2026-11-16','overall_status','ready_for_final_approval',
      'final_approval_required',true,
      'summary','{"supported":0,"contradicted":0,"outdated":0,"unverified":0}'::jsonb,
      'findings','[]'::jsonb
    ), repeat('0',64)
  )$$,
  '42501', null, 'Forged analysis signatures are rejected'
);
select is(
  (select count(*) from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000032'),
  0::bigint, 'A rejected signature creates no partial review'
);
select set_config('veritybrand.server_analysis_verified', 'on', true);
select is(
  (public.submit_review(
    '10000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000031',
    '30000000-0000-4000-8000-000000000033',
    'Coffee contains 80 mg.', '[]'::jsonb,
    jsonb_build_object(
      'review_date','2026-11-16','overall_status','ready_for_final_approval',
      'final_approval_required',true,
      'summary','{"supported":0,"contradicted":0,"outdated":0,"unverified":0}'::jsonb,
      'findings','[]'::jsonb
    )
  ) ->> 'analysis_origin'),
  'browser_unverified', 'A browser-set session flag cannot make legacy RPC findings trusted'
);

select * from finish();
rollback;
