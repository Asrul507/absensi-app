create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  period_name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'Draft' check (status in ('Draft','Processing','Approved','Paid','Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (client_id, period_name)
);
create index if not exists idx_payroll_periods_client_dates on public.payroll_periods(client_id, start_date, end_date);
comment on table public.payroll_periods is 'Payroll processing periods with Draft, Processing, Approved, Paid, and Closed lifecycle.';
