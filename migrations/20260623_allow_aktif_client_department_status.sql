-- Allow both Indonesian and English active/inactive status values used by legacy UI data.
-- Safe/idempotent: only relaxes checks; does not mutate existing rows.

alter table public.clients drop constraint if exists clients_status_check;
alter table public.clients
  add constraint clients_status_check
  check (status in ('active', 'inactive', 'aktif', 'nonaktif', 'non-aktif'));

alter table public.departments drop constraint if exists departments_status_check;
alter table public.departments
  add constraint departments_status_check
  check (status in ('active', 'inactive', 'aktif', 'nonaktif', 'non-aktif'));
