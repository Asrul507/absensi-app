-- Username login + HR-created accounts. Safe/additive migration.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists email_internal text;
alter table public.profiles add column if not exists must_change_password boolean default true;
alter table public.profiles add column if not exists password_changed_at timestamptz;
alter table public.profiles add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists client_id uuid references public.clients(id) on delete restrict;
alter table public.profiles add column if not exists department_id uuid references public.departments(id) on delete set null;

update public.profiles
set username = lower(regexp_replace(split_part(coalesce(email, email_internal, id::text), '@', 1), '[^a-z0-9._-]+', '_', 'g'))
where nullif(trim(coalesce(username, '')), '') is null;

update public.profiles p
set email_internal = case
  when p.role = 'super_admin' and nullif(trim(p.email_internal), '') is null then lower(p.username) || '@global.local'
  when c.kode_client is not null and nullif(trim(p.email_internal), '') is null then lower(p.username) || '@' || lower(c.kode_client) || '.local'
  else coalesce(p.email_internal, p.email)
end
from public.clients c
where p.client_id = c.id
  and nullif(trim(coalesce(p.email_internal, '')), '') is null;

update public.profiles
set email_internal = coalesce(email_internal, email, lower(username) || '@global.local')
where nullif(trim(coalesce(email_internal, '')), '') is null;

create unique index if not exists profiles_client_username_unique on public.profiles(client_id, username) where username is not null;
create unique index if not exists profiles_email_internal_unique on public.profiles(email_internal) where email_internal is not null;
create index if not exists idx_profiles_client_id on public.profiles(client_id);
create index if not exists idx_profiles_department_id on public.profiles(department_id);
create index if not exists idx_profiles_username on public.profiles(username);

insert into public.clients (nama_client, kode_client, domain_login, status)
values ('Kantor A', 'kantora', '@kantora', 'active')
on conflict (kode_client) do update set nama_client=excluded.nama_client, domain_login=excluded.domain_login, status='active', updated_at=now();

insert into public.departments (client_id, nama_department, status)
select c.id, d.nama_department, 'active'
from public.clients c
cross join (values ('Housekeeping'), ('HRD'), ('Security'), ('Engineering')) as d(nama_department)
where c.kode_client = 'kantora'
on conflict (client_id, nama_department) do update set status='active', updated_at=now();

alter table public.profiles enable row level security;
drop policy if exists "profiles_username_tenant_select" on public.profiles;
create policy "profiles_username_tenant_select" on public.profiles for select to authenticated using (
  public.is_super_admin() or id = auth.uid() or client_id = public.current_app_client_id()
);
drop policy if exists "profiles_self_password_update" on public.profiles;
create policy "profiles_self_password_update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
