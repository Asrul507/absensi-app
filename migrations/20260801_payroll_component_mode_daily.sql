-- ============================================================
-- Migration: Payroll Flexible Component + Daily Salary Mode
-- Backward compatible for existing payroll data
-- ============================================================

-- 1) Template detail: nilai nominal / persen
alter table public.payroll_template_details
  add column if not exists tipe_nilai text;

update public.payroll_template_details
set tipe_nilai = 'nominal'
where tipe_nilai is null;

alter table public.payroll_template_details
  alter column tipe_nilai set default 'nominal',
  alter column tipe_nilai set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payroll_template_details_tipe_nilai_check'
  ) then
    alter table public.payroll_template_details
      add constraint payroll_template_details_tipe_nilai_check
      check (tipe_nilai in ('nominal', 'persen'));
  end if;
end $$;

-- 2) Mapping: mode bulanan / harian + hari kerja per bulan
alter table public.payroll_mappings
  add column if not exists salary_mode text,
  add column if not exists hari_kerja_per_bulan integer;

update public.payroll_mappings
set
  salary_mode = coalesce(salary_mode, 'bulanan'),
  hari_kerja_per_bulan = coalesce(hari_kerja_per_bulan, 26)
where salary_mode is null or hari_kerja_per_bulan is null;

alter table public.payroll_mappings
  alter column salary_mode set default 'bulanan',
  alter column salary_mode set not null,
  alter column hari_kerja_per_bulan set default 26,
  alter column hari_kerja_per_bulan set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payroll_mappings_salary_mode_check'
  ) then
    alter table public.payroll_mappings
      add constraint payroll_mappings_salary_mode_check
      check (salary_mode in ('bulanan', 'harian'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payroll_mappings_hari_kerja_per_bulan_check'
  ) then
    alter table public.payroll_mappings
      add constraint payroll_mappings_hari_kerja_per_bulan_check
      check (hari_kerja_per_bulan between 20 and 31);
  end if;
end $$;

-- 3) Slip snapshot: mode, hari kerja, gaji per hari, rincian komponen
alter table public.payroll_slips
  add column if not exists salary_mode text,
  add column if not exists hari_kerja_per_bulan integer,
  add column if not exists gaji_per_hari numeric,
  add column if not exists rincian_komponen jsonb;

update public.payroll_slips
set
  salary_mode = coalesce(salary_mode, 'bulanan'),
  hari_kerja_per_bulan = coalesce(hari_kerja_per_bulan, 26),
  gaji_per_hari = coalesce(gaji_per_hari, 0),
  rincian_komponen = coalesce(rincian_komponen, '[]'::jsonb)
where salary_mode is null
   or hari_kerja_per_bulan is null
   or gaji_per_hari is null
   or rincian_komponen is null;

alter table public.payroll_slips
  alter column salary_mode set default 'bulanan',
  alter column salary_mode set not null,
  alter column hari_kerja_per_bulan set default 26,
  alter column hari_kerja_per_bulan set not null,
  alter column gaji_per_hari set default 0,
  alter column gaji_per_hari set not null,
  alter column rincian_komponen set default '[]'::jsonb,
  alter column rincian_komponen set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payroll_slips_salary_mode_check'
  ) then
    alter table public.payroll_slips
      add constraint payroll_slips_salary_mode_check
      check (salary_mode in ('bulanan', 'harian'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payroll_slips_hari_kerja_per_bulan_check'
  ) then
    alter table public.payroll_slips
      add constraint payroll_slips_hari_kerja_per_bulan_check
      check (hari_kerja_per_bulan between 20 and 31);
  end if;
end $$;
