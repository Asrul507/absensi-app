# Migration Guide: Multi-Tenant HRIS Foundation

## Branch

`refactor/multi-tenant-hris`

## SQL migration

Jalankan migration berikut di Supabase staging terlebih dahulu:

```sql
migrations/20260618_multi_tenant_hris_foundation.sql
```

## Perubahan database

Migration membuat:

- `clients`
- `departments`

Migration menambahkan kolom berikut secara aman jika tabelnya ada:

- `client_id`
- `department_id` untuk tabel yang membutuhkan scope departemen

Tabel yang dicakup:

- `profiles`
- `pending_profiles`
- `absensi`
- `pengajuan`
- `pengajuan_cuti`
- `perbaikan_absen`
- `jadwal`
- `shift`
- `cuti_tahunan`
- `lokasi_absen`
- `audit_logs`

## Backfill data lama

Migration membuat default client:

- `nama_client`: `Default Company`
- `kode_client`: `default`
- `domain_login`: `@default`

Semua row lama dengan `client_id is null` diarahkan ke default client. Department legacy dari `profiles.departemen` dibuat sebagai row `departments` untuk default client, lalu `profiles.department_id` dan `pending_profiles.department_id` diisi jika cocok.

## Normalisasi role

Mapping otomatis:

- `hr` → `admin_hr`
- `spv` → `admin`
- `supervisor` → `admin`
- role kosong/tidak dikenal → `staff`

Role final yang valid:

- `super_admin`
- `admin_all`
- `admin_hr`
- `admin`
- `staff`

## Smoke test wajib

1. Login `staff` dengan kode `@default`.
2. Login `admin` dengan kode `@default`.
3. Login `admin_hr` dengan kode `@default`.
4. Login `admin_all` dengan kode `@default`.
5. Login `super_admin`.
6. Pastikan menu Settings App hanya tampil untuk `super_admin`.
7. Pastikan kode kantor salah menampilkan error ramah.
8. Pastikan akun non-super-admin dari client lain ditolak saat memilih client yang tidak sesuai.
9. Pastikan tambah client dan department bekerja dari Settings App.
10. Pastikan tidak ada error console di halaman login dan dashboard.

## Rollback staging

Karena migration additive, rollback aman di staging dapat dilakukan dengan:

1. Nonaktifkan kode frontend baru.
2. Drop constraint role baru jika perlu menerima role legacy sementara.
3. Biarkan kolom `client_id`/`department_id` tetap ada karena tidak merusak schema lama.

Jangan drop data `clients` atau `departments` di production tanpa backup.
