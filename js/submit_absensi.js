import { supabase } from './supabase.js'

export async function submitAbsen(data) {

  const { error } = await supabase
    .from('absensi')
    .insert([data])

  if(error){
    console.error(error)
    alert('Gagal absen')
    return
  }

  alert('Absen berhasil ✔')
}