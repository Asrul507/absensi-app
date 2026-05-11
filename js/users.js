import { supabase } from './supabase.js'

export async function getProfile(userId) {

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  console.log('PROFILE DATA:', data)
  console.log('PROFILE ERROR:', error)

  if (error) {
    return null
  }

  return data
}