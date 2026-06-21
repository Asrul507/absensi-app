-- Additive safety columns/indexes for scoped attendance reports.
alter table public.absensi
  add column if not exists client_id uuid references public.clients(id);

alter table public.absensi
  add column if not exists department_id uuid references public.departments(id);

update public.absensi a
set
  client_id = coalesce(a.client_id, p.client_id),
  department_id = coalesce(a.department_id, p.department_id)
from public.profiles p
where a.user_id = p.id
  and (a.client_id is null or a.department_id is null);

create index if not exists idx_absensi_client_department_tanggal
on public.absensi(client_id, department_id, tanggal);

create index if not exists idx_absensi_user_tanggal
on public.absensi(user_id, tanggal);
