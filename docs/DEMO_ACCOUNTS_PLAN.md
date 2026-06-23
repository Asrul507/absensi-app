# Demo Accounts Plan — GenPro

Dokumen ini dipakai untuk menyiapkan akun demo per paket dan per role tanpa merusak akun `super_admin`.

## Prinsip aman

- Akun `super_admin` tidak dihapus.
- Client demo dibuat untuk Basic, Standard, dan Pro.
- Akun login demo dibuat melalui fitur resmi aplikasi / Netlify Function create account agar `auth.users` dan `profiles` sinkron.
- User lama non-super_admin sebaiknya dinonaktifkan dulu sebelum dihapus permanen.

## Password demo default

```text
Demo12345!
```

## Client Demo

| Paket | Nama Client | Kode Office | Domain Login | Department |
|---|---|---|---|---|
| Basic | Demo Basic Company | demobasic | @demobasic | General |
| Standard | Demo Standard Company | demostandard | @demostandard | HR & Operation |
| Pro | Demo Pro Company | demopro | @demopro | People & Culture |

## Akun Demo Paket Basic

| Role | Username | Office / Domain | Password |
|---|---|---|---|
| admin_all | basic_all | @demobasic | Demo12345! |
| admin_hr | basic_hr | @demobasic | Demo12345! |
| admin | basic_admin | @demobasic | Demo12345! |
| staff | basic_staff | @demobasic | Demo12345! |

## Akun Demo Paket Standard

| Role | Username | Office / Domain | Password |
|---|---|---|---|
| admin_all | standard_all | @demostandard | Demo12345! |
| admin_hr | standard_hr | @demostandard | Demo12345! |
| admin | standard_admin | @demostandard | Demo12345! |
| staff | standard_staff | @demostandard | Demo12345! |

## Akun Demo Paket Pro

| Role | Username | Office / Domain | Password |
|---|---|---|---|
| admin_all | pro_all | @demopro | Demo12345! |
| admin_hr | pro_hr | @demopro | Demo12345! |
| admin | pro_admin | @demopro | Demo12345! |
| staff | pro_staff | @demopro | Demo12345! |

## Urutan Setup Aman

1. Login sebagai `super_admin`.
2. Buka Developer Panel.
3. Buka Client & Package Settings.
4. Buat 3 client demo sesuai tabel di atas.
5. Buat 1 department untuk masing-masing client.
6. Buat akun role demo menggunakan form tambah karyawan resmi aplikasi.
7. Login dan test masing-masing paket.

## Catatan penting

Jika ingin menghapus user lama, lakukan setelah backup database. Penghapusan user Supabase Auth harus dilakukan lewat Supabase Admin API atau dashboard Supabase, bukan hanya delete dari tabel `profiles`, karena login user berada di `auth.users`.
