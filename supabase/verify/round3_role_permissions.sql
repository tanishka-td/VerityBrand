-- Read-only catalog and data checks for the Round 3 role-permission migration.
-- These queries inspect definitions and authorization state; they do not
-- simulate RLS as another user. Run behavioral coverage with supabase/tests.

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'workspace_members'
  and column_name in ('workspace_id', 'user_id', 'member_role', 'can_final_approve')
order by ordinal_position;

select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid in (
    'public.workspace_members'::regclass,
    'public.final_approvals'::regclass
  )
order by table_name::text, conname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'workspace_members',
    'approved_sources',
    'final_approvals'
  )
order by tablename, policyname;

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'workspace_members'
order by grantee, privilege_type;

select
  grantee,
  column_name,
  privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'workspace_members'
order by grantee, column_name, privilege_type;

select
  p.oid::regprocedure as function_name,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_get_functiondef(p.oid) as definition
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_workspace_member', 'has_workspace_role', 'validate_final_approval')
order by p.proname;

select workspace_id, user_id, member_role, can_final_approve
from public.workspace_members
where can_final_approve
order by workspace_id, user_id;
