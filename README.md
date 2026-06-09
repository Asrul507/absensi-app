# Genius HR / Absensi App

Aplikasi HR dan absensi berbasis static frontend, Supabase, dan siap deploy ke Netlify.

## Supabase configuration

Konfigurasi Supabase dipusatkan di `js/supabase.js`. Project ini **bukan Vite/build app** dan tidak memiliki `package.json`, sehingga browser tidak bisa membaca `import.meta.env`, `process.env`, atau variable Netlify secara langsung.

Konfigurasi yang dipakai saat deploy static:

- `supabaseUrl` / project URL: diset di `js/supabase.js`.
- `supabaseKey` / anon public key: diset di `js/supabase.js`.

Catatan keamanan:

1. Frontend static hanya boleh memakai Supabase `anon` public key.
2. Jangan pernah menyimpan `service_role` key di repository atau frontend.
3. Batasi akses tabel melalui Row Level Security (RLS) berdasarkan `auth.uid()` dan role pada tabel `profiles`.
4. Jika ingin memakai Netlify environment variables seperti `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`, tambahkan build step yang mengganti/men-generate config sebelum deploy. Tanpa build step, variable tersebut tidak otomatis tersedia di browser.

## Database migrations

Jalankan migration di folder `migrations/` secara berurutan. Migration baru tidak mengubah nama tabel/kolom lama secara destruktif dan hanya menambah default/check/kolom aman yang diperlukan aplikasi.
