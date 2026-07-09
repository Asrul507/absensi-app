create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  total_income numeric(14,2) not null default 0,
  total_deduction numeric(14,2) not null default 0,
  net_salary numeric(14,2) not null default 0,
  status text not null default 'Draft' check (status in ('Draft','Approved','Paid','Closed')),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, employee_id)
);
create index if not exists idx_payroll_runs_client_period on public.payroll_runs(client_id, period_id);
create index if not exists idx_payroll_runs_employee on public.payroll_runs(employee_id);
comment on table public.payroll_runs is 'Generated payroll header per employee and period. Version 1 calculates payroll components only.';
