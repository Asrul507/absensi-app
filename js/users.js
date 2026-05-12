import { supabase } from './supabase.js'

export async function getProfile(userId) {

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle() // 🔥 GANTI single()

  if (error) {
    console.log('PROFILE ERROR:', error)
    return null
  }

  return data
}
