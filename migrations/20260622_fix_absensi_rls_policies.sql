-- Fix RLS policies for public.absensi approval scope.
-- Purpose: allow admin_all/admin_hr/admin to read and approve attendance rows within their scope.
-- Safe to run multiple times.

alter table if exists public.absensi enable row level security;

-- Remove only app-managed policy names from this migration.
drop policy if exists "absensi_select_scoped" on public.absensi;
drop policy if exists "absensi_update_scoped_admin" on public.absensi;

-- SELECT
-- super_admin: all rows
-- admin_all/admin_hr: rows in same client/office
-- admin: rows in same client/office + same department
-- staff: own rows only
create policy "absensi_select_scoped"
on public.absensi
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
          and public.absensi.client_id = actor.client_id
        )
        or (
          actor.role = 'admin'
          and public.absensi.client_id = actor.client_id
          and public.absensi.department_id is not distinct from actor.department_id
        )
        or (
          actor.role = 'staff'
          and public.absensi.user_id = actor.id
        )
      )
  )
);

-- UPDATE
-- Admins may approve/reject/update attendance rows inside their allowed scope.
-- The final row must remain in the same scope as the target employee profile.
create policy "absensi_update_scoped_admin"
on public.absensi
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
          and public.absensi.client_id = actor.client_id
        )
        or (
          actor.role = 'admin'
          and public.absensi.client_id = actor.client_id
          and public.absensi.department_id is not distinct from actor.department_id
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles actor
    left join public.profiles target on target.id = public.absensi.user_id
    where actor.id = auth.uid()
      and coalesce(actor.status_akun, 'Aktif') = 'Aktif'
      and (
        actor.role = 'super_admin'
        or (
          actor.role in ('admin_all', 'admin_hr')
          and public.absensi.client_id = actor.client_id
        )
        or (
          actor.role = 'admin'
          and public.absensi.client_id = actor.client_id
          and public.absensi.department_id is not distinct from actor.department_id
        )
      )
      and (
        target.id is null
        or (
          public.absensi.client_id = target.client_id
          and public.absensi.department_id is not distinct from target.department_id
        )
      )
  )
);
