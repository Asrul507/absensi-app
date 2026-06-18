# Demo Users Username Login

Demo client: **Kantor A** (`kantora` / `@kantora`). Password semua user demo: `Demo123!`.

| Username | Password | Kode Kantor | Role | Department | Email internal |
| --- | --- | --- | --- | --- | --- |
| `gm` | `Demo123!` | `@kantora` | `admin_all` | HRD | `gm@kantora.local` |
| `hrd` | `Demo123!` | `@kantora` | `admin_hr` | HRD | `hrd@kantora.local` |
| `hkmanager` | `Demo123!` | `@kantora` | `admin` | Housekeeping | `hkmanager@kantora.local` |
| `staff01` | `Demo123!` | `@kantora` | `staff` | Housekeeping | `staff01@kantora.local` |

Buat user demo dengan script server-side, bukan dari browser:

```bash
SUPABASE_URL="https://PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<server-side-service-role-key>" \
node scripts/create-demo-users.js
```

Script memakai service role dari ENV dan membuat Auth user dengan `email_confirm: true`; password tidak disimpan di database.
