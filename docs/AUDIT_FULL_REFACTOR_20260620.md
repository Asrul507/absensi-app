# Audit Full Refactor Username + Office Scope (2026-06-20)

## Ringkasan bug yang ditemukan

1. Login Office masih menolak status Office `Aktif` dan hanya menerima `active`, sehingga data lama/berbahasa Indonesia bisa gagal login walaupun Office valid.
2. Pembentukan email internal karyawan dan bulk upload hanya memakai `clients.kode_client`; Office yang mengandalkan `domain_login` berisiko membuat email internal salah.
3. Context login dan beberapa pesan UI masih memakai label “Client”, tidak konsisten dengan istilah user-facing baru “Office”.
4. `getProfile()` hanya mengambil `profiles.*`, sehingga data relasi Office/Department tidak tersedia setelah login dan sebagian UI berisiko fallback ke ID mentah.
5. Scope `admin_all`/`admin_hr` pada helper manajemen user dapat menganggap target legacy tanpa `client_id` sebagai Office sendiri karena fallback ke `currentUser.client_id`.
6. Netlify Function create employee membuat Auth user sebelum insert profile tanpa rollback eksplisit jika insert `profiles` gagal.
7. Bulk create masih mencetak object error penuh saat gagal; audit keamanan meminta log ringkas tanpa risiko membocorkan payload sensitif.
8. Reset password server-side belum mengakomodasi `admin_all` dan `admin` Department sesuai scope role/Office/Department.

## Daftar file yang diubah

- `js/auth.js`
- `js/access-control.js`
- `js/users.js`
- `js/settings-app.js`
- `js/dashboard.js`
- `netlify/functions/create-employee-account.js`
- `netlify/functions/bulk-create-employee-accounts.js`
- `netlify/functions/reset-employee-password.js`
- `docs/AUDIT_FULL_REFACTOR_20260620.md`

## Catatan audit area yang sudah ada dan dipertahankan

- Login utama sudah memakai username + Office/domain + password, dengan super admin tanpa Office.
- Data Karyawan sudah terpusat di `js/app.js`, query profiles membawa relasi Office dan Department, serta UI pending/self-register sudah dinonaktifkan dari flow utama.
- Template upload karyawan sudah memakai kolom username, password awal, Office, Kode Office, Department, role, kontrak, dan validasi preview.
- Migration `20260618_username_login_hr_created_accounts.sql` sudah menambahkan unique index `profiles_client_username_unique` dan `profiles_email_internal_unique`.
- Migration jadwal/shift scope Office sudah bersifat additive dan tidak destructive.

## Known issues / batasan

- Smoke test end-to-end Supabase/Netlify tidak dijalankan karena tidak ada kredensial staging dan data demo live di environment ini.
- RLS penuh untuk semua tabel operasional masih bergantung pada migration yang sudah ada; audit ini tidak menghapus atau menulis ulang policy lama secara destructive.
- Beberapa dokumentasi historis masih menyebut istilah database `client` untuk menjelaskan schema internal `clients/client_id`; label UI runtime diarahkan ke “Office”.
