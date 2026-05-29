import { supabase } from './supabase.js'

export const STATUS_CUTI_TAHUNAN = {
  BELUM_ELIGIBLE: 'BELUM_ELIGIBLE',
  ELIGIBLE_MENUNGGU_APPROVAL_HR: 'ELIGIBLE_MENUNGGU_APPROVAL_HR',
  AKTIF: 'AKTIF',
  HANGUS: 'HANGUS'
}

export const JATAH_CUTI_TAHUNAN = 12

export function canManageCutiTahunan(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role
  return ['admin', 'super_admin', 'hr'].includes(role)
}

function toDateStr(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateLocal(value) {
  if (!value) return null
  const [y, m, d] = String(value).split('-').map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

function addMonthsLocal(value, months) {
  const date = parseDateLocal(value)
  if (!date) return null
  date.setMonth(date.getMonth() + months)
  return date
}

export function getTahunCutiBerjalan() {
  return new Date().getFullYear()
}

function getPeriodeCuti(profile, tahun = getTahunCutiBerjalan()) {
  const awalTahun = new Date(tahun, 0, 1)
  const akhirTahun = new Date(tahun, 11, 31)
  const tanggalEligible = addMonthsLocal(profile?.tanggal_bergabung, 12)
  const periodeMulai = tanggalEligible && tanggalEligible > awalTahun ? tanggalEligible : awalTahun
  return {
    periode_mulai: toDateStr(periodeMulai),
    periode_selesai: toDateStr(akhirTahun)
  }
}

/* ================= HITUNG MASA KERJA (bulan) ================= */
export function hitungMasaKerja(tanggalBergabung) {
  if (!tanggalBergabung) return 0
  const mulai = parseDateLocal(tanggalBergabung)
  if (!mulai) return 0
  const sekarang = new Date()
  let bulan =
    (sekarang.getFullYear() - mulai.getFullYear()) * 12 +
    (sekarang.getMonth() - mulai.getMonth())
  if (sekarang.getDate() < mulai.getDate()) bulan -= 1
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
  return hitungMasaKerja(tanggalBergabung) >= 12
}

/* ================= HITUNG JATAH CUTI TAHUNAN ================= */
export function hitungJatahCuti(tanggalBergabung) {
  if (!isEligibleCuti(tanggalBergabung)) return 0
  return JATAH_CUTI_TAHUNAN
}

function buildAnnualLeavePayload(profile, tahun = getTahunCutiBerjalan()) {
  const { periode_mulai, periode_selesai } = getPeriodeCuti(profile, tahun)
  const status = isEligibleCuti(profile?.tanggal_bergabung)
    ? STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR
    : STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE

  return {
    user_id: profile.id,
    nama: profile.nama_lengkap || profile.email || '-',
    tahun,
    periode_mulai,
    periode_selesai,
    jatah_cuti: 0,
    sisa_cuti: 0,
    cuti_terpakai: 0,
    status
  }
}

/* ================= AMBIL / DETEKSI CUTI TAHUNAN ================= */
export async function getOrCreateCutiTahunan(profile, tahun = getTahunCutiBerjalan()) {
  if (!profile?.id) return null

  const { data: existing, error: existingError } = await supabase
    .from('cuti_tahunan')
    .select('*')
    .eq('user_id', profile.id)
    .eq('tahun', tahun)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) {
    const detected = buildAnnualLeavePayload(profile, tahun)
    if (existing.status === STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE && detected.status === STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR) {
      const { data: updated, error: updateError } = await supabase
        .from('cuti_tahunan')
        .update({
          nama: detected.nama,
          periode_mulai: detected.periode_mulai,
          periode_selesai: detected.periode_selesai,
          status: detected.status
        })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (updateError) throw updateError
      return updated
    }
    return existing
  }

  const payload = buildAnnualLeavePayload(profile, tahun)
  const { data, error } = await supabase
    .from('cuti_tahunan')
    .insert([payload])
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function syncEligibleCutiTahunanForProfiles(profiles, tahun = getTahunCutiBerjalan()) {
  const rows = []
  for (const profile of (profiles || [])) {
    rows.push(await getOrCreateCutiTahunan(profile, tahun))
  }
  return rows
}

export async function getCutiTahunanAktif(userId, tahun = getTahunCutiBerjalan()) {
  const { data, error } = await supabase
    .from('cuti_tahunan')
    .select('*')
    .eq('user_id', userId)
    .eq('tahun', tahun)
    .eq('status', STATUS_CUTI_TAHUNAN.AKTIF)
    .maybeSingle()

  if (error) throw error
  return data
}

/* ================= AMBIL/HITUNG SISA CUTI ================= */
export async function getSisaCuti(userId, tanggalBergabung) {
  const tahun = getTahunCutiBerjalan()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nama_lengkap, email, tanggal_bergabung')
    .eq('id', userId)
    .maybeSingle()

  const row = profile
    ? await getOrCreateCutiTahunan(profile, tahun)
    : await getCutiTahunanAktif(userId, tahun)

  if (row) {
    return {
      jatah: Number(row.jatah_cuti) || 0,
      terpakai: Number(row.cuti_terpakai) || 0,
      sisa: Number(row.sisa_cuti) || 0,
      status: row.status,
      periode_mulai: row.periode_mulai,
      periode_selesai: row.periode_selesai,
      row
    }
  }

  // Fallback untuk database yang belum menjalankan migration cuti_tahunan.
  const jatah = hitungJatahCuti(tanggalBergabung)
  const { data: pengajuanCuti } = await supabase
    .from('pengajuan')
    .select('jumlah_hari, status')
    .eq('user_id', userId)
    .eq('jenis', 'cuti')
    .eq('status', 'approved')
    .gte('tanggal_pengajuan', `${tahun}-01-01`)
    .lte('tanggal_pengajuan', `${tahun}-12-31`)

  const terpakai = (pengajuanCuti || []).reduce(
    (sum, p) => sum + (parseInt(p.jumlah_hari) || 0), 0
  )

  return {
    jatah,
    terpakai,
    sisa: Math.max(0, jatah - terpakai),
    status: jatah > 0 ? STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR : STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE,
    periode_mulai: null,
    periode_selesai: null,
    row: null
  }
}

/* ================= UPDATE RINGKASAN CUTI DI PROFILES ================= */
export async function syncSisaCutiProfile(userId, tanggalBergabung) {
  const { jatah, terpakai, sisa } = await getSisaCuti(userId, tanggalBergabung)
  await supabase
    .from('profiles')
    .update({ sisa_cuti: sisa, jatah_cuti_tahunan: jatah, jatah_cuti: jatah, cuti_terpakai: terpakai })
    .eq('id', userId)
  return sisa
}

export async function approveJatahCutiTahunan(rowOrProfile, approver, tahun = getTahunCutiBerjalan()) {
  if (!canManageCutiTahunan(approver)) throw new Error('Tidak punya akses approve jatah cuti tahunan')

  const row = rowOrProfile?.tahun ? rowOrProfile : await getOrCreateCutiTahunan(rowOrProfile, tahun)
  if (!row) throw new Error('Data cuti tahunan tidak ditemukan')

  const payload = {
    jatah_cuti: JATAH_CUTI_TAHUNAN,
    sisa_cuti: JATAH_CUTI_TAHUNAN,
    cuti_terpakai: 0,
    status: STATUS_CUTI_TAHUNAN.AKTIF,
    approved_by: approver.id,
    approved_at: new Date().toISOString(),
    expired_at: null,
    sisa_cuti_hangus: 0
  }

  const { data, error } = await supabase
    .from('cuti_tahunan')
    .update(payload)
    .eq('id', row.id)
    .select('*')
    .single()

  if (error) throw error

  await supabase
    .from('profiles')
    .update({
      sisa_cuti: JATAH_CUTI_TAHUNAN,
      jatah_cuti_tahunan: JATAH_CUTI_TAHUNAN,
      jatah_cuti: JATAH_CUTI_TAHUNAN,
      cuti_terpakai: 0
    })
    .eq('id', row.user_id)

  return data
}

export async function deductCutiTahunanOnApproval(userId, jumlahHari) {
  const jumlah = Number.parseInt(jumlahHari, 10)
  if (!Number.isFinite(jumlah) || jumlah < 1) throw new Error('Jumlah hari cuti tidak valid')

  const row = await getCutiTahunanAktif(userId)
  if (!row) throw new Error('Cuti tahunan belum aktif. HR/admin harus approve jatah cuti terlebih dahulu.')
  if ((Number(row.sisa_cuti) || 0) < jumlah) throw new Error(`Saldo cuti tidak cukup. Sisa cuti ${row.sisa_cuti} hari.`)

  const nextSisa = (Number(row.sisa_cuti) || 0) - jumlah
  const nextTerpakai = (Number(row.cuti_terpakai) || 0) + jumlah

  const { data, error } = await supabase
    .from('cuti_tahunan')
    .update({ sisa_cuti: nextSisa, cuti_terpakai: nextTerpakai })
    .eq('id', row.id)
    .select('*')
    .single()

  if (error) throw error

  await supabase
    .from('profiles')
    .update({ sisa_cuti: nextSisa, cuti_terpakai: nextTerpakai, jatah_cuti_tahunan: data.jatah_cuti, jatah_cuti: data.jatah_cuti })
    .eq('id', userId)

  return data
}

export async function prosesHangusCutiTahunan(rowId, actor) {
  if (!canManageCutiTahunan(actor)) throw new Error('Tidak punya akses proses hangus cuti tahunan')

  const { data: row, error: rowError } = await supabase
    .from('cuti_tahunan')
    .select('*')
    .eq('id', rowId)
    .single()

  if (rowError) throw rowError
  if (!row) throw new Error('Data cuti tahunan tidak ditemukan')

  const expiredAt = new Date().toISOString()
  const sisaHangus = Number(row.sisa_cuti) || 0
  const { data, error } = await supabase
    .from('cuti_tahunan')
    .update({
      status: STATUS_CUTI_TAHUNAN.HANGUS,
      expired_at: expiredAt,
      sisa_cuti_hangus: sisaHangus,
      sisa_cuti: 0
    })
    .eq('id', row.id)
    .select('*')
    .single()

  if (error) throw error

  await supabase
    .from('profiles')
    .update({ sisa_cuti: 0 })
    .eq('id', row.user_id)

  return data
}

/* ================= RESET CUTI (saat non-aktif) ================= */
export async function resetCutiKaryawan(userId) {
  await supabase
    .from('profiles')
    .update({ sisa_cuti: 0, cuti_terpakai: 0 })
    .eq('id', userId)
}
