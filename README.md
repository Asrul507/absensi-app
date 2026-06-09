# Genius HR / Absensi App

Aplikasi HR dan absensi berbasis static frontend, Supabase, dan siap deploy ke Netlify.

## Supabase configuration

Konfigurasi Supabase dipusatkan di `js/supabase.js`. Karena aplikasi ini berjalan sebagai static frontend, penggunaan Supabase `anon` key diperbolehkan, tetapi wajib diamankan dengan Row Level Security (RLS) di Supabase.

Rekomendasi deployment:

1. Jangan pernah menyimpan `service_role` key di repository atau frontend.
2. Batasi akses tabel melalui RLS berdasarkan `auth.uid()` dan role pada tabel `profiles`.
3. Untuk rotasi konfigurasi tanpa mengubah bundle, set `window.__SUPABASE_CONFIG__` sebelum `js/app.js` dimuat:

```html
<script>
  window.__SUPABASE_CONFIG__ = {
    url: 'https://PROJECT.supabase.co',
    anonKey: 'SUPABASE_ANON_KEY'
  }
</script>
```

Jika override tidak tersedia, aplikasi memakai fallback anon key yang ada di `js/supabase.js`.

## Database migrations

Jalankan migration di folder `migrations/` secara berurutan. Migration baru tidak mengubah nama tabel/kolom lama secara destruktif dan hanya menambah default/check/kolom aman yang diperlukan aplikasi.
