import { supabase } from '../supabase.js'
import { ATTENDANCE_CONFIG } from '../config.js'
import {
  STATUS_CUTI_TAHUNAN,
  PROFILE_CUTI_SELECT,
  approveJatahCutiTahunan,
  buildKontrakPayload,
  canManageCutiTahunan,
  deductCutiTahunanOnApproval,
  extendCutiTahunan,
  formatMasaKerja,
  formatMasaKontrak,
  getOrCreateCutiTahunan,
  getSisaCuti,
  getSisaHariKontrak,
  getStatusKontrak,
  hitungJatahCuti,
  hitungKontrakBerakhir,
  hitungMasaKerja,
  prosesHangusCutiTahunan,
  resetCutiKaryawan,
  syncEligibleCutiTahunanForProfiles
} from '../cuti.js'
import { validateLeaveDateRangeLocal } from '../timezone.js?v=20260609-4'

export {
  STATUS_CUTI_TAHUNAN,
  PROFILE_CUTI_SELECT,
  approveJatahCutiTahunan,
  buildKontrakPayload,
  canManageCutiTahunan,
  deductCutiTahunanOnApproval,
  extendCutiTahunan,
  formatMasaKerja,
  formatMasaKontrak,
  getOrCreateCutiTahunan,
  getSisaCuti,
  getSisaHariKontrak,
  getStatusKontrak,
  hitungJatahCuti,
  hitungKontrakBerakhir,
  hitungMasaKerja,
  prosesHangusCutiTahunan,
  resetCutiKaryawan,
  syncEligibleCutiTahunanForProfiles
}

export const MIN_TENURE_FOR_LEAVE = ATTENDANCE_CONFIG.MIN_TENURE_FOR_LEAVE

export function toDateStr(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateLocal(value) {
  if (!value) return null
  const [y, m, d] = String(value).split('-').map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

export function hitungTanggalSelesai(startDate, hari) {
  if (!startDate || !hari) return null
  const date = parseDateLocal(startDate)
  if (!date) return null
  const jmlHari = Number.parseInt(hari, 10)
  if (!Number.isFinite(jmlHari) || jmlHari < 1) return null
  date.setDate(date.getDate() + (jmlHari - 1))
  return toDateStr(date)
}

export function validateRentangPengajuan(tanggalMulai, jumlahHari, { allowPast = false } = {}) {
  const jumlah = Number.parseInt(jumlahHari, 10)
  if (!Number.isFinite(jumlah) || jumlah < 1) throw new Error('Jumlah hari tidak valid')

  const mulaiDate = parseDateLocal(tanggalMulai)
  if (!mulaiDate) throw new Error('Tanggal mulai wajib diisi atau formatnya tidak valid')

  const selesai = hitungTanggalSelesai(tanggalMulai, jumlah)
  if (!selesai) throw new Error('Tanggal selesai tidak valid')

  // Approval lama tetap bisa diproses, tetapi pengajuan baru dibatasi minimal bulan berjalan.
  if (!allowPast) validateLeaveDateRangeLocal(tanggalMulai, selesai)

  return { jumlahHari: jumlah, tanggalMulai, tanggalSelesai: selesai }
}

export async function ensureTidakAdaPengajuanBentrok(userId, tanggalMulai, tanggalSelesai, excludeId = null) {
  let query = supabase
    .from('pengajuan')
    .select('id, jenis, status, tanggal_mulai, tanggal_selesai')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .lte('tanggal_mulai', tanggalSelesai)
    .gte('tanggal_selesai', tanggalMulai)
    .limit(1)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) throw error
  if (data?.length) {
    const bentrok = data[0]
    throw new Error(`Tanggal bentrok dengan pengajuan ${bentrok.jenis} (${bentrok.status}) pada ${bentrok.tanggal_mulai} s/d ${bentrok.tanggal_selesai}.`)
  }
}

export async function getPendingCutiReservedDays(userId, excludeId = null) {
  let query = supabase
    .from('pengajuan')
    .select('id, jumlah_hari')
    .eq('user_id', userId)
    .eq('jenis', 'cuti')
    .eq('status', 'pending')

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) throw error
  return (data || []).reduce((sum, row) => sum + (Number(row.jumlah_hari) || 0), 0)
}

export async function validateCutiRequestQuota(userId, jumlahHari, tanggalSelesai = null, excludeId = null) {
  const saldo = await getSisaCuti(userId)
  if (saldo.status !== STATUS_CUTI_TAHUNAN.AKTIF) {
    throw new Error('Cuti tahunan belum aktif untuk karyawan ini.')
  }

  const sisa = Number(saldo.sisa) || 0
  const pendingReserved = await getPendingCutiReservedDays(userId, excludeId)
  const availableAfterPending = sisa - pendingReserved

  if (availableAfterPending < jumlahHari) {
    throw new Error(`Saldo cuti tidak cukup. Sisa cuti ${sisa} hari, sudah di-reserve oleh pengajuan pending ${pendingReserved} hari, tersedia ${Math.max(0, availableAfterPending)} hari.`)
  }

  // Cuti mengikuti masa berlaku periode cuti/kontrak. Izin dan sakit tidak dibatasi tanggal expire cuti.
  if (tanggalSelesai && saldo.periode_selesai && tanggalSelesai > saldo.periode_selesai) {
    throw new Error(`Pengajuan cuti tidak boleh melewati tanggal expire cuti (${saldo.periode_selesai}).`)
  }
  return { ...saldo, pendingReserved, availableAfterPending }
}

export async function validatePengajuanRequest({ userId, jenis, tanggalMulai, jumlahHari, excludeId = null, allowPast = false }) {
  const rentang = validateRentangPengajuan(tanggalMulai, jumlahHari, { allowPast })
  await ensureTidakAdaPengajuanBentrok(userId, rentang.tanggalMulai, rentang.tanggalSelesai, excludeId)
  if (jenis === 'cuti') await validateCutiRequestQuota(userId, rentang.jumlahHari, rentang.tanggalSelesai, excludeId)
  return rentang
}
