create table if not exists public.payroll_template_components (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.payroll_templates(id) on delete cascade,
  component_id uuid not null references public.payroll_components(id) on delete restrict,
  component_value numeric(14,2) not null default 0 check (component_value >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, component_id)
);
create index if not exists idx_template_components_template_sort on public.payroll_template_components(template_id, sort_order);
comment on table public.payroll_template_components is 'Component values attached to payroll templates.';
