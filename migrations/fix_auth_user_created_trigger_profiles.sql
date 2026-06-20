-- Fix auth.users -> public.profiles trigger after username/client_id refactor.
-- Safe for manual Supabase Auth user creation, including global super_admin users
-- that intentionally do not belong to a client/department.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  user_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  profile_role text := coalesce(nullif(trim(user_meta->>'role'), ''), 'staff');
  profile_username text := lower(regexp_replace(
    coalesce(
      nullif(trim(user_meta->>'username'), ''),
      nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'user_' || replace(left(new.id::text, 8), '-', '')
    ),
    '[^a-z0-9._-]+',
    '_',
    'g'
  ));
  profile_email text := lower(nullif(trim(new.email), ''));
  profile_name text := coalesce(
    nullif(trim(user_meta->>'nama_lengkap'), ''),
    nullif(trim(user_meta->>'name'), ''),
    profile_username
  );
  profile_client_id uuid := null;
  profile_department_id uuid := null;
begin
  if profile_role not in ('super_admin', 'admin_all', 'admin_hr', 'admin', 'staff') then
    profile_role := 'staff';
  end if;

  begin
    profile_client_id := nullif(trim(user_meta->>'client_id'), '')::uuid;
  exception when invalid_text_representation then
    profile_client_id := null;
  end;

  begin
    profile_department_id := nullif(trim(user_meta->>'department_id'), '')::uuid;
  exception when invalid_text_representation then
    profile_department_id := null;
  end;

  -- Global super_admin accounts are intentionally allowed to have no tenant.
  if profile_role = 'super_admin' then
    profile_client_id := null;
    profile_department_id := null;
  end if;

  insert into public.profiles (
    id,
    username,
    email_internal,
    email,
    nama_lengkap,
    role,
    status_akun,
    client_id,
    department_id
  ) values (
    new.id,
    profile_username,
    profile_email,
    profile_email,
    profile_name,
    profile_role,
    'Aktif',
    profile_client_id,
    profile_department_id
  )
  on conflict (id) do update set
    username = coalesce(nullif(public.profiles.username, ''), excluded.username),
    email_internal = coalesce(nullif(public.profiles.email_internal, ''), excluded.email_internal),
    email = coalesce(nullif(public.profiles.email, ''), excluded.email),
    nama_lengkap = coalesce(nullif(public.profiles.nama_lengkap, ''), excluded.nama_lengkap),
    role = coalesce(nullif(public.profiles.role, ''), excluded.role),
    status_akun = coalesce(nullif(public.profiles.status_akun, ''), excluded.status_akun),
    client_id = coalesce(public.profiles.client_id, excluded.client_id),
    department_id = coalesce(public.profiles.department_id, excluded.department_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
