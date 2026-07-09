create table if not exists public.payroll_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  template_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, template_name)
);
create index if not exists idx_payroll_templates_client on public.payroll_templates(client_id, is_active);
comment on table public.payroll_templates is 'Reusable payroll templates such as Housekeeping, Supervisor, Driver, Security, and Office Staff.';
