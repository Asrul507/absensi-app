-- Fix RLS policies for public.jadwal management.
-- Purpose: allow authorized admins to create/update schedules for employees in their allowed scope.
-- Safe to run multiple times.

alter table if exists public.jadwal enable row level security;

-- Remove previous app-managed jadwal policies if they exist.
drop policy if exists "jadwal_select_scoped" on public.jadwal;
drop policy if exists "jadwal_insert_scoped_admin" on public.jadwal;
drop policy if exists "jadwal_update_scoped_admin" on public.jadwal;
drop policy if exists "jadwal_delete_scoped_admin" on public.jadwal;

-- SELECT
-- super_admin: all rows
-- admin_all/admin_hr: rows in same client
-- admin: rows in same client + same department
-- staff: own schedule rows
create policy "jadwal_select_scoped"
on public.jadwal
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and coalesce(actor.status_akun, 'Aktif') = 'Aktif'
      and (
        actor.role = 'super_admin'
        or (
          actor.role in ('admin_all', 'admin_hr')
          and public.jadwal.client_id = actor.client_id
        )
        or (
          actor.role = 'admin'
          and public.jadwal.client_id = actor.client_id
          and public.jadwal.department_id is not distinct from actor.department_id
        )
        or (
          actor.role = 'staff'
          and public.jadwal.user_id = actor.id
        )
      )
  )
);

-- INSERT
-- Admins may insert schedules only for employees they are allowed to manage.
-- The inserted row must carry the same client_id/department_id as the target employee.
create policy "jadwal_insert_scoped_admin"
on public.jadwal
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles actor
    join public.profiles target on target.id = public.jadwal.user_id
    where actor.id = auth.uid()
      and coalesce(actor.status_akun, 'Aktif') = 'Aktif'
      and coalesce(target.status_akun, 'Aktif') = 'Aktif'
      and public.jadwal.client_id = target.client_id
      and public.jadwal.department_id is not distinct from target.department_id
      and (
        actor.role = 'super_admin'
        or (
          actor.role in ('admin_all', 'admin_hr')
          and target.client_id = actor.client_id
        )
        or (
          actor.role = 'admin'
          and target.client_id = actor.client_id
          and target.department_id is not distinct from actor.department_id
        )
      )
  )
);

-- UPDATE
-- Admins may update existing jadwal rows only inside their allowed scope,
-- and the final row must still match the target employee scope.
create policy "jadwal_update_scoped_admin"
on public.jadwal
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and coalesce(actor.status_akun, 'Aktif') = 'Aktif'
      and (
        actor.role = 'super_admin'
        or (
          actor.role in ('admin_all', 'admin_hr')
          and public.jadwal.client_id = actor.client_id
        )
        or (
          actor.role = 'admin'
          and public.jadwal.client_id = actor.client_id
          and public.jadwal.department_id is not distinct from actor.department_id
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles actor
    join public.profiles target on target.id = public.jadwal.user_id
    where actor.id = auth.uid()
      and coalesce(actor.status_akun, 'Aktif') = 'Aktif'
      and coalesce(target.status_akun, 'Aktif') = 'Aktif'
      and public.jadwal.client_id = target.client_id
      and public.jadwal.department_id is not distinct from target.department_id
      and (
        actor.role = 'super_admin'
        or (
          actor.role in ('admin_all', 'admin_hr')
          and target.client_id = actor.client_id
        )
        or (
          actor.role = 'admin'
          and target.client_id = actor.client_id
          and target.department_id is not distinct from actor.department_id
        )
      )
  )
);

-- DELETE
-- Kept available for schedule correction/cleanup by authorized admins.
create policy "jadwal_delete_scoped_admin"
on public.jadwal
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and coalesce(actor.status_akun, 'Aktif') = 'Aktif'
      and (
        actor.role = 'super_admin'
        or (
          actor.role in ('admin_all', 'admin_hr')
          and public.jadwal.client_id = actor.client_id
        )
        or (
          actor.role = 'admin'
          and public.jadwal.client_id = actor.client_id
          and public.jadwal.department_id is not distinct from actor.department_id
        )
      )
  )
);
