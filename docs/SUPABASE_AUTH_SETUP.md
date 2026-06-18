# Supabase Auth Setup untuk Registrasi Daftar Tunggu

Dokumen ini wajib dicek saat flow **Daftar & Kirim Verifikasi** gagal di endpoint `/auth/v1/signup` dengan status `500`, `AuthRetryableFetchError`, atau pesan gagal mengirim email verifikasi.

## Akar Penyebab Umum

Registrasi daftar tunggu memakai Supabase Auth `signUp()` dari browser. Jika Supabase gagal mengirim email verifikasi, biasanya penyebabnya salah satu dari berikut:

1. **Site URL** di Supabase Auth belum sesuai domain aplikasi aktif.
2. **Redirect URLs** belum mencantumkan URL callback aplikasi.
3. **Email Templates** Supabase Auth tidak aktif/bermasalah.
4. **SMTP custom** belum benar atau provider email menolak pengiriman.

Aplikasi tidak boleh membuat `profiles` tanpa `auth.users.id`. Karena itu jika `signUp()` gagal, `pending_profiles` tetap `waiting` dan profile tidak dibuat.

## Setting Wajib di Supabase Dashboard

1. Buka **Supabase Dashboard**.
2. Pilih project absensi-app.
3. Masuk ke **Authentication**.
4. Buka **URL Configuration**.
5. Set **Site URL** ke domain aplikasi aktif, contoh:
   - `https://hrpro01.netlify.app`
   - atau domain production aktif yang dipakai user.
6. Tambahkan **Redirect URLs** berikut sesuai environment:
   - `https://hrpro01.netlify.app/callback.html`
   - `https://DOMAIN-PRODUCTION-AKTIF/callback.html`
   - `http://localhost:3000/callback.html`
   - `http://localhost:5173/callback.html`
   - `http://localhost:5500/callback.html`
7. Buka **Authentication → Email Templates**.
8. Pastikan template email confirmation aktif dan valid.
9. Jika memakai SMTP custom, buka **Authentication → SMTP Settings** dan pastikan:
   - Host benar.
   - Port benar.
   - Username/password benar.
   - Sender/from email terverifikasi di provider SMTP.
   - Provider tidak memblokir domain/email tujuan.

## Redirect di Frontend

Frontend harus memakai redirect dinamis:

```js
`${window.location.origin}/callback.html`
```

Jangan hardcode domain lama di `js/auth.js`. Domain seperti `https://hrpro01.netlify.app/callback.html` hanya boleh muncul di dokumentasi atau konfigurasi Supabase Dashboard.

## Behavior Aplikasi Saat Auth Email Gagal

Jika Supabase Auth gagal dengan status `500` / `AuthRetryableFetchError`:

1. UI menampilkan pesan bahwa masalah ada pada Supabase Auth email/redirect/SMTP.
2. `pending_profiles.status` tetap `waiting`.
3. `profiles` tidak dibuat tanpa `auth.users.id`.
4. Admin dapat memperbaiki konfigurasi Supabase, lalu user mencoba daftar ulang.

## Mode Development/Staging Tanpa Email Verification

Untuk kebutuhan demo/testing, gunakan script server/admin, bukan frontend browser:

```bash
SUPABASE_URL="https://PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="SERVICE_ROLE_KEY" \
node scripts/create-demo-users.js
```

Script tersebut memakai Supabase Admin API dengan service role key dan membuat user dengan `email_confirm: true`. Jangan menaruh service role key di frontend.
