-- Add payroll type and salary fields to profiles
alter table public.profiles
  add column if not exists payroll_type text default null check (payroll_type is null or payroll_type in ('Harian', 'Bulanan Tetap')),
  add column if not exists gaji_per_hari numeric(14,2) default 0 check (gaji_per_hari >= 0),
  add column if not exists gaji_pokok_bulanan numeric(14,2) default 0 check (gaji_pokok_bulanan >= 0);

create index if not exists idx_profiles_payroll_type on public.profiles(payroll_type);

-- Update payroll_runs default status from Draft to OPEN
alter table public.payroll_runs
  alter column status set default 'OPEN',
  drop constraint if exists payroll_runs_status_check,
  add constraint payroll_runs_status_check check (status in ('OPEN', 'APPROVED', 'Paid', 'Closed'));

-- Add approval_status to payroll_run_details
alter table public.payroll_run_details
  add column if not exists approval_status text default 'OPEN' check (approval_status in ('OPEN', 'APPROVED')),
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz default null;

create index if not exists idx_payroll_run_details_approval_status on public.payroll_run_details(approval_status);
create index if not exists idx_payroll_run_details_payroll_approval on public.payroll_run_details(payroll_id, approval_status);

-- Trigger to auto-approve payroll header when all details are approved
create or replace function public.auto_approve_payroll_header()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_details integer;
  v_approved_details integer;
  v_payroll_id uuid;
begin
  if new.approval_status = 'APPROVED' then
    v_payroll_id = new.payroll_id;
    
    select count(*) into v_total_details
    from public.payroll_run_details
    where payroll_id = v_payroll_id;
    
    select count(*) into v_approved_details
    from public.payroll_run_details
    where payroll_id = v_payroll_id and approval_status = 'APPROVED';
    
    if v_total_details > 0 and v_total_details = v_approved_details then
      update public.payroll_runs
      set status = 'APPROVED', updated_at = now()
      where id = v_payroll_id and status != 'APPROVED';
    end if;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_auto_approve_payroll_header on public.payroll_run_details;
create trigger trg_auto_approve_payroll_header
after update of approval_status on public.payroll_run_details
for each row execute function public.auto_approve_payroll_header();

-- Prevent modification of APPROVED payroll
create or replace function public.prevent_approved_payroll_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.payroll_runs
  where id = new.id;
  
  if v_status = 'APPROVED' then
    raise exception 'Payroll yang sudah APPROVED tidak dapat diubah.';
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_prevent_approved_payroll_update on public.payroll_runs;
create trigger trg_prevent_approved_payroll_update
before update on public.payroll_runs
for each row execute function public.prevent_approved_payroll_modification();

drop trigger if exists trg_prevent_approved_payroll_detail_delete on public.payroll_run_details;
create trigger trg_prevent_approved_payroll_detail_delete
before delete on public.payroll_run_details
for each row execute function public.prevent_approved_payroll_modification();

-- RLS: Only admin_all/admin_hr can approve payroll details
create policy "payroll_run_details_approval"
on public.payroll_run_details for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin_all', 'admin_hr')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin_all', 'admin_hr')
  )
);

comment on column public.profiles.payroll_type is 'Tipe penggajian: Harian atau Bulanan Tetap. Hanya admin/HR/Super Admin yang dapat mengubah.';
comment on column public.profiles.gaji_per_hari is 'Gaji per hari untuk tipe Harian.';
comment on column public.profiles.gaji_pokok_bulanan is 'Gaji pokok bulanan untuk tipe Bulanan Tetap.';
comment on column public.payroll_run_details.approval_status is 'Status approval untuk setiap payroll detail: OPEN atau APPROVED.';
comment on column public.payroll_run_details.approved_by is 'User ID yang melakukan approval.';
comment on column public.payroll_run_details.approved_at is 'Waktu approval dilakukan.';
