-- Foundation migration for staged HRIS multi-client / multi-tenant refactor.
-- Safe by design: creates additive objects, backfills legacy data to default client, and normalizes roles.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  nama_client text not null,
  kode_client text not null unique,
  domain_login text not null unique,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint clients_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete restrict,
  nama_department text not null,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint departments_status_check check (status in ('active', 'inactive')),
  constraint departments_client_name_unique unique (client_id, nama_department)
);

insert into public.clients (nama_client, kode_client, domain_login, status)
values ('Default Company', 'default', '@default', 'active')
on conflict (kode_client) do update
set nama_client = excluded.nama_client,
    domain_login = excluded.domain_login,
    status = excluded.status,
    updated_at = now();

-- Add tenant columns only to tables that exist in the target database.
do $$
declare
  t text;
begin
  foreach t in array array['profiles','pending_profiles','absensi','pengajuan','pengajuan_cuti','perbaikan_absen','jadwal','shift','cuti_tahunan','lokasi_absen','audit_logs'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists client_id uuid references public.clients(id) on delete restrict', t);
      execute format('create index if not exists %I on public.%I(client_id)', 'idx_' || t || '_client_id', t);
    end if;
  end loop;

  foreach t in array array['profiles','pending_profiles','absensi','pengajuan','pengajuan_cuti','perbaikan_absen','jadwal','shift','cuti_tahunan','lokasi_absen'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists department_id uuid references public.departments(id) on delete set null', t);
      execute format('create index if not exists %I on public.%I(department_id)', 'idx_' || t || '_department_id', t);
    end if;
  end loop;
end $$;

-- Map legacy text departments to normalized departments for the default client.
insert into public.departments (client_id, nama_department, status)
select distinct c.id, trim(p.departemen), 'active'
from public.profiles p
cross join public.clients c
where c.kode_client = 'default'
  and nullif(trim(coalesce(p.departemen, '')), '') is not null
on conflict (client_id, nama_department) do nothing;

-- Backfill client_id to Default Company where null.
do $$
declare
  default_client uuid;
  t text;
begin
  select id into default_client from public.clients where kode_client = 'default';
  foreach t in array array['profiles','pending_profiles','absensi','pengajuan','pengajuan_cuti','perbaikan_absen','jadwal','shift','cuti_tahunan','lokasi_absen','audit_logs'] loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set client_id = $1 where client_id is null', t) using default_client;
    end if;
  end loop;
end $$;

-- Backfill normalized department_id from legacy profiles.departemen / pending_profiles.departemen when available.
update public.profiles p
set department_id = d.id
from public.departments d
where p.department_id is null
  and p.client_id = d.client_id
  and trim(coalesce(p.departemen, '')) = d.nama_department;

update public.pending_profiles p
set department_id = d.id
from public.departments d
where p.department_id is null
  and p.client_id = d.client_id
  and trim(coalesce(p.departemen, '')) = d.nama_department;

-- Normalize roles to the only roles recognized by the refactored app.
update public.profiles set role = 'admin_hr' where lower(role) = 'hr';
update public.profiles set role = 'admin' where lower(role) in ('spv', 'supervisor');
update public.profiles set role = 'staff' where role is null or lower(role) not in ('super_admin', 'admin_all', 'admin_hr', 'admin', 'staff');

update public.pending_profiles set role = 'admin_hr' where lower(role) = 'hr';
update public.pending_profiles set role = 'admin' where lower(role) in ('spv', 'supervisor');
update public.pending_profiles set role = 'staff' where role is null or lower(role) not in ('super_admin', 'admin_all', 'admin_hr', 'admin', 'staff');

alter table public.profiles drop constraint if exists profiles_role_new_check;
alter table public.profiles add constraint profiles_role_new_check check (role in ('super_admin', 'admin_all', 'admin_hr', 'admin', 'staff'));

alter table public.pending_profiles drop constraint if exists pending_profiles_role_new_check;
alter table public.pending_profiles add constraint pending_profiles_role_new_check check (role in ('super_admin', 'admin_all', 'admin_hr', 'admin', 'staff'));

-- RLS policy notes (not force-enabled here): policies should mirror app scope:
-- super_admin: all rows; admin_all/admin_hr: rows with same client_id; admin: same client_id and department_id; staff: own user_id/id only.
