begin;

select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000021', 'veritybrand-version-owner@example.invalid')
on conflict (id) do nothing;

insert into public.workspaces (id, name, created_by) values
  ('10000000-0000-4000-8000-000000000021', 'Source version test', '00000000-0000-4000-8000-000000000021');

insert into public.workspace_members (workspace_id, user_id, member_role, can_final_approve) values
  ('10000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000021', 'owner', false);

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000021';

insert into public.approved_sources (
  id, workspace_id, title, source_text, owner_label, kind, valid_from, valid_through, created_by
) values (
  '20000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000021',
  'Initial source', 'Coffee contains 80 mg caffeine.', 'Product Owner', 'Product facts', null, null,
  auth.uid()
);

select is(
  (select count(*) from public.approved_source_versions where source_id = '20000000-0000-4000-8000-000000000021'),
  1::bigint,
  'Source creation creates its first immutable version'
);
select is(
  (select sv.version_number from public.approved_sources s join public.approved_source_versions sv on sv.id = s.current_version_id where s.id = '20000000-0000-4000-8000-000000000021'),
  1,
  'New source points to version one'
);

update public.approved_sources
set title = 'Updated source', source_text = 'Coffee contains 90 mg caffeine.'
where id = '20000000-0000-4000-8000-000000000021';

select is(
  (select count(*) from public.approved_source_versions where source_id = '20000000-0000-4000-8000-000000000021'),
  2::bigint,
  'Every source edit appends a version'
);
select is(
  (select title from public.approved_source_versions where source_id = '20000000-0000-4000-8000-000000000021' and version_number = 1),
  'Initial source',
  'Editing the source does not rewrite version one'
);
select is(
  (select sv.version_number from public.approved_sources s join public.approved_source_versions sv on sv.id = s.current_version_id where s.id = '20000000-0000-4000-8000-000000000021'),
  2,
  'Edited source points to version two'
);
select throws_ok(
  $$update public.approved_sources set current_version_id = (select id from public.approved_source_versions where source_id = '20000000-0000-4000-8000-000000000021' and version_number = 1) where id = '20000000-0000-4000-8000-000000000021'$$,
  '42501', null,
  'Owner cannot manually rewind the database-managed current version pointer'
);

insert into public.drafts (id, workspace_id, content, created_by) values
  ('30000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021', 'Coffee contains 90 mg caffeine.', auth.uid());
select lives_ok(
  $$select public.submit_review(
    '10000000-0000-4000-8000-000000000021',
    '30000000-0000-4000-8000-000000000021',
    '40000000-0000-4000-8000-000000000021',
    'Coffee contains 90 mg caffeine.',
    (select jsonb_build_array(jsonb_build_object(
      'source_id', s.id, 'source_version_id', sv.id, 'title', sv.title,
      'text', sv.source_text
    )) from public.approved_sources s join public.approved_source_versions sv on sv.id = s.current_version_id where s.id = '20000000-0000-4000-8000-000000000021'),
    jsonb_build_object(
      'review_date','2026-11-16','overall_status','ready_for_final_approval',
      'final_approval_required',true,
      'summary','{"supported":1,"contradicted":0,"outdated":0,"unverified":0}'::jsonb,
      'findings',jsonb_build_array(jsonb_build_object(
        'id','claim-0','claim','Coffee contains 90 mg caffeine.','category','product_fact',
        'status','supported','severity','low','explanation','Test evidence',
        'evidence',(select jsonb_build_array(jsonb_build_object(
          'source_id',s.id,'source_version_id',sv.id,'title',sv.title,'text',sv.source_text
        )) from public.approved_sources s join public.approved_source_versions sv on sv.id=s.current_version_id where s.id='20000000-0000-4000-8000-000000000021'),
        'suggested_action','','requires_human_review',false
      ))
    )
  )$$,
  'A review stores immutable source-version references in its snapshot and finding evidence'
);
select is(
  (select count(*) from public.review_source_versions rsv join public.reviews r on r.id = rsv.review_id where r.submission_request_id = '40000000-0000-4000-8000-000000000021'),
  1::bigint, 'Review provenance is linked to the exact source version'
);
select is(
  (select count(*) from public.finding_source_versions fsv join public.reviews r on r.id = fsv.review_id where r.submission_request_id = '40000000-0000-4000-8000-000000000021'),
  1::bigint, 'Finding evidence is linked to the exact source version'
);

update public.approved_sources set is_active = false
where id = '20000000-0000-4000-8000-000000000021';

select is(
  (select count(*) from public.approved_source_versions where source_id = '20000000-0000-4000-8000-000000000021'),
  3::bigint,
  'Deactivation appends a version instead of deleting the source history'
);
select is(
  (select sv.is_active from public.approved_sources s join public.approved_source_versions sv on sv.id = s.current_version_id where s.id = '20000000-0000-4000-8000-000000000021'),
  false,
  'The current version records the deactivated state'
);
select throws_ok(
  $$update public.approved_source_versions set title = 'Tampered history' where source_id = '20000000-0000-4000-8000-000000000021' and version_number = 1$$,
  '42501', null,
  'Owner cannot update immutable source versions'
);
select throws_ok(
  $$delete from public.approved_source_versions where source_id = '20000000-0000-4000-8000-000000000021' and version_number = 1$$,
  '42501', null,
  'Owner cannot delete immutable source versions'
);
select throws_ok(
  $$delete from public.approved_sources where id = '20000000-0000-4000-8000-000000000021'$$,
  '23503', null,
  'Physical source deletion is blocked while historical versions exist'
);

select * from finish();
rollback;
