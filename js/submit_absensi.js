import { supabase } from './supabase.js'
import { showToast } from './feedback.js'

export async function submitAbsen(data) {

  const { error } = await supabase
    .from('absensi')
    .insert([data])

  if(error){
    console.error(error)
    showToast('Gagal absen: ' + error.message, 'error')
    return
  }

  showToast('Absen berhasil', 'success')
}
