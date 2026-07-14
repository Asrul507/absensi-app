-- Reconcile payroll statuses and preserve compatibility with existing seeded data.
-- Separate migration as requested.

-- 1) Ensure payroll_runs supports both legacy and new status labels.
alter table public.payroll_runs
  alter column status set default 'OPEN';

alter table public.payroll_runs
  drop constraint if exists payroll_runs_status_check;

alter table public.payroll_runs
  add constraint payroll_runs_status_check
  check (status in (
    'Draft', 'Approved', 'Paid', 'Closed',
    'OPEN', 'APPROVED'
  ));

-- 2) Ensure payroll_periods remains compatible (legacy + uppercase workflow if introduced by app logic).
alter table public.payroll_periods
  drop constraint if exists payroll_periods_status_check;

alter table public.payroll_periods
  add constraint payroll_periods_status_check
  check (status in (
    'Draft', 'Processing', 'Approved', 'Paid', 'Closed',
    'OPEN', 'PROCESSING', 'APPROVED'
  ));

-- 3) Normalize any currently invalid/null status rows safely.
update public.payroll_runs
set status = 'OPEN'
where status is null
   or status not in ('Draft','Approved','Paid','Closed','OPEN','APPROVED');

update public.payroll_periods
set status = 'OPEN'
where status is null
   or status not in ('Draft','Processing','Approved','Paid','Closed','OPEN','PROCESSING','APPROVED');

-- 4) Make approval metadata robust.
alter table public.payroll_run_details
  alter column approval_status set default 'OPEN';

alter table public.payroll_run_details
  drop constraint if exists payroll_run_details_approval_status_check;

alter table public.payroll_run_details
  add constraint payroll_run_details_approval_status_check
  check (approval_status in ('OPEN','APPROVED'));
