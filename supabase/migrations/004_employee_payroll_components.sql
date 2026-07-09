create table if not exists public.employee_payroll_profiles (
  employee_id uuid primary key references public.profiles(id) on delete cascade,
  template_id uuid references public.payroll_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.employee_payroll_components (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid references public.payroll_templates(id) on delete set null,
  template_component_id uuid references public.payroll_template_components(id) on delete set null,
  component_id uuid not null references public.payroll_components(id) on delete restrict,
  component_value numeric(14,2) not null default 0 check (component_value >= 0),
  source text not null default 'Template' check (source in ('Template','Override')),
  is_override boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, component_id)
);
create index if not exists idx_employee_payroll_components_employee on public.employee_payroll_components(employee_id, sort_order);
create index if not exists idx_employee_payroll_components_template on public.employee_payroll_components(template_id) where is_override = false;
comment on table public.employee_payroll_components is 'Employee payroll components copied from templates or manually overridden. Override rows must not be overwritten by template updates.';
