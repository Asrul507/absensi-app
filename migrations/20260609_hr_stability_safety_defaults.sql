-- HR stability safety defaults; aman dijalankan ulang dan tidak drop data lama.

alter table public.profiles
  add column if not exists tanggal_bergabung date,
  add column if not exists sisa_cuti integer not null default 0,
  add column if not exists role text not null default 'staff',
  add column if not exists status_akun text not null default 'Aktif';

alter table public.pengajuan
  add column if not exists status text not null default 'pending',
  add column if not exists total_hari integer,
  add column if not exists jumlah_hari integer not null default 1;

update public.pengajuan
set total_hari = coalesce(total_hari, jumlah_hari, 1)
where total_hari is null;

alter table public.pengajuan
  alter column total_hari set default 1;

alter table public.perbaikan_absen
  add column if not exists status text not null default 'pending';

alter table public.pending_profiles
  add column if not exists email text,
  add column if not exists status_akun text not null default 'Aktif',
  add column if not exists sisa_cuti integer not null default 0,
  add column if not exists foto_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pengajuan_jumlah_hari_positive'
  ) then
    alter table public.pengajuan
      add constraint pengajuan_jumlah_hari_positive check (jumlah_hari > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'pengajuan_total_hari_positive'
  ) then
    alter table public.pengajuan
      add constraint pengajuan_total_hari_positive check (total_hari is null or total_hari > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_sisa_cuti_non_negative'
  ) then
    alter table public.profiles
      add constraint profiles_sisa_cuti_non_negative check (sisa_cuti >= 0);
  end if;
end $$;

create or replace function public.sync_pengajuan_total_hari()
returns trigger as $$
begin
  new.total_hari := coalesce(new.total_hari, new.jumlah_hari, 1);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_pengajuan_total_hari on public.pengajuan;
create trigger trg_sync_pengajuan_total_hari
before insert or update on public.pengajuan
for each row execute function public.sync_pengajuan_total_hari();
