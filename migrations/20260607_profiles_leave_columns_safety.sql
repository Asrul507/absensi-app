-- Safety migration for employee profile and annual leave contract columns.
-- Aman dijalankan ulang: memastikan kolom yang dipakai UI karyawan dan logic cuti tersedia.

alter table public.profiles
  add column if not exists tanggal_bergabung date,
  add column if not exists jenis_kontrak text,
  add column if not exists kontrak_mulai date,
  add column if not exists durasi_kontrak integer,
  add column if not exists satuan_durasi_kontrak text default 'bulan',
  add column if not exists masa_kontrak text,
  add column if not exists kontrak_berakhir date,
  add column if not exists status_kontrak text default 'aktif';

alter table public.cuti_tahunan
  add column if not exists kontrak_mulai date,
  add column if not exists kontrak_berakhir date,
  add column if not exists periode_mulai date,
  add column if not exists periode_selesai date,
  add column if not exists jatah_cuti integer not null default 0,
  add column if not exists sisa_cuti integer not null default 0,
  add column if not exists cuti_terpakai integer not null default 0,
  add column if not exists approved_by uuid null references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz null,
  add column if not exists expired_at timestamptz null,
  add column if not exists sisa_cuti_hangus integer not null default 0;

create index if not exists idx_profiles_tanggal_bergabung on public.profiles(tanggal_bergabung);
create index if not exists idx_profiles_status_kontrak on public.profiles(status_kontrak);
create index if not exists idx_profiles_kontrak_berakhir on public.profiles(kontrak_berakhir);
