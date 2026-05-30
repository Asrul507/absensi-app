import { supabase } from './supabase.js'
import { showToast } from './feedback.js'

export async function submitAbsen(data) {
  const payload = { ...data }
  if (!payload.user_id && typeof window !== 'undefined' && window.currentUser?.id) {
    payload.user_id = window.currentUser.id
  }

  const { error } = await supabase
    .from('absensi')
    .insert([payload])

  if(error){
    console.error(error)
    showToast('Gagal absen: ' + error.message, 'error')
    return
  }

  showToast('Absen berhasil', 'success')
}
