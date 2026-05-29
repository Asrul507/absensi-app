-- Cuti Tahunan V1
-- Jalankan sekali di Supabase SQL Editor sebelum deploy UI fitur Cuti Tahunan V1.

create table if not exists public.cuti_tahunan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  nama text,
  tahun integer not null,
  periode_mulai date,
  periode_selesai date,
  jatah_cuti integer not null default 0,
  sisa_cuti integer not null default 0,
  cuti_terpakai integer not null default 0,
  status text not null default 'BELUM_ELIGIBLE',
  approved_by uuid null references public.profiles(id) on delete set null,
  approved_at timestamptz null,
  expired_at timestamptz null,
  sisa_cuti_hangus integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cuti_tahunan_status_check check (status in (
    'BELUM_ELIGIBLE',
    'ELIGIBLE_MENUNGGU_APPROVAL_HR',
    'AKTIF',
    'HANGUS'
  )),
  constraint cuti_tahunan_jatah_check check (jatah_cuti >= 0),
  constraint cuti_tahunan_sisa_check check (sisa_cuti >= 0),
  constraint cuti_tahunan_terpakai_check check (cuti_terpakai >= 0),
  constraint cuti_tahunan_unique_user_tahun unique (user_id, tahun)
);

alter table public.profiles
  add column if not exists jatah_cuti_tahunan integer not null default 0,
  add column if not exists cuti_terpakai integer not null default 0;

-- Beberapa versi lama aplikasi memakai profiles.jatah_cuti sebagai ringkasan saldo.
alter table public.profiles
  add column if not exists jatah_cuti integer not null default 0,
  add column if not exists sisa_cuti integer not null default 0;

create index if not exists idx_cuti_tahunan_user_id on public.cuti_tahunan(user_id);
create index if not exists idx_cuti_tahunan_tahun on public.cuti_tahunan(tahun);
create index if not exists idx_cuti_tahunan_status on public.cuti_tahunan(status);
create index if not exists idx_cuti_tahunan_periode_selesai on public.cuti_tahunan(periode_selesai);

create or replace function public.set_cuti_tahunan_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cuti_tahunan_updated_at on public.cuti_tahunan;
create trigger trg_cuti_tahunan_updated_at
before update on public.cuti_tahunan
for each row execute function public.set_cuti_tahunan_updated_at();

alter table public.cuti_tahunan enable row level security;

-- Staff hanya bisa membaca data cuti tahunannya sendiri.
drop policy if exists "cuti_tahunan_select_own_or_admin" on public.cuti_tahunan;
create policy "cuti_tahunan_select_own_or_admin"
on public.cuti_tahunan
for select
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin', 'hr')
  )
);

-- HR/admin mengelola semua record jatah tahunan; staff tidak bisa approve/mengubah saldo.
drop policy if exists "cuti_tahunan_admin_all" on public.cuti_tahunan;
create policy "cuti_tahunan_admin_all"
on public.cuti_tahunan
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin', 'hr')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin', 'hr')
  )
);

-- Izinkan user login membuat record deteksi awal untuk dirinya sendiri (tanpa saldo aktif).
drop policy if exists "cuti_tahunan_insert_own_detection" on public.cuti_tahunan;
create policy "cuti_tahunan_insert_own_detection"
on public.cuti_tahunan
for insert
with check (
  auth.uid() = user_id
  and jatah_cuti = 0
  and sisa_cuti = 0
  and cuti_terpakai = 0
  and status in ('BELUM_ELIGIBLE', 'ELIGIBLE_MENUNGGU_APPROVAL_HR')
);

-- Izinkan user memperbarui record deteksi miliknya dari BELUM_ELIGIBLE ke
-- ELIGIBLE_MENUNGGU_APPROVAL_HR tanpa mengubah saldo.
drop policy if exists "cuti_tahunan_update_own_detection" on public.cuti_tahunan;
create policy "cuti_tahunan_update_own_detection"
on public.cuti_tahunan
for update
using (auth.uid() = user_id and status = 'BELUM_ELIGIBLE')
with check (
  auth.uid() = user_id
  and jatah_cuti = 0
  and sisa_cuti = 0
  and cuti_terpakai = 0
  and status in ('BELUM_ELIGIBLE', 'ELIGIBLE_MENUNGGU_APPROVAL_HR')
);
