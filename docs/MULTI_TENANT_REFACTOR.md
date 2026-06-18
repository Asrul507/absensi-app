# Multi-Tenant HRIS Refactor Report

## Arsitektur saat ini

Aplikasi `absensi-app` adalah static HTML + JavaScript SPA tanpa build step. Browser langsung memuat modul ES dari folder `js/` dan memakai Supabase Auth + Supabase Database melalui public anon key di `js/supabase.js`.

Modul utama:

- `index.html`: shell login, topbar, sidebar, content SPA, dan bottom navigation.
- `js/app.js`: bootstrap aplikasi, cek session, menu, routing SPA, profil, data karyawan, dan personalia.
- `js/auth.js`: login/logout, registrasi dari `pending_profiles`, dan signup langsung.
- `js/access-control.js`: sebelum refactor hanya berisi helper scope departemen legacy; sekarang menjadi pusat role + tenant scope.
- Modul fitur: dashboard, absensi, pengajuan, perbaikan absen, jadwal, shift, rekap, kalender, laporan, lokasi, dan attendance approval.
- `migrations/`: SQL additive migration untuk Supabase.

## Masalah legacy yang ditemukan

- Role lama masih tersebar: `hr`, `spv`, `supervisor`.
- Scope akses lama berbasis `departemen` text dan belum berbasis `client_id`.
- Login belum meminta kode kantor/client.
- Menu belum punya Settings App untuk super admin.
- Banyak query fitur masih perlu dimigrasikan bertahap ke helper tenant terpusat.
- RLS policy lama di migration masih berbasis role lama pada sebagian tabel.

## Foundation refactor yang diterapkan

- Menambahkan migration foundation multi-tenant yang additive dan tidak menghapus data lama.
- Membuat tabel `clients` dan `departments`.
- Menambahkan `client_id` dan `department_id` ke tabel utama yang ada.
- Membuat default client `Default Company` dengan `kode_client = default` dan `domain_login = @default`.
- Backfill data lama ke default client.
- Mapping `profiles.departemen` legacy menjadi row di `departments` untuk default client.
- Normalisasi role menjadi: `super_admin`, `admin_all`, `admin_hr`, `admin`, `staff`.
- Mengganti helper access control menjadi helper terpusat sesuai scope tenant.
- Menambahkan validasi login kode kantor/domain login.
- Menambahkan tampilan client aktif di topbar.
- Menambahkan Settings App khusus `super_admin` untuk CRUD client dan department.

## File terdampak utama

- `migrations/20260618_multi_tenant_hris_foundation.sql`
- `js/access-control.js`
- `js/auth.js`
- `js/app.js`
- `js/settings-app.js`
- `index.html`
- `docs/MULTI_TENANT_REFACTOR.md`
- `docs/MIGRATION_GUIDE.md`

## Migration plan bertahap berikutnya

1. Jalankan migration foundation di Supabase staging.
2. Validasi data default client dan mapping department.
3. Uji login untuk setiap role pada `@default`.
4. Refactor query modul fitur satu per satu memakai `applyTenantFilter()`:
   - dashboard
   - absensi
   - pengajuan
   - approval
   - perbaikan absen
   - jadwal
   - shift
   - karyawan/profiles
   - rekap
   - kalender
   - laporan
5. Refactor approval flow ke status konsisten:
   - `draft`
   - `pending_admin`
   - `pending_hr`
   - `pending_admin_all`
   - `approved`
   - `rejected`
   - `cancelled`
6. Tambahkan migration RLS policy setelah smoke test frontend lulus.
7. Hapus sisa branch logic legacy role setelah semua modul sudah memakai helper pusat.

## Catatan keamanan

Frontend sekarang tidak lagi menjadi sumber kebenaran `client_id` untuk role selain `super_admin`. Namun enforcement penuh tetap wajib dilakukan dengan RLS/policy database setelah refactor query selesai dan tervalidasi di staging.
