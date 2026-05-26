/**
 * js/timezone.js
 * ============================================================
 * Timezone Utility — Genius HR
 *
 * Timezone ditentukan secara otomatis dari koordinat longitude
 * titik radius absensi yang tersimpan di tabel `lokasi_absen`.
 *
 * Cara kerja:
 *   1. Saat login / init, ambil semua titik lokasi dari Supabase
 *   2. Hitung UTC offset dari rata-rata longitude semua titik:
 *        offset = Math.round(longitude / 15)
 *      Contoh: Balikpapan lng ~116.8° → offset +8 (WITA ✅)
 *              Jakarta         lng ~106.8° → offset +7 (WIB  ✅)
 *              Jayapura        lng ~140.7° → offset +9 (WIT  ✅)
 *   3. Simpan hasil ke localStorage sebagai cache agar tidak
 *      fetch ulang setiap kali halaman dibuka.
 *   4. Semua fungsi format jam/tanggal di aplikasi memanggil
 *      toJamLokal() / toTanggalLokal() dari file ini.
 * ============================================================
 */

import { supabase } from './supabase.js'

/* ================================================================
   INTERNAL STATE
================================================================ */
const CACHE_KEY = 'genius_hr_tz_offset'
let _utcOffset = null   // number: jam offset dari UTC, mis. 8 untuk WITA

/* ================================================================
   INISIALISASI — panggil sekali saat app login
================================================================ */
export async function initTimezone() {
  // Coba ambil dari cache localStorage dulu
  const cached = localStorage.getItem(CACHE_KEY)
  if (cached !== null) {
    _utcOffset = parseInt(cached)
    console.log(`[TZ] Timezone dari cache: UTC+${_utcOffset}`)
    return _utcOffset
  }

  // Fetch dari Supabase
  try {
    const { data: lokasiList, error } = await supabase
      .from('lokasi_absen')
      .select('longitude, nama_titik')

    if (error) throw error

    if (!lokasiList || lokasiList.length === 0) {
      // Fallback: pakai timezone browser perangkat
      _utcOffset = -new Date().getTimezoneOffset() / 60
      console.warn(`[TZ] Tidak ada titik lokasi di DB, pakai timezone browser: UTC+${_utcOffset}`)
    } else {
      // Hitung rata-rata longitude semua titik
      const totalLng = lokasiList.reduce((sum, l) => sum + parseFloat(l.longitude || 0), 0)
      const avgLng   = totalLng / lokasiList.length
      _utcOffset     = Math.round(avgLng / 15)

      const namaTitik = lokasiList.map(l => l.nama_titik).join(', ')
      console.log(`[TZ] Longitude rata-rata: ${avgLng.toFixed(2)}° → UTC+${_utcOffset} (dari: ${namaTitik})`)
    }

    localStorage.setItem(CACHE_KEY, String(_utcOffset))
    return _utcOffset

  } catch (err) {
    console.error('[TZ] Gagal fetch lokasi:', err)
    // Fallback: timezone browser
    _utcOffset = -new Date().getTimezoneOffset() / 60
    return _utcOffset
  }
}

/* ================================================================
   RESET CACHE — panggil saat admin ubah/tambah titik lokasi
================================================================ */
export function resetTimezoneCache() {
  localStorage.removeItem(CACHE_KEY)
  _utcOffset = null
  console.log('[TZ] Cache timezone direset')
}

/* ================================================================
   GET CURRENT OFFSET — return offset aktif (inisialisasi jika belum)
================================================================ */
export function getUtcOffset() {
  if (_utcOffset !== null) return _utcOffset
  // Belum diinisialisasi — fallback ke browser timezone
  const browserOffset = -new Date().getTimezoneOffset() / 60
  console.warn('[TZ] getUtcOffset dipanggil sebelum initTimezone(), pakai browser offset:', browserOffset)
  return browserOffset
}

/* ================================================================
   FORMAT JAM — tampilkan jam dari ISO/UTC timestamp ke waktu lokal
   Input : ISO string dari Supabase (mis. "2026-05-25T12:00:00+00:00")
   Output: "20:00" (jika offset +8)
================================================================ */
export function toJamLokal(isoStr) {
  if (!isoStr) return '-'
  try {
    const offset = getUtcOffset()
    const d      = new Date(isoStr)
    // Geser ke waktu lokal secara manual
    const lokal  = new Date(d.getTime() + offset * 60 * 60 * 1000)
    const jam    = String(lokal.getUTCHours()).padStart(2, '0')
    const menit  = String(lokal.getUTCMinutes()).padStart(2, '0')
    return `${jam}:${menit}`
  } catch {
    return '-'
  }
}

/* ================================================================
   FORMAT TANGGAL — tampilkan tanggal lokal dari ISO string
   Output: "25/05/2026"
================================================================ */
export function toTanggalLokal(isoStr) {
  if (!isoStr) return '-'
  try {
    const offset = getUtcOffset()
    const d      = new Date(isoStr)
    const lokal  = new Date(d.getTime() + offset * 60 * 60 * 1000)
    const tgl    = String(lokal.getUTCDate()).padStart(2, '0')
    const bln    = String(lokal.getUTCMonth() + 1).padStart(2, '0')
    const thn    = lokal.getUTCFullYear()
    return `${tgl}/${bln}/${thn}`
  } catch {
    return '-'
  }
}

/* ================================================================
   BUILD ISO TIMESTAMP — konversi "YYYY-MM-DD" + "HH:MM"
   ke ISO string dengan offset lokasi yang benar.
   Dipakai oleh perbaikan-absen.js saat kirim waktu ke Supabase.
   Output: "2026-05-25T20:00:00+08:00"
================================================================ */
export function buildTimestampLokal(tanggal, jamHHMM) {
  if (!tanggal || !jamHHMM) return null
  try {
    // Sanitize jam: ambil HH:MM saja
    const parts  = jamHHMM.trim().split(':')
    const jam    = String(parts[0] || '00').padStart(2, '0')
    const menit  = String(parts[1] || '00').padStart(2, '0')
    const offset = getUtcOffset()
    const sign   = offset >= 0 ? '+' : '-'
    const absOff = String(Math.abs(offset)).padStart(2, '0')
    return `${tanggal}T${jam}:${menit}:00${sign}${absOff}:00`
  } catch {
    return null
  }
}

/* ================================================================
   GET LABEL TIMEZONE — untuk tampilan di UI
   Output: "WITA (UTC+8)"
================================================================ */
export function getLabelTimezone() {
  const offset = getUtcOffset()
  const labels = {
    7:  'WIB',
    8:  'WITA',
    9:  'WIT',
  }
  const nama = labels[offset] || `UTC+${offset}`
  return `${nama} (UTC+${offset})`
}

/* ================================================================
   GET TODAY STRING — tanggal hari ini dalam waktu lokal (YYYY-MM-DD)
   Lebih akurat dari new Date().toISOString().split('T')[0]
   yang pakai UTC dan bisa berbeda tanggal di tengah malam.
================================================================ */
export function getTodayLokal() {
  const offset = getUtcOffset()
  const now    = new Date()
  const lokal  = new Date(now.getTime() + offset * 60 * 60 * 1000)
  return lokal.toISOString().split('T')[0]
}
