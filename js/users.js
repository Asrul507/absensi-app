/**
 * js/users.js
 * ============================================================
 * File ini HANYA berisi fungsi-fungsi utilitas profil dasar.
 * Semua fungsi modal manajemen karyawan (renderUsers, openDetailKaryawan,
 * openEditKaryawan, saveEditKaryawan, dsb.) dipusatkan SEPENUHNYA di js/app.js.
 * Tidak ada duplikasi di file ini.
 * ============================================================
 */

import { supabase } from './supabase.js'

/**
 * Mengambil satu baris profil dari tabel `profiles` berdasarkan userId.
 * Dipakai oleh app.js saat proses checkUser() setelah login.
 */
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
