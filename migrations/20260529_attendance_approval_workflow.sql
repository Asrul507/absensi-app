-- Attendance Approval Workflow
-- Jalankan sekali di Supabase SQL Editor sebelum deploy UI baru.

alter table public.absensi
  add column if not exists status_kehadiran text default 'MENUNGGU_VERIFIKASI',
  add column if not exists approved_by uuid null,
  add column if not exists approved_at timestamptz null,
  add column if not exists approval_note text null,
  add column if not exists radius_status text default 'VALID',
  add column if not exists approval_flag text null,
  add column if not exists jam_jadwal_pulang text null;

-- Normalisasi status lama ke dua layer baru tanpa menghapus data historis.
update public.absensi
set status_absensi = 'OPEN'
where status_absensi is null or lower(status_absensi) in ('open', 'lupa absen pulang', 'lupa absen datang', 'salah absen');

update public.absensi
set status_absensi = 'COMPLETE'
where lower(status_absensi) in ('complete', 'approved manual');

update public.absensi
set status_kehadiran = 'MENUNGGU_VERIFIKASI'
where status_kehadiran is null and status_absensi = 'OPEN';

update public.absensi
set radius_status = 'OUT_RADIUS'
where radius_status is null
   or lower(coalesce(lokasi_masuk, '')) like '%luar radius%'
   or lower(coalesce(lokasi_masuk, '')) like '%testing%'
   or lower(coalesce(lokasi_pulang, '')) like '%luar radius%'
   or lower(coalesce(lokasi_pulang, '')) like '%testing%';

update public.absensi
set radius_status = 'VALID'
where radius_status is null;

alter table public.absensi
  alter column status_absensi set default 'OPEN',
  alter column status_kehadiran set default 'MENUNGGU_VERIFIKASI',
  alter column radius_status set default 'VALID';

alter table public.absensi
  drop constraint if exists absensi_status_absensi_check,
  add constraint absensi_status_absensi_check
    check (status_absensi in ('OPEN', 'COMPLETE', 'REJECTED'));

alter table public.absensi
  drop constraint if exists absensi_status_kehadiran_check,
  add constraint absensi_status_kehadiran_check
    check (status_kehadiran in (
      'MENUNGGU_VERIFIKASI', 'HADIR', 'TERLAMBAT', 'PULANG_CEPAT',
      'LUPA_ABSEN_MASUK', 'LUPA_ABSEN_PULANG', 'CUTI', 'IZIN', 'SAKIT', 'OFF'
    ));

alter table public.absensi
  drop constraint if exists absensi_radius_status_check,
  add constraint absensi_radius_status_check
    check (radius_status in ('VALID', 'OUT_RADIUS'));

create index if not exists idx_absensi_status_absensi on public.absensi(status_absensi);
create index if not exists idx_absensi_status_kehadiran on public.absensi(status_kehadiran);
create index if not exists idx_absensi_radius_status on public.absensi(radius_status);
