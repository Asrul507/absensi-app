-- Tighten Payroll RLS: Payroll browser API is allowed only for Admin All/Admin HR
-- in the same Office/client and only when the Office package is Standard or Pro.

alter table public.payroll_components enable row level security;
alter table public.payroll_templates enable row level security;
alter table public.payroll_template_components enable row level security;
alter table public.employee_payroll_profiles enable row level security;
alter table public.employee_payroll_components enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_run_details enable row level security;

drop policy if exists "payroll_components_admin" on public.payroll_components;
drop policy if exists "payroll_templates_admin" on public.payroll_templates;
drop policy if exists "payroll_template_components_admin" on public.payroll_template_components;
drop policy if exists "employee_payroll_profiles_scoped" on public.employee_payroll_profiles;
drop policy if exists "employee_payroll_components_scoped" on public.employee_payroll_components;
drop policy if exists "payroll_periods_admin" on public.payroll_periods;
drop policy if exists "payroll_runs_scoped" on public.payroll_runs;
drop policy if exists "payroll_run_details_scoped" on public.payroll_run_details;

create policy "payroll_components_admin_all_hr_package"
on public.payroll_components for all to authenticated
using (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and public.payroll_components.client_id = p.client_id))
with check (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and public.payroll_components.client_id = p.client_id));

create policy "payroll_templates_admin_all_hr_package"
on public.payroll_templates for all to authenticated
using (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and public.payroll_templates.client_id = p.client_id))
with check (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and public.payroll_templates.client_id = p.client_id));

create policy "payroll_template_components_admin_all_hr_package"
on public.payroll_template_components for all to authenticated
using (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.payroll_templates t on t.id = public.payroll_template_components.template_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and t.client_id = p.client_id))
with check (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.payroll_templates t on t.id = public.payroll_template_components.template_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and t.client_id = p.client_id));

create policy "employee_payroll_profiles_admin_all_hr_package"
on public.employee_payroll_profiles for all to authenticated
using (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.profiles target on target.id = public.employee_payroll_profiles.employee_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and target.client_id = p.client_id))
with check (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.profiles target on target.id = public.employee_payroll_profiles.employee_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and target.client_id = p.client_id));

create policy "employee_payroll_components_admin_all_hr_package"
on public.employee_payroll_components for all to authenticated
using (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.profiles target on target.id = public.employee_payroll_components.employee_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and target.client_id = p.client_id))
with check (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.profiles target on target.id = public.employee_payroll_components.employee_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and target.client_id = p.client_id));

create policy "payroll_periods_admin_all_hr_package"
on public.payroll_periods for all to authenticated
using (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and public.payroll_periods.client_id = p.client_id))
with check (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and public.payroll_periods.client_id = p.client_id));

create policy "payroll_runs_admin_all_hr_package"
on public.payroll_runs for all to authenticated
using (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.profiles target on target.id = public.payroll_runs.employee_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and target.client_id = p.client_id and public.payroll_runs.client_id = p.client_id))
with check (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.profiles target on target.id = public.payroll_runs.employee_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and target.client_id = p.client_id and public.payroll_runs.client_id = p.client_id));

create policy "payroll_run_details_admin_all_hr_package"
on public.payroll_run_details for all to authenticated
using (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.payroll_runs pr on pr.id = public.payroll_run_details.payroll_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and pr.client_id = p.client_id))
with check (exists (select 1 from public.profiles p join public.clients c on c.id = p.client_id join public.payroll_runs pr on pr.id = public.payroll_run_details.payroll_id where p.id = auth.uid() and p.role in ('admin_all','admin_hr') and lower(coalesce(c.package_type,'basic')) in ('standard','pro') and pr.client_id = p.client_id));
