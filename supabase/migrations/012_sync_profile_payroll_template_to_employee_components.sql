-- Sinkronisasi profiles.payroll_template_id ke employee_payroll_profiles + employee_payroll_components
-- Idempotent/safe: pakai create or replace + drop trigger if exists.

create or replace function public.sync_employee_payroll_from_profile_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is null then
    return new;
  end if;

  if new.payroll_template_id is null then
    delete from public.employee_payroll_profiles
    where employee_id = new.id;

    delete from public.employee_payroll_components
    where employee_id = new.id
      and coalesce(is_override, false) = false
      and coalesce(source, 'Template') = 'Template';

    return new;
  end if;

  insert into public.employee_payroll_profiles (employee_id, template_id, updated_at)
  values (new.id, new.payroll_template_id, now())
  on conflict (employee_id) do update
    set template_id = excluded.template_id,
        updated_at = now();

  insert into public.employee_payroll_components (
    employee_id,
    template_id,
    template_component_id,
    component_id,
    component_value,
    source,
    is_override,
    is_active,
    sort_order,
    created_at,
    updated_at
  )
  select
    new.id,
    new.payroll_template_id,
    tc.id,
    tc.component_id,
    tc.component_value,
    'Template',
    false,
    true,
    coalesce(tc.sort_order, 0),
    now(),
    now()
  from public.payroll_template_components tc
  where tc.template_id = new.payroll_template_id
  on conflict (employee_id, component_id) do update
    set template_id = excluded.template_id,
        template_component_id = excluded.template_component_id,
        component_value = excluded.component_value,
        source = 'Template',
        is_override = false,
        is_active = true,
        sort_order = excluded.sort_order,
        updated_at = now()
  where coalesce(public.employee_payroll_components.is_override, false) = false;

  delete from public.employee_payroll_components epc
  where epc.employee_id = new.id
    and coalesce(epc.is_override, false) = false
    and epc.template_id is not null
    and not exists (
      select 1
      from public.payroll_template_components tc
      where tc.template_id = new.payroll_template_id
        and tc.component_id = epc.component_id
    );

  return new;
end;
$$;

drop trigger if exists trg_sync_employee_payroll_from_profile_template on public.profiles;
create trigger trg_sync_employee_payroll_from_profile_template
after insert or update of payroll_template_id
on public.profiles
for each row
execute function public.sync_employee_payroll_from_profile_template();

-- Backfill aman: picu trigger untuk data existing yang sudah punya payroll_template_id.
update public.profiles
set payroll_template_id = payroll_template_id
where payroll_template_id is not null;
