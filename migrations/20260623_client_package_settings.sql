-- Feature: Client Package Settings
-- Tujuan:
-- - Super Admin/Owner dapat menentukan paket client: basic, standard, pro.
-- - Setiap client memiliki limit penggunaan sesuai paket.
-- - Migration ini hanya menambah kolom aman pada tabel clients.
-- - Tidak menghapus / rename kolom lama.

alter table public.clients
  add column if not exists package_type text not null default 'basic',
  add column if not exists max_employees integer not null default 30,
  add column if not exists max_admins integer not null default 1,
  add column if not exists max_departments integer not null default 1,
  add column if not exists max_locations integer not null default 1,
  add column if not exists max_gps_points integer not null default 1,
  add column if not exists subscription_status text not null default 'active',
  add column if not exists license_type text not null default 'one_time',
  add column if not exists license_start date not null default current_date,
  add column if not exists license_end date,
  add column if not exists package_notes text;

-- Pastikan nilai paket dan status tetap konsisten.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_package_type_check'
  ) then
    alter table public.clients
      add constraint clients_package_type_check
      check (package_type in ('basic', 'standard', 'pro'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_subscription_status_check'
  ) then
    alter table public.clients
      add constraint clients_subscription_status_check
      check (subscription_status in ('active', 'suspended', 'expired'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_license_type_check'
  ) then
    alter table public.clients
      add constraint clients_license_type_check
      check (license_type in ('one_time', 'monthly', 'yearly'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_package_limits_positive_check'
  ) then
    alter table public.clients
      add constraint clients_package_limits_positive_check
      check (
        max_employees > 0 and
        max_admins > 0 and
        max_departments > 0 and
        max_locations > 0 and
        max_gps_points > 0
      );
  end if;
end $$;

-- Backfill default limit berdasarkan package_type untuk data lama.
update public.clients
set
  package_type = coalesce(package_type, 'basic'),
  max_employees = case coalesce(package_type, 'basic')
    when 'pro' then 300
    when 'standard' then 100
    else 30
  end,
  max_admins = case coalesce(package_type, 'basic')
    when 'pro' then 10
    when 'standard' then 3
    else 1
  end,
  max_departments = case coalesce(package_type, 'basic')
    when 'pro' then 15
    when 'standard' then 5
    else 1
  end,
  max_locations = case coalesce(package_type, 'basic')
    when 'pro' then 3
    else 1
  end,
  max_gps_points = case coalesce(package_type, 'basic')
    when 'pro' then 10
    when 'standard' then 3
    else 1
  end,
  subscription_status = coalesce(subscription_status, 'active'),
  license_type = coalesce(license_type, 'one_time'),
  license_start = coalesce(license_start, current_date)
where package_type is null
   or max_employees is null
   or max_admins is null
   or max_departments is null
   or max_locations is null
   or max_gps_points is null
   or subscription_status is null
   or license_type is null
   or license_start is null;

comment on column public.clients.package_type is 'Paket client: basic, standard, pro.';
comment on column public.clients.max_employees is 'Limit maksimal karyawan aktif sesuai paket.';
comment on column public.clients.max_admins is 'Limit maksimal akun admin/HR sesuai paket.';
comment on column public.clients.max_departments is 'Limit maksimal department sesuai paket.';
comment on column public.clients.max_locations is 'Limit maksimal lokasi/site sesuai paket.';
comment on column public.clients.max_gps_points is 'Limit maksimal titik radius GPS sesuai paket.';
comment on column public.clients.subscription_status is 'Status lisensi client: active, suspended, expired.';
comment on column public.clients.license_type is 'Jenis lisensi: one_time, monthly, yearly.';