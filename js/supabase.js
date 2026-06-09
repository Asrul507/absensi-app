import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Project ini berjalan sebagai HTML + JS static tanpa Vite/build step.
// Karena itu konfigurasi harus tersedia langsung di browser.
// Gunakan hanya anon public key; jangan memakai key admin/service role.
const SUPABASE_CONFIG = Object.freeze({
  url: 'https://bllqpxhcykzshpzbdogy.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsbHFweGhjeWt6c2hwemJkb2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Njg3NTEsImV4cCI6MjA5NDA0NDc1MX0.odqXIJbMDQEBksX012ZgPOtPQXCdPMvo_bbO90fuUQw'
})

function validateSupabaseConfig({ url, anonKey }) {
  if (!url || !anonKey) {
    throw new Error('Konfigurasi Supabase tidak lengkap: URL dan anon key wajib diisi di js/supabase.js.')
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error('Konfigurasi Supabase tidak valid: URL harus berupa https://PROJECT.supabase.co.')
  }

  if (String(anonKey).split('.').length !== 3) {
    throw new Error('Konfigurasi Supabase tidak valid: anon key harus berupa JWT public anon key.')
  }
}

validateSupabaseConfig(SUPABASE_CONFIG)

export const supabaseUrl = SUPABASE_CONFIG.url
export const supabaseKey = SUPABASE_CONFIG.anonKey
export const supabase = createClient(supabaseUrl, supabaseKey)
