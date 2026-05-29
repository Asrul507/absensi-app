-- Server timestamp helper for attendance clients.
-- Required so browser/PC/HP clock changes cannot affect saved attendance time.

create or replace function public.get_server_time()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

alter table public.absensi
  alter column waktu_masuk set default now();
