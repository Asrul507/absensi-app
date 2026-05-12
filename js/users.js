import { supabase } from './supabase.js'

export async function getProfile(userId) {

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)

  console.log("PROFILE RAW:", data, error)

  if (error) {
    console.log('PROFILE ERROR:', error)
    return null
  }

  // 🔥 AMBIL DATA PERTAMA (AMAN)
  return data?.[0] || null
}