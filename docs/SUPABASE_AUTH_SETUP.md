# Supabase Auth Setup (Username Login)

Self-register dan email verification sudah dinonaktifkan. User tidak login memakai email publik, melainkan:

- `username`
- `password`
- `kode kantor/domain login` (kecuali `super_admin` global)

Akun dibuat oleh `super_admin` atau `admin_hr` melalui Netlify Function `create-employee-account`, yang memakai `SUPABASE_SERVICE_ROLE_KEY` dari environment server-side dan membuat Supabase Auth user dengan `email_confirm: true`.

## Catatan penting

- Jangan panggil `supabase.auth.signUp()` dari frontend.
- Jangan gunakan `emailRedirectTo` / callback verification untuk akun baru.
- Jangan menyimpan password awal di database.
- Jangan menaruh service role key di file browser/frontend.
- Internal Auth email mengikuti format `username@kodeclient.local`; untuk super admin global gunakan format konsisten seperti `username@global.local`.
