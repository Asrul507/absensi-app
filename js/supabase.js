import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

export const supabaseUrl = 'https://bllqpxhcykzshpzbdogy.supabase.co'

export const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsbHFweGhjeWt6c2hwemJkb2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Njg3NTEsImV4cCI6MjA5NDA0NDc1MX0.odqXIJbMDQEBksX012ZgPOtPQXCdPMvo_bbO90fuUQw'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)
