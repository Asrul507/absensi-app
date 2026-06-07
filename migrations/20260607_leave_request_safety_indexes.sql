-- Leave request safety/performance indexes.
-- Mendukung validasi bentrok tanggal pengajuan dan upsert jadwal cuti setelah approval.

create index if not exists idx_pengajuan_user_status_tanggal
  on public.pengajuan(user_id, status, tanggal_mulai, tanggal_selesai);

create index if not exists idx_pengajuan_status_created_at
  on public.pengajuan(status, created_at desc);

create index if not exists idx_jadwal_user_tanggal
  on public.jadwal(user_id, tanggal);

create index if not exists idx_jadwal_pengajuan_id
  on public.jadwal(pengajuan_id)
  where pengajuan_id is not null;
