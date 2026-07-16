-- ============================================================
-- Migration: Payroll Tables – CREATE + RLS Policies
-- Requires helper functions from 20260618_fix_clients_departments_rls.sql:
--   current_app_role(), current_app_client_id(), is_super_admin()
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. CREATE TABLES (idempotent)
-- ──────────────────────────────────────────────

create table if not exists public.payroll_components (
  id          uuid primary key default gen_random_uuid(),
  office_id   uuid references public.clients(id) on delete cascade,
  kode_komponen text not null,
  nama_komponen text not null,
  jenis       text not null check (jenis in ('pemasukan', 'potongan')),
  created_at  timestamptz default now()
);

create table if not exists public.payroll_templates (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid references public.clients(id) on delete cascade,
  nama_template text not null,
  created_at    timestamptz default now()
);

create table if not exists public.payroll_template_details (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid references public.payroll_templates(id) on delete cascade,
  component_id uuid references public.payroll_components(id) on delete cascade,
  nominal      numeric not null default 0,
  created_at   timestamptz default now()
);

create table if not exists public.payroll_periods (
  id               uuid primary key default gen_random_uuid(),
  office_id        uuid references public.clients(id) on delete cascade,
  nama_periode     text not null,
  tanggal_mulai    date not null,
  tanggal_selesai  date not null,
  status           text not null default 'Open' check (status in ('Open', 'Closed')),
  created_at       timestamptz default now()
);

create table if not exists public.payroll_mappings (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  template_id     uuid references public.payroll_templates(id) on delete set null,
  nama_bank       text,
  nomor_rekening  text,
  created_at      timestamptz default now()
);

create table if not exists public.payroll_slips (
  id               uuid primary key default gen_random_uuid(),
  period_id        uuid references public.payroll_periods(id) on delete cascade,
  user_id          uuid references public.profiles(id) on delete cascade,
  total_pemasukan  numeric not null default 0,
  total_potongan   numeric not null default 0,
  gaji_bersih      numeric not null default 0,
  nama_bank        text,
  nomor_rekening   text,
  status           text not null default 'Belum Diapprove',
  created_at       timestamptz default now(),
  unique (period_id, user_id)
);

-- ──────────────────────────────────────────────
-- 2. ENABLE ROW LEVEL SECURITY
-- ──────────────────────────────────────────────

alter table public.payroll_components      enable row level security;
alter table public.payroll_templates       enable row level security;
alter table public.payroll_template_details enable row level security;
alter table public.payroll_periods         enable row level security;
alter table public.payroll_mappings        enable row level security;
alter table public.payroll_slips           enable row level security;

-- ──────────────────────────────────────────────
-- 3. payroll_components
-- ──────────────────────────────────────────────

drop policy if exists "payroll_components_select" on public.payroll_components;
create policy "payroll_components_select" on public.payroll_components
  for select to authenticated
  using (office_id = public.current_app_client_id() or public.is_super_admin());

drop policy if exists "payroll_components_insert" on public.payroll_components;
create policy "payroll_components_insert" on public.payroll_components
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  );

drop policy if exists "payroll_components_update" on public.payroll_components;
create policy "payroll_components_update" on public.payroll_components
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  )
  with check (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  );

drop policy if exists "payroll_components_delete" on public.payroll_components;
create policy "payroll_components_delete" on public.payroll_components
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  );

-- ──────────────────────────────────────────────
-- 4. payroll_templates
-- ──────────────────────────────────────────────

drop policy if exists "payroll_templates_select" on public.payroll_templates;
create policy "payroll_templates_select" on public.payroll_templates
  for select to authenticated
  using (office_id = public.current_app_client_id() or public.is_super_admin());

drop policy if exists "payroll_templates_insert" on public.payroll_templates;
create policy "payroll_templates_insert" on public.payroll_templates
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  );

drop policy if exists "payroll_templates_update" on public.payroll_templates;
create policy "payroll_templates_update" on public.payroll_templates
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  )
  with check (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  );

drop policy if exists "payroll_templates_delete" on public.payroll_templates;
create policy "payroll_templates_delete" on public.payroll_templates
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  );

-- ──────────────────────────────────────────────
-- 5. payroll_template_details (via template ownership)
-- ──────────────────────────────────────────────

drop policy if exists "payroll_template_details_select" on public.payroll_template_details;
create policy "payroll_template_details_select" on public.payroll_template_details
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.payroll_templates t
      where t.id = template_id and t.office_id = public.current_app_client_id()
    )
  );

