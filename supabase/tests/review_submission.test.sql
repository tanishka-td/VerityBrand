begin;

select plan(19);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000011', 'veritybrand-submit-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000012', 'veritybrand-submit-editor@example.invalid'),
  ('00000000-0000-4000-8000-000000000013', 'veritybrand-submit-reviewer@example.invalid')
on conflict (id) do nothing;

insert into public.workspaces (id, name, created_by) values
  ('10000000-0000-4000-8000-000000000011', 'Review submission test', '00000000-0000-4000-8000-000000000011');

insert into public.workspace_members (workspace_id, user_id, member_role, can_final_approve) values
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011', 'owner', false),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012', 'editor', false),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000013', 'reviewer', false);

insert into public.drafts (id, workspace_id, content, created_by) values
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 'Coffee contains 80 mg of caffeine.', '00000000-0000-4000-8000-000000000011');

create temporary table review_submission_fixture (analysis jsonb not null);
grant select on review_submission_fixture to authenticated;
insert into review_submission_fixture values ('{
  "brand_name": "Test Brand",
  "review_date": "2026-11-16",
  "overall_status": "ready_for_final_approval",
  "final_approval_required": true,
  "summary": {"supported": 1, "contradicted": 0, "outdated": 0, "unverified": 0},
  "findings": [{
    "id": "claim-0",
    "claim": "Coffee contains 80 mg of caffeine.",
    "category": "product_fact",
    "status": "supported",
    "severity": "low",
    "explanation": "Values match the test fixture.",
    "evidence": [],
    "suggested_action": "",
    "reviewer_role": null,
    "requires_human_review": false
  }],
  "analysis_note": "Synthetic test analysis."
}'::jsonb);

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000011';

select lives_ok(
  $$select public.submit_review(
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000011',
    'Coffee contains 80 mg of caffeine.',
    '[]'::jsonb,
    (select analysis from pg_temp.review_submission_fixture)
  )$$,
  'Owner can submit a review through the atomic RPC'
);

select is(
  (select dr.revision_number from public.reviews r join public.draft_revisions dr on dr.id = r.draft_revision_id where r.submission_request_id = '30000000-0000-4000-8000-000000000011'),
  1,
  'The database assigns the first revision number'
);
select is(
  (select analysis_origin from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000011'),
  'browser_unverified',
  'Browser findings are explicitly marked unverified'
);
select throws_ok(
  $$insert into public.draft_revisions (workspace_id, draft_id, revision_number, content, created_by)
    values ('10000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 90, 'Direct revision insert.', auth.uid())$$,
  '42501', null,
  'Owner cannot bypass the RPC by inserting a draft revision directly'
);
select throws_ok(
  $$insert into public.reviews (workspace_id, draft_id, draft_revision_id, overall_status, final_approval_required, summary, sources_snapshot, created_by)
    select workspace_id, draft_id, draft_revision_id, 'needs_human_review', true, '{}'::jsonb, '[]'::jsonb, auth.uid()
    from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000011'$$,
  '42501', null,
  'Owner cannot bypass the RPC by inserting a review directly'
);
select throws_ok(
  $$insert into public.findings (workspace_id, review_id, claim, category, status, severity, explanation, evidence, suggested_action, requires_human_review)
    select workspace_id, id, 'Direct finding insert.', 'product_fact', 'unverified', 'medium', 'Test finding.', '[]'::jsonb, '', true
    from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000011'$$,
  '42501', null,
  'Owner cannot bypass the RPC by inserting findings directly'
);
select is(
  (public.submit_review(
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000011',
    'Coffee contains 80 mg of caffeine.',
    '[]'::jsonb,
    (select analysis from pg_temp.review_submission_fixture)
  ) ->> 'review_id'),
  (select id::text from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000011'),
  'A same-payload retry returns the original review ID'
);
select is(
  (public.submit_review(
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000011',
    'Coffee contains 80 mg of caffeine.',
    '[]'::jsonb,
    (select analysis from pg_temp.review_submission_fixture)
  ) ->> 'draft_revision_id'),
  (select draft_revision_id::text from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000011'),
  'A same-payload retry returns the original revision ID'
);
select is(
  (select count(*) from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000011'),
  1::bigint,
  'A same-payload retry does not create a duplicate review'
);

select throws_ok(
  $$select public.submit_review(
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000011',
    'Different content.',
    '[]'::jsonb,
    (select analysis from pg_temp.review_submission_fixture)
  )$$,
  '22023', null,
  'Reusing a request ID with changed content is rejected'
);
select is(
  (select count(*) from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000011'),
  1::bigint,
  'A conflicting retry leaves the original review unchanged'
);

select throws_ok(
  $$select public.submit_review(
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000012',
    'Coffee contains 80 mg of caffeine.',
    '[]'::jsonb,
    jsonb_set((select analysis from pg_temp.review_submission_fixture), '{findings,0,status}', '"invalid"'::jsonb)
  )$$,
  '23514', null,
  'An invalid finding fails after parent inserts are attempted'
);
select is(
  (select count(*) from public.draft_revisions where draft_id = '20000000-0000-4000-8000-000000000011'),
  1::bigint,
  'A finding failure rolls back its draft revision'
);
select is(
  (select count(*) from public.reviews where submission_request_id = '30000000-0000-4000-8000-000000000012'),
  0::bigint,
  'A finding failure rolls back its review and idempotency key'
);
select is(
  (select count(*) from public.findings f join public.reviews r on r.id = f.review_id where r.submission_request_id = '30000000-0000-4000-8000-000000000012'),
  0::bigint,
  'A failed submission leaves no findings'
);

select lives_ok(
  $$select public.submit_review(
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000013',
    'Coffee contains 80 mg of caffeine.',
    '[]'::jsonb,
    jsonb_set(
      jsonb_set((select analysis from pg_temp.review_submission_fixture), '{findings}', '[]'::jsonb),
      '{summary}', '{"supported":0,"contradicted":0,"outdated":0,"unverified":0}'::jsonb
    )
  )$$,
  'A second distinct submission succeeds after the rollback'
);
select is(
  (select dr.revision_number from public.reviews r join public.draft_revisions dr on dr.id = r.draft_revision_id where r.submission_request_id = '30000000-0000-4000-8000-000000000013'),
  2,
  'A subsequent submission receives the next revision number'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000012';
select lives_ok(
  $$select public.submit_review(
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000014',
    'Coffee contains 80 mg of caffeine.',
    '[]'::jsonb,
    jsonb_set(
      jsonb_set((select analysis from pg_temp.review_submission_fixture), '{findings}', '[]'::jsonb),
      '{summary}', '{"supported":0,"contradicted":0,"outdated":0,"unverified":0}'::jsonb
    )
  )$$,
  'Editor retains permission to submit a review'
);

set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000013';
select throws_ok(
  $$select public.submit_review(
    '10000000-0000-4000-8000-000000000011',
    '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000015',
    'Coffee contains 80 mg of caffeine.',
    '[]'::jsonb,
    (select analysis from pg_temp.review_submission_fixture)
  )$$,
  '42501', null,
  'Reviewer cannot submit a draft analysis'
);

select * from finish();
rollback;
