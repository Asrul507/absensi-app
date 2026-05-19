import { supabase } from './supabase.js'

/* ================= HITUNG MASA KERJA (bulan) ================= */
export function hitungMasaKerja(tanggalBergabung) {
  if (!tanggalBergabung) return 0
  const mulai = new Date(tanggalBergabung)
  const sekarang = new Date()
  const bulan =
    (sekarang.getFullYear() - mulai.getFullYear()) * 12 +
    (sekarang.getMonth() - mulai.getMonth())
  return Math.max(0, bulan)
}

/* ================= FORMAT MASA KERJA ================= */
export function formatMasaKerja(bulan) {
  if (bulan < 1) return '< 1 bulan'
  const tahun = Math.floor(bulan / 12)
  const sisaBulan = bulan % 12
  if (tahun === 0) return `${sisaBulan} bulan`
  if (sisaBulan === 0) return `${tahun} tahun`
  return `${tahun} tahun ${sisaBulan} bulan`
}

/* ================= CEK ELIGIBLE CUTI ================= */
export function isEligibleCuti(tanggalBergabung) {
  return hitungMasaKerja(tanggalBergabung) >= 6
}

/* ================= HITUNG JATAH CUTI TAHUNAN ================= */
export function hitungJatahCuti(tanggalBergabung) {
  const bulan = hitungMasaKerja(tanggalBergabung)
  if (bulan < 12) return 0
  return 12 // 12 hari cuti per tahun setelah 12 bulan
}

/* ================= AMBIL/HITUNG SISA CUTI ================= */
export async function getSisaCuti(userId, tanggalBergabung) {
  const jatah = hitungJatahCuti(tanggalBergabung)

  // Hitung cuti terpakai tahun ini (approved)
  const tahunIni = new Date().getFullYear()
  const { data: pengajuanCuti } = await supabase
    .from('pengajuan')
    .select('jumlah_hari, status')
    .eq('user_id', userId)
    .eq('jenis', 'cuti')
    .eq('status', 'approved')
    .gte('tanggal_pengajuan', `${tahunIni}-01-01`)
    .lte('tanggal_pengajuan', `${tahunIni}-12-31`)

  const terpakai = (pengajuanCuti || []).reduce(
    (sum, p) => sum + (parseInt(p.jumlah_hari) || 0), 0
  )

  const sisa = jatah - terpakai
  return { jatah, terpakai, sisa }
}

/* ================= UPDATE SISA CUTI DI PROFILES ================= */
export async function syncSisaCutiProfile(userId, tanggalBergabung) {
  const { sisa } = await getSisaCuti(userId, tanggalBergabung)
  await supabase
    .from('profiles')
    .update({ sisa_cuti: sisa })
    .eq('id', userId)
  return sisa
}

/* ================= RESET CUTI (saat non-aktif) ================= */
export async function resetCutiKaryawan(userId) {
  await supabase
    .from('profiles')
    .update({ sisa_cuti: 0 })
    .eq('id', userId)
}
