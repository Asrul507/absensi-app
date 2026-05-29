-- Contract-based Annual Leave
-- Jalankan setelah migration Cuti Tahunan V1.
-- Migration ini menambahkan data kontrak di profiles/pending_profiles dan
-- mengubah cuti_tahunan agar periodenya mengikuti kontrak aktif.

alter table public.profiles
  add column if not exists jenis_kontrak text,
  add column if not exists kontrak_mulai date,
  add column if not exists durasi_kontrak integer,
  add column if not exists satuan_durasi_kontrak text default 'bulan',
  add column if not exists masa_kontrak text,
  add column if not exists kontrak_berakhir date,
  add column if not exists status_kontrak text default 'aktif';

alter table public.pending_profiles
  add column if not exists jenis_kontrak text,
  add column if not exists kontrak_mulai date,
  add column if not exists durasi_kontrak integer,
  add column if not exists satuan_durasi_kontrak text default 'bulan',
  add column if not exists masa_kontrak text,
  add column if not exists kontrak_berakhir date,
  add column if not exists status_kontrak text default 'aktif';

alter table public.profiles
  drop constraint if exists profiles_jenis_kontrak_check,
  add constraint profiles_jenis_kontrak_check
    check (jenis_kontrak is null or jenis_kontrak in ('kontrak', 'tetap', 'probation', 'freelance', 'harian')),
  drop constraint if exists profiles_satuan_durasi_kontrak_check,
  add constraint profiles_satuan_durasi_kontrak_check
    check (satuan_durasi_kontrak in ('bulan', 'tahun')),
  drop constraint if exists profiles_status_kontrak_check,
  add constraint profiles_status_kontrak_check
    check (status_kontrak in ('aktif', 'akan_berakhir', 'berakhir'));

alter table public.pending_profiles
  drop constraint if exists pending_profiles_jenis_kontrak_check,
  add constraint pending_profiles_jenis_kontrak_check
    check (jenis_kontrak is null or jenis_kontrak in ('kontrak', 'tetap', 'probation', 'freelance', 'harian')),
  drop constraint if exists pending_profiles_satuan_durasi_kontrak_check,
  add constraint pending_profiles_satuan_durasi_kontrak_check
    check (satuan_durasi_kontrak in ('bulan', 'tahun')),
  drop constraint if exists pending_profiles_status_kontrak_check,
  add constraint pending_profiles_status_kontrak_check
    check (status_kontrak in ('aktif', 'akan_berakhir', 'berakhir'));

alter table public.cuti_tahunan
  add column if not exists kontrak_mulai date,
  add column if not exists kontrak_berakhir date;

alter table public.cuti_tahunan
  drop constraint if exists cuti_tahunan_status_check,
  add constraint cuti_tahunan_status_check check (status in (
    'BELUM_ELIGIBLE',
    'ELIGIBLE_MENUNGGU_APPROVAL_HR',
    'AKTIF',
    'HANGUS',
    'EXPIRED_KONTRAK'
  ));

alter table public.cuti_tahunan
  drop constraint if exists cuti_tahunan_unique_user_tahun;

create unique index if not exists idx_cuti_tahunan_unique_user_kontrak
  on public.cuti_tahunan(user_id, kontrak_mulai, kontrak_berakhir)
  where kontrak_mulai is not null and kontrak_berakhir is not null;

create index if not exists idx_cuti_tahunan_kontrak_mulai on public.cuti_tahunan(kontrak_mulai);
create index if not exists idx_cuti_tahunan_kontrak_berakhir on public.cuti_tahunan(kontrak_berakhir);
create index if not exists idx_profiles_status_kontrak on public.profiles(status_kontrak);
create index if not exists idx_profiles_kontrak_berakhir on public.profiles(kontrak_berakhir);

-- Perbarui policy deteksi agar status EXPIRED_KONTRAK tetap valid untuk kontrak yang sudah berakhir.
drop policy if exists "cuti_tahunan_insert_own_detection" on public.cuti_tahunan;
create policy "cuti_tahunan_insert_own_detection"
on public.cuti_tahunan
for insert
with check (
  auth.uid() = user_id
  and jatah_cuti = 0
  and sisa_cuti = 0
  and cuti_terpakai = 0
  and status in ('BELUM_ELIGIBLE', 'ELIGIBLE_MENUNGGU_APPROVAL_HR', 'EXPIRED_KONTRAK')
);

drop policy if exists "cuti_tahunan_update_own_detection" on public.cuti_tahunan;
create policy "cuti_tahunan_update_own_detection"
on public.cuti_tahunan
for update
using (auth.uid() = user_id and status in ('BELUM_ELIGIBLE', 'ELIGIBLE_MENUNGGU_APPROVAL_HR', 'AKTIF'))
with check (
  auth.uid() = user_id
  and status in ('BELUM_ELIGIBLE', 'ELIGIBLE_MENUNGGU_APPROVAL_HR', 'EXPIRED_KONTRAK')
  and (status <> 'EXPIRED_KONTRAK' or sisa_cuti = 0)
);
