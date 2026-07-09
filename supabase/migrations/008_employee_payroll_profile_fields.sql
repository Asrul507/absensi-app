-- Add employee-level payroll assignment and bank transfer fields.
-- Safe/additive: no existing column is modified or dropped.

alter table public.profiles
  add column if not exists payroll_template_id uuid references public.payroll_templates(id) on delete set null,
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_holder text;

create index if not exists idx_profiles_payroll_template_id on public.profiles(payroll_template_id);

alter table public.profiles drop constraint if exists profiles_bank_account_number_digits;
alter table public.profiles
  add constraint profiles_bank_account_number_digits
  check (bank_account_number is null or bank_account_number ~ '^[0-9]{1,34}$');

create or replace function public.validate_profile_payroll_template_office()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.payroll_template_id is not null or new.bank_name is not null or new.bank_account_number is not null or new.bank_account_holder is not null)
     and not exists (
       select 1 from public.clients c
       where c.id = new.client_id
         and lower(coalesce(c.package_type, 'basic')) in ('standard', 'pro')
     ) then
    raise exception 'Payroll employee fields hanya tersedia untuk paket Standard/Pro.';
  end if;

  if new.payroll_template_id is not null and not exists (
    select 1
    from public.payroll_templates t
    where t.id = new.payroll_template_id
      and t.client_id = new.client_id
      and t.is_active = true
  ) then
    raise exception 'Payroll Template tidak valid untuk Office employee ini.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_profile_payroll_template_office on public.profiles;
create trigger trg_validate_profile_payroll_template_office
before insert or update of payroll_template_id, client_id
on public.profiles
for each row execute function public.validate_profile_payroll_template_office();

comment on column public.profiles.payroll_template_id is 'Current payroll template assigned to employee; template must belong to the same Office/client.';
comment on column public.profiles.bank_name is 'Employee bank name for payroll transfer.';
comment on column public.profiles.bank_account_number is 'Employee bank account number; digits only, leading zeros allowed.';
comment on column public.profiles.bank_account_holder is 'Bank account holder name; may differ from employee name.';