drop policy if exists "payroll_template_details_insert" on public.payroll_template_details;
create policy "payroll_template_details_insert" on public.payroll_template_details
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.payroll_templates t
        where t.id = template_id and t.office_id = public.current_app_client_id()
      )
    )
  );

drop policy if exists "payroll_template_details_update" on public.payroll_template_details;
create policy "payroll_template_details_update" on public.payroll_template_details
  for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.payroll_templates t
        where t.id = template_id and t.office_id = public.current_app_client_id()
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.payroll_templates t
        where t.id = template_id and t.office_id = public.current_app_client_id()
      )
    )
  );

drop policy if exists "payroll_template_details_delete" on public.payroll_template_details;
create policy "payroll_template_details_delete" on public.payroll_template_details
  for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.payroll_templates t
        where t.id = template_id and t.office_id = public.current_app_client_id()
      )
    )
  );

-- ──────────────────────────────────────────────
-- 6. payroll_periods
-- ──────────────────────────────────────────────

drop policy if exists "payroll_periods_select" on public.payroll_periods;
create policy "payroll_periods_select" on public.payroll_periods
  for select to authenticated
  using (office_id = public.current_app_client_id() or public.is_super_admin());

drop policy if exists "payroll_periods_insert" on public.payroll_periods;
create policy "payroll_periods_insert" on public.payroll_periods
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  );

drop policy if exists "payroll_periods_update" on public.payroll_periods;
create policy "payroll_periods_update" on public.payroll_periods
  for update to authenticated
  using (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  )
  with check (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  );

drop policy if exists "payroll_periods_delete" on public.payroll_periods;
create policy "payroll_periods_delete" on public.payroll_periods
  for delete to authenticated
  using (
    public.is_super_admin()
    or (public.current_app_role() in ('admin_all', 'admin_hr') and office_id = public.current_app_client_id())
  );

-- ──────────────────────────────────────────────
-- 7. payroll_mappings (via employee's client_id)
-- ──────────────────────────────────────────────

drop policy if exists "payroll_mappings_select" on public.payroll_mappings;
create policy "payroll_mappings_select" on public.payroll_mappings
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.profiles p
        where p.id = user_id and p.client_id = public.current_app_client_id()
      )
    )
  );

drop policy if exists "payroll_mappings_insert" on public.payroll_mappings;
create policy "payroll_mappings_insert" on public.payroll_mappings
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.profiles p
        where p.id = user_id and p.client_id = public.current_app_client_id()
      )
    )
  );

drop policy if exists "payroll_mappings_update" on public.payroll_mappings;
create policy "payroll_mappings_update" on public.payroll_mappings
  for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.profiles p
        where p.id = user_id and p.client_id = public.current_app_client_id()
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.profiles p
        where p.id = user_id and p.client_id = public.current_app_client_id()
      )
    )
  );

drop policy if exists "payroll_mappings_delete" on public.payroll_mappings;
create policy "payroll_mappings_delete" on public.payroll_mappings
  for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.profiles p
        where p.id = user_id and p.client_id = public.current_app_client_id()
      )
    )
  );

-- ──────────────────────────────────────────────
-- 8. payroll_slips (via period's office_id; staff can view own slip)
-- ──────────────────────────────────────────────

drop policy if exists "payroll_slips_select" on public.payroll_slips;
create policy "payroll_slips_select" on public.payroll_slips
  for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.payroll_periods per
        where per.id = period_id and per.office_id = public.current_app_client_id()
      )
    )
  );

drop policy if exists "payroll_slips_insert" on public.payroll_slips;
create policy "payroll_slips_insert" on public.payroll_slips
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.payroll_periods per
        where per.id = period_id and per.office_id = public.current_app_client_id()
      )
    )
  );

drop policy if exists "payroll_slips_update" on public.payroll_slips;
create policy "payroll_slips_update" on public.payroll_slips
  for update to authenticated
  using (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.payroll_periods per
        where per.id = period_id and per.office_id = public.current_app_client_id()
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.payroll_periods per
        where per.id = period_id and per.office_id = public.current_app_client_id()
      )
    )
  );

drop policy if exists "payroll_slips_delete" on public.payroll_slips;
create policy "payroll_slips_delete" on public.payroll_slips
  for delete to authenticated
  using (
    public.is_super_admin()
    or (
      public.current_app_role() in ('admin_all', 'admin_hr')
      and exists (
        select 1 from public.payroll_periods per
        where per.id = period_id and per.office_id = public.current_app_client_id()
      )
    )
  );
