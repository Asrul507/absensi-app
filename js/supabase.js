import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const fallbackConfig = {
  url: 'https://bllqpxhcykzshpzbdogy.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImJsbHFweGhjeWt6c2hwemJkb2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Njg3NTEsImV4cCI6MjA5NDA0NDc1MX0.odqXIJbMDQEBksX012ZgPOtPQXCdPMvo_bbO90fuUQw'
}

const runtimeConfig = globalThis.__SUPABASE_CONFIG__ || {}

export const supabaseUrl = runtimeConfig.url || fallbackConfig.url
export const supabaseKey = runtimeConfig.anonKey || fallbackConfig.anonKey

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL dan anon key wajib dikonfigurasi.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
