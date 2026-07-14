-- Fix: Izinkan super_admin mengakses semua tabel payroll.
-- Sebelumnya semua policy hanya mengizinkan admin_all/admin_hr, sehingga super_admin
-- diblokir RLS meski frontend sudah memperbolehkan akses.
-- Juga memperbaiki policy approval payroll_run_details yang tidak memeriksa paket.

-- 1. payroll_components
drop policy if exists "payroll_components_admin_all_hr_package" on public.payroll_components;
create policy "payroll_components_admin_all_hr_package"
on public.payroll_components for all to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and public.payroll_components.client_id = p.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and public.payroll_components.client_id = p.client_id
  )
);

-- 2. payroll_templates
drop policy if exists "payroll_templates_admin_all_hr_package" on public.payroll_templates;
create policy "payroll_templates_admin_all_hr_package"
on public.payroll_templates for all to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and public.payroll_templates.client_id = p.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and public.payroll_templates.client_id = p.client_id
  )
);

-- 3. payroll_template_components
drop policy if exists "payroll_template_components_admin_all_hr_package" on public.payroll_template_components;
create policy "payroll_template_components_admin_all_hr_package"
on public.payroll_template_components for all to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.payroll_templates t on t.id = public.payroll_template_components.template_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and t.client_id = p.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.payroll_templates t on t.id = public.payroll_template_components.template_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and t.client_id = p.client_id
  )
);

-- 4. employee_payroll_profiles
drop policy if exists "employee_payroll_profiles_admin_all_hr_package" on public.employee_payroll_profiles;
create policy "employee_payroll_profiles_admin_all_hr_package"
on public.employee_payroll_profiles for all to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.profiles target on target.id = public.employee_payroll_profiles.employee_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and target.client_id = p.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.profiles target on target.id = public.employee_payroll_profiles.employee_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and target.client_id = p.client_id
  )
);

-- 5. employee_payroll_components
drop policy if exists "employee_payroll_components_admin_all_hr_package" on public.employee_payroll_components;
create policy "employee_payroll_components_admin_all_hr_package"
on public.employee_payroll_components for all to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.profiles target on target.id = public.employee_payroll_components.employee_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and target.client_id = p.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.profiles target on target.id = public.employee_payroll_components.employee_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and target.client_id = p.client_id
  )
);

-- 6. payroll_periods
drop policy if exists "payroll_periods_admin_all_hr_package" on public.payroll_periods;
create policy "payroll_periods_admin_all_hr_package"
on public.payroll_periods for all to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and public.payroll_periods.client_id = p.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and public.payroll_periods.client_id = p.client_id
  )
);

-- 7. payroll_runs
drop policy if exists "payroll_runs_admin_all_hr_package" on public.payroll_runs;
create policy "payroll_runs_admin_all_hr_package"
on public.payroll_runs for all to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.profiles target on target.id = public.payroll_runs.employee_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and target.client_id = p.client_id
      and public.payroll_runs.client_id = p.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.profiles target on target.id = public.payroll_runs.employee_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and target.client_id = p.client_id
      and public.payroll_runs.client_id = p.client_id
  )
);

-- 8. payroll_run_details
drop policy if exists "payroll_run_details_admin_all_hr_package" on public.payroll_run_details;
create policy "payroll_run_details_admin_all_hr_package"
on public.payroll_run_details for all to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.payroll_runs pr on pr.id = public.payroll_run_details.payroll_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and pr.client_id = p.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.payroll_runs pr on pr.id = public.payroll_run_details.payroll_id
    where p.id = auth.uid()
      and p.role in ('admin_all','admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and pr.client_id = p.client_id
  )
);

-- 9. Perbaiki policy approval dari migration 010 yang tidak memeriksa paket Standard/Pro
--    dan tidak memvalidasi client_id. Policy lama membolehkan admin_all/admin_hr meng-approve
--    payroll milik client mana saja; sekarang dibatasi hanya client sendiri, paket Standard/Pro,
--    konsisten dengan policy lainnya. super_admin selalu bisa.
drop policy if exists "payroll_run_details_approval" on public.payroll_run_details;
create policy "payroll_run_details_approval"
on public.payroll_run_details for update to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.payroll_runs pr on pr.id = public.payroll_run_details.payroll_id
    where p.id = auth.uid()
      and p.role in ('admin_all', 'admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and pr.client_id = p.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles p
    join public.clients c on c.id = p.client_id
    join public.payroll_runs pr on pr.id = public.payroll_run_details.payroll_id
    where p.id = auth.uid()
      and p.role in ('admin_all', 'admin_hr')
      and lower(coalesce(c.package_type,'basic')) in ('standard','pro')
      and pr.client_id = p.client_id
  )
);
