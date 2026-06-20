-- Safe additive migration for Office/Department scoped schedules and shifts.
alter table public.jadwal add column if not exists client_id uuid references public.clients(id);
alter table public.jadwal add column if not exists department_id uuid references public.departments(id);
alter table public.jadwal add column if not exists created_by uuid references public.profiles(id);
alter table public.jadwal add column if not exists updated_at timestamptz default now();

update public.jadwal j
set client_id = coalesce(j.client_id, p.client_id),
    department_id = coalesce(j.department_id, p.department_id)
from public.profiles p
where j.user_id = p.id
  and (j.client_id is null or j.department_id is null);

create index if not exists idx_jadwal_client_department_tanggal on public.jadwal(client_id, department_id, tanggal);
create index if not exists idx_jadwal_user_tanggal on public.jadwal(user_id, tanggal);

alter table public.shift add column if not exists client_id uuid references public.clients(id);
create index if not exists idx_shift_client_id on public.shift(client_id);

-- Backfill shift.client_id only when the tenant is unambiguous.
do $$
declare
  only_client uuid;
  client_count int;
begin
  select count(*) into client_count from public.clients where status = 'active';
  if client_count = 1 then
    select id into only_client from public.clients where status = 'active' limit 1;
    update public.shift set client_id = only_client where client_id is null;
  end if;
  -- If more than one active Office exists, legacy shift.client_id null rows are left as-is.
  -- Treat shift_missing_client_id > 0 as a data-warning, not a migration failure.
end $$;
