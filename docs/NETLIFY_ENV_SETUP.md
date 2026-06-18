# Netlify ENV Setup untuk Supabase

Aplikasi frontend static hanya boleh memakai `SUPABASE_URL` dan `SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` hanya boleh dipakai server-side (Netlify Function / Supabase Edge Function), misalnya `netlify/functions/create-employee-account.js`.

## Environment variable Netlify

Isi di **Netlify → Site configuration → Environment variables**:

| Key | Nilai |
| --- | --- |
| `SUPABASE_URL` | base URL project Supabase, contoh placeholder `https://PROJECT.supabase.co` |
| `SUPABASE_ANON_KEY` | public anon key Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key Supabase, server-side only |

Jangan memakai URL dengan suffix `/rest/v1`. Client Supabase butuh base URL project saja.

## Secret scanning Netlify

`netlify.toml` mengatur `SECRETS_SCAN_OMIT_KEYS = "SUPABASE_URL,SUPABASE_ANON_KEY"` karena keduanya memang dipakai di frontend/public. Jangan tambahkan `SUPABASE_SERVICE_ROLE_KEY` ke omit list; jika key admin itu bocor ke repository atau build output, deploy harus tetap gagal.

## Redeploy setelah ENV berubah

1. Simpan perubahan ENV di Netlify.
2. Buka **Deploys**.
3. Pilih **Trigger deploy → Deploy site**.
4. Pastikan Netlify Function ikut ter-deploy dan membaca ENV terbaru.
