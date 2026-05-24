import { supabase } from './supabase.js'
import { updateUserPassword } from './auth.js'
import { hitungMasaKerja, formatMasaKerja, hitungJatahCuti, resetCutiKaryawan } from './cuti.js'

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('getProfile error:', error)
    return null
  }

  return data
}
