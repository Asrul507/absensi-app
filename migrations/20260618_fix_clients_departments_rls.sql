-- Fix RLS for multi-tenant Settings App clients/departments.
-- Root cause: foundation migration created clients/departments but did not add policies,
-- so INSERT/UPDATE from the browser anon/auth role was blocked by RLS.

alter table public.clients enable row level security;
alter table public.departments enable row level security;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'anon')
$$;

create or replace function public.current_app_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (select p.client_id from public.profiles p where p.id = auth.uid())
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'super_admin'
$$;

-- Login needs to validate active client codes before an auth session exists.
drop policy if exists "clients_public_select_active" on public.clients;
create policy "clients_public_select_active"
on public.clients
for select
to anon, authenticated
using (status = 'active' or public.is_super_admin());

-- Only super_admin can create or mutate client rows.
drop policy if exists "clients_super_admin_insert" on public.clients;
create policy "clients_super_admin_insert"
on public.clients
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "clients_super_admin_update" on public.clients;
create policy "clients_super_admin_update"
on public.clients
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "clients_super_admin_delete" on public.clients;
create policy "clients_super_admin_delete"
on public.clients
for delete
to authenticated
using (public.is_super_admin());

-- Departments can be selected for active clients during login/register and by tenant users.
drop policy if exists "departments_public_select_active" on public.departments;
create policy "departments_public_select_active"
on public.departments
for select
to anon, authenticated
using (
  status = 'active'
  or public.is_super_admin()
  or client_id = public.current_app_client_id()
);

-- super_admin can manage all departments; tenant admins can manage only their own client departments.
drop policy if exists "departments_admin_insert" on public.departments;
create policy "departments_admin_insert"
on public.departments
for insert
to authenticated
with check (
  public.is_super_admin()
  or (public.current_app_role() in ('admin_all', 'admin_hr') and client_id = public.current_app_client_id())
);

drop policy if exists "departments_admin_update" on public.departments;
create policy "departments_admin_update"
on public.departments
for update
to authenticated
using (
  public.is_super_admin()
  or (public.current_app_role() in ('admin_all', 'admin_hr') and client_id = public.current_app_client_id())
)
with check (
  public.is_super_admin()
  or (public.current_app_role() in ('admin_all', 'admin_hr') and client_id = public.current_app_client_id())
);

drop policy if exists "departments_super_admin_delete" on public.departments;
create policy "departments_super_admin_delete"
on public.departments
for delete
to authenticated
using (public.is_super_admin());
