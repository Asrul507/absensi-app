-- Annual Leave Contract Eligibility + Extend History
-- Jalankan setelah migration contract-based annual leave.

alter table public.cuti_tahunan
  drop constraint if exists cuti_tahunan_status_check,
  add constraint cuti_tahunan_status_check check (status in (
    'BELUM_ELIGIBLE',
    'TIDAK_ELIGIBLE',
    'ELIGIBLE_MENUNGGU_APPROVAL_HR',
    'AKTIF',
    'HANGUS',
    'EXPIRED_KONTRAK'
  ));

create table if not exists public.cuti_extend_history (
  id uuid primary key default gen_random_uuid(),
  cuti_tahunan_id uuid not null references public.cuti_tahunan(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  extended_months integer not null check (extended_months > 0),
  old_periode_selesai date not null,
  new_periode_selesai date not null,
  reason text not null,
  extended_by uuid not null references public.profiles(id) on delete restrict,
  extended_at timestamptz not null default now()
);

create index if not exists idx_cuti_extend_history_cuti_id on public.cuti_extend_history(cuti_tahunan_id);
create index if not exists idx_cuti_extend_history_user_id on public.cuti_extend_history(user_id);
create index if not exists idx_cuti_extend_history_extended_by on public.cuti_extend_history(extended_by);

alter table public.cuti_extend_history enable row level security;

drop policy if exists "cuti_extend_history_select_own_or_admin" on public.cuti_extend_history;
create policy "cuti_extend_history_select_own_or_admin"
on public.cuti_extend_history
for select
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin', 'hr')
  )
);

drop policy if exists "cuti_extend_history_admin_insert" on public.cuti_extend_history;
create policy "cuti_extend_history_admin_insert"
on public.cuti_extend_history
for insert
with check (
  extended_by = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin', 'hr')
  )
);

-- Perbarui policy deteksi agar status TIDAK_ELIGIBLE bisa dibuat untuk kontrak harian/probation/freelance.
drop policy if exists "cuti_tahunan_insert_own_detection" on public.cuti_tahunan;
create policy "cuti_tahunan_insert_own_detection"
on public.cuti_tahunan
for insert
with check (
  auth.uid() = user_id
  and jatah_cuti = 0
  and sisa_cuti = 0
  and cuti_terpakai = 0
  and status in ('BELUM_ELIGIBLE', 'TIDAK_ELIGIBLE', 'ELIGIBLE_MENUNGGU_APPROVAL_HR', 'EXPIRED_KONTRAK')
);

drop policy if exists "cuti_tahunan_update_own_detection" on public.cuti_tahunan;
create policy "cuti_tahunan_update_own_detection"
on public.cuti_tahunan
for update
using (auth.uid() = user_id and status in ('BELUM_ELIGIBLE', 'TIDAK_ELIGIBLE', 'ELIGIBLE_MENUNGGU_APPROVAL_HR', 'AKTIF'))
with check (
  auth.uid() = user_id
  and status in ('BELUM_ELIGIBLE', 'TIDAK_ELIGIBLE', 'ELIGIBLE_MENUNGGU_APPROVAL_HR', 'EXPIRED_KONTRAK')
  and (status <> 'EXPIRED_KONTRAK' or sisa_cuti = 0)
);
