begin;

select plan(22);

-- Fixed synthetic users and rows make the policy checks repeatable. The
-- transaction is rolled back at the end of the test file.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'veritybrand-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000002', 'veritybrand-editor@example.invalid'),
  ('00000000-0000-4000-8000-000000000003', 'veritybrand-reviewer-authorized@example.invalid'),
  ('00000000-0000-4000-8000-000000000004', 'veritybrand-reviewer-unauthorized@example.invalid')
on conflict (id) do nothing;

insert into public.workspaces (id, name, created_by) values
  ('10000000-0000-4000-8000-000000000001', 'R3 role test workspace', '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', 'R3 isolation test workspace', '00000000-0000-4000-8000-000000000001');

insert into public.workspace_members (workspace_id, user_id, member_role, can_final_approve) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'owner', false),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'editor', false),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'reviewer', false),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'reviewer', false),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'owner', false);

insert into public.approved_sources (id, workspace_id, title, source_text, created_by) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Workspace source', 'Approved source text.', '00000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Protected workspace source', 'Must remain readable by members.', '00000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Other workspace source', 'Private source text.', '00000000-0000-4000-8000-000000000001');

insert into public.drafts (id, workspace_id, content, created_by) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Review test draft.', '00000000-0000-4000-8000-000000000001');

insert into public.draft_revisions (id, workspace_id, draft_id, revision_number, content, created_by) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'Review test draft.', '00000000-0000-4000-8000-000000000001');

insert into public.reviews (id, workspace_id, draft_id, draft_revision_id, overall_status, final_approval_required, created_by) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'ready_for_final_approval', true, '00000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'ready_for_final_approval', true, '00000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'ready_for_final_approval', true, '00000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'ready_for_final_approval', true, '00000000-0000-4000-8000-000000000001');

insert into public.findings (id, workspace_id, review_id, claim, category, status, severity, explanation, requires_human_review) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'A supported claim.', 'product_fact', 'supported', 'low', 'Matches the test source.', false),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'A supported claim.', 'product_fact', 'supported', 'low', 'Matches the test source.', false),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'A supported claim.', 'product_fact', 'supported', 'low', 'Matches the test source.', false),
  ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', 'A supported claim.', 'product_fact', 'supported', 'low', 'Matches the test source.', false);

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';

select lives_ok(
  $$insert into public.approved_sources (workspace_id, title, source_text, created_by)
    values ('10000000-0000-4000-8000-000000000001', 'Owner-created source', 'Owner source text.', '00000000-0000-4000-8000-000000000001')$$,
  'Owner can insert an approved source'
);
select is(
  (with changed as (
    update public.approved_sources set source_text = 'Updated by owner.'
    where id = '60000000-0000-4000-8000-000000000001' returning 1
  ) select count(*) from changed),
  1::bigint,
  'Owner can update an approved source'
);
select is(
  (with removed as (
    delete from public.approved_sources where id = '60000000-0000-4000-8000-000000000001'
    returning 1
  ) select count(*) from removed),
  1::bigint,
  'Owner can delete an approved source'
);
select lives_ok(
  $$insert into public.final_approvals (workspace_id, review_id, draft_revision_id, approval_mode, coverage_acknowledged, approver_id)
    values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'reviewed', true, '00000000-0000-4000-8000-000000000001')$$,
  'Owner can approve without reviewer authorization'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
select throws_ok(
  $$insert into public.approved_sources (workspace_id, title, source_text, created_by)
    values ('10000000-0000-4000-8000-000000000001', 'Editor source', 'Must be denied.', '00000000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'Editor cannot insert an approved source'
);
select is(
  (with changed as (
    update public.approved_sources set source_text = 'Editor attempt.'
    where id = '60000000-0000-4000-8000-000000000003' returning 1
  ) select count(*) from changed),
  0::bigint,
  'Editor cannot update an approved source'
);
select is(
  (with removed as (
    delete from public.approved_sources where id = '60000000-0000-4000-8000-000000000003'
    returning 1
  ) select count(*) from removed),
  0::bigint,
  'Editor cannot delete an approved source'
);
select is(
  (select count(*) from public.approved_sources where id = '60000000-0000-4000-8000-000000000003'),
  1::bigint,
  'Editor can read a workspace source'
);
select is(
  (select count(*) from public.findings where id = '50000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Editor can read a workspace finding'
);
select is(
  (select count(*) from public.approved_sources where id = '60000000-0000-4000-8000-000000000002'),
  0::bigint,
  'Editor cannot read another workspace source'
);
select is(
  (with changed as (
    update public.workspace_members set can_final_approve = true
    where workspace_id = '10000000-0000-4000-8000-000000000001'
      and user_id = '00000000-0000-4000-8000-000000000003'
    returning 1
  ) select count(*) from changed),
  0::bigint,
  'Editor cannot authorize a reviewer'
);
select throws_ok(
  $$insert into public.reviewer_decisions (workspace_id, finding_id, decision, actor_id)
    values ('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'confirmed', '00000000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'Editor cannot record a reviewer decision'
);
select throws_ok(
  $$insert into public.final_approvals (workspace_id, review_id, draft_revision_id, approval_mode, coverage_acknowledged, approver_id)
    values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'reviewed', true, '00000000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'Editor cannot approve'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select throws_ok(
  $$insert into public.approved_sources (workspace_id, title, source_text, created_by)
    values ('10000000-0000-4000-8000-000000000001', 'Reviewer source', 'Must be denied.', '00000000-0000-4000-8000-000000000003')$$,
  '42501', null,
  'Reviewer cannot insert an approved source'
);
select is(
  (with changed as (
    update public.approved_sources set source_text = 'Reviewer attempt.'
    where id = '60000000-0000-4000-8000-000000000003' returning 1
  ) select count(*) from changed),
  0::bigint,
  'Reviewer cannot update an approved source'
);
select is(
  (with removed as (
    delete from public.approved_sources where id = '60000000-0000-4000-8000-000000000003'
    returning 1
  ) select count(*) from removed),
  0::bigint,
  'Reviewer cannot delete an approved source'
);
select is(
  (select count(*) from public.approved_sources where id = '60000000-0000-4000-8000-000000000003'),
  1::bigint,
  'Reviewer can read a workspace source'
);
select is(
  (select count(*) from public.findings where id = '50000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Reviewer can read a workspace finding'
);
select lives_ok(
  $$insert into public.reviewer_decisions (workspace_id, finding_id, decision, actor_id)
    values ('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'confirmed', '00000000-0000-4000-8000-000000000003')$$,
  'Reviewer can record a review decision'
);
select throws_ok(
  $$insert into public.final_approvals (workspace_id, review_id, draft_revision_id, approval_mode, coverage_acknowledged, approver_id)
    values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'reviewed', true, '00000000-0000-4000-8000-000000000003')$$,
  '42501', null,
  'Unauthorized reviewer cannot approve'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
select is(
  (with changed as (
    update public.workspace_members set can_final_approve = true
    where workspace_id = '10000000-0000-4000-8000-000000000001'
      and user_id = '00000000-0000-4000-8000-000000000003'
    returning 1
  ) select count(*) from changed),
  1::bigint,
  'Owner can explicitly authorize a reviewer'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
select lives_ok(
  $$insert into public.final_approvals (workspace_id, review_id, draft_revision_id, approval_mode, coverage_acknowledged, approver_id)
    values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'reviewed', true, '00000000-0000-4000-8000-000000000003')$$,
  'Explicitly authorized reviewer can approve'
);

select * from finish();
rollback;
