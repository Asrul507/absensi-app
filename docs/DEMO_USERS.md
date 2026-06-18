# Demo Users Multi-Tenant HRIS

Dokumen ini menjelaskan data demo/testing untuk validasi tenant `Kantor A`.

## Client Demo

- Nama Client: `Kantor A`
- Kode Client: `kantora`
- Domain Login: `@kantora`
- Status: `active`

## Department Demo

- `Housekeeping`
- `HRD`
- `Security`
- `Engineering`

## Login Testing

| Role | Email | Password | Kode Kantor |
| --- | --- | --- | --- |
| `admin_all` | `gm@kantora.demo` | `Demo123!` | `@kantora` |
| `admin_hr` | `hrd@kantora.demo` | `Demo123!` | `@kantora` |
| `admin` | `hkmanager@kantora.demo` | `Demo123!` | `@kantora` |
| `staff` | `staff@kantora.demo` | `Demo123!` | `@kantora` |

## Cara Membuat Data Demo

Jalankan hanya di development/staging dengan service role key dari environment lokal/staging:

```bash
SUPABASE_URL="https://PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="SERVICE_ROLE_KEY" \
node scripts/create-demo-users.js
```

Script memakai Supabase Admin API dengan service role key untuk:

1. Membuat/update client `Kantor A`.
2. Membuat/update department demo.
3. Membuat/update auth user dengan email langsung confirmed.
4. Membuat/update row `profiles` dengan `client_id`, `department_id`, role, dan `status_akun = Aktif`.

Script bersifat idempotent: jika user/client/department sudah ada, data akan di-update, bukan dibuat duplikat.

## Checklist Testing

1. Login `admin_all` dan pastikan dapat melihat seluruh data `Kantor A`.
2. Login `admin_hr` dan pastikan dapat melihat seluruh data `Kantor A`.
3. Login `admin` dan pastikan hanya melihat department `Housekeeping`.
4. Login `staff` dan pastikan hanya melihat data dirinya.
5. Pastikan tidak ada data bocor antar client.

## Catatan Keamanan

- Jangan commit service role key.
- Gunakan `.env` lokal/staging atau environment variable dari secret manager.
- Jangan jalankan script otomatis di production.
- Script akan berhenti jika `NODE_ENV=production`, kecuali override eksplisit `ALLOW_PRODUCTION_DEMO=true` diberikan.
