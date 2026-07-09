create table if not exists public.payroll_components (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  code text not null,
  component_name text not null,
  type text not null check (type in ('Income','Deduction')),
  input_type text not null check (input_type in ('Fixed Amount','Manual Amount')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, code)
);
create index if not exists idx_payroll_components_client_sort on public.payroll_components(client_id, sort_order);
comment on table public.payroll_components is 'Tenant-scoped master payroll components managed by HR.';
comment on column public.payroll_components.input_type is 'Fixed Amount or Manual Amount. Values are database-driven, never hardcoded in payroll processing.';
