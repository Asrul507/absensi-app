import { supabase } from './supabase.js'
import { ATTENDANCE_CONFIG } from './config.js'

export const STATUS_CUTI_TAHUNAN = {
  BELUM_ELIGIBLE: 'BELUM_ELIGIBLE',
  TIDAK_ELIGIBLE: 'TIDAK_ELIGIBLE',
  ELIGIBLE_MENUNGGU_APPROVAL_HR: 'ELIGIBLE_MENUNGGU_APPROVAL_HR',
  AKTIF: 'AKTIF',
  HANGUS: 'HANGUS',
  EXPIRED_KONTRAK: 'EXPIRED_KONTRAK'
}

export const JATAH_CUTI_TAHUNAN = 12
export const JENIS_KONTRAK_CUTI_ELIGIBLE = ['kontrak', 'tetap']
export const PROFILE_CUTI_SELECT = 'id, nama_lengkap, email, tanggal_bergabung, role, status_akun, jenis_kontrak, kontrak_mulai, durasi_kontrak, satuan_durasi_kontrak, masa_kontrak, kontrak_berakhir, status_kontrak'

export function canManageCutiTahunan(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role
  return ['admin', 'super_admin', 'hr', 'spv', 'supervisor'].includes(role)
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

function addDurationLocal(value, duration, unit = 'bulan') {
  const date = parseDateLocal(value)
  const amount = Number.parseInt(duration, 10)
  if (!date || !Number.isFinite(amount) || amount < 1) return null
  if (unit === 'tahun') date.setFullYear(date.getFullYear() + amount)
  else date.setMonth(date.getMonth() + amount)
  date.setDate(date.getDate() - 1)
  return date
}

function addMonthsForExtend(value, months) {
  const date = parseDateLocal(value)
  const amount = Number.parseInt(months, 10)
  if (!date || !Number.isFinite(amount) || amount < 1) return null
  date.setMonth(date.getMonth() + amount)
  return date
}

function todayLocalDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function getTahunCutiBerjalan() {
  return new Date().getFullYear()
}

export function formatMasaKontrak(durasi, satuan = 'bulan') {
  const amount = Number.parseInt(durasi, 10)
  if (!Number.isFinite(amount) || amount < 1) return ''
  return `${amount} ${satuan === 'tahun' ? 'tahun' : 'bulan'}`
}

export function hitungKontrakBerakhir(kontrakMulai, durasi, satuan = 'bulan') {
  return toDateStr(addDurationLocal(kontrakMulai, durasi, satuan))
}

export function getSisaHariKontrak(kontrakBerakhir) {
  const end = parseDateLocal(kontrakBerakhir)
  if (!end) return null
  const diffMs = end.getTime() - todayLocalDate().getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export function getStatusKontrak(kontrakBerakhir) {
  const sisaHari = getSisaHariKontrak(kontrakBerakhir)
  if (sisaHari === null) return 'aktif'
  if (sisaHari < 0) return 'berakhir'
  if (sisaHari <= 30) return 'akan_berakhir'
  return 'aktif'
}

export function buildKontrakPayload({ jenisKontrak, kontrakMulai, durasiKontrak, satuanDurasiKontrak }) {
  const durasi = Number.parseInt(durasiKontrak, 10)
  const satuan = satuanDurasiKontrak === 'tahun' ? 'tahun' : 'bulan'
  const kontrak_berakhir = hitungKontrakBerakhir(kontrakMulai, durasi, satuan)
  return {
    jenis_kontrak: jenisKontrak || 'kontrak',
    kontrak_mulai: kontrakMulai || null,
    durasi_kontrak: Number.isFinite(durasi) && durasi > 0 ? durasi : null,
    satuan_durasi_kontrak: satuan,
    masa_kontrak: formatMasaKontrak(durasi, satuan),
    kontrak_berakhir,
    status_kontrak: getStatusKontrak(kontrak_berakhir)
  }
}

export function isJenisKontrakEligibleCuti(jenisKontrak) {
  return JENIS_KONTRAK_CUTI_ELIGIBLE.includes(String(jenisKontrak || '').toLowerCase())
}

export function getJenisKontrakCutiMessage(jenisKontrak) {
  return isJenisKontrakEligibleCuti(jenisKontrak)
    ? 'Jenis kontrak ini mendapatkan cuti tahunan.'
    : 'Jenis kontrak ini tidak mendapatkan cuti tahunan.'
}

export function isKontrakAktif(profileOrContract) {
  const status = profileOrContract?.status_kontrak || getStatusKontrak(profileOrContract?.kontrak_berakhir)
  return !!profileOrContract?.kontrak_mulai && !!profileOrContract?.kontrak_berakhir && status !== 'berakhir'
}

function getKontrakPeriode(profile) {
  const kontrak_mulai = profile?.kontrak_mulai || null
  const kontrak_berakhir = profile?.kontrak_berakhir || null
  if (!kontrak_mulai || !kontrak_berakhir) return null
  return {
    kontrak_mulai,
    kontrak_berakhir,
    tahun: Number(String(kontrak_mulai).slice(0, 4)) || getTahunCutiBerjalan(),
    periode_mulai: kontrak_mulai,
    periode_selesai: kontrak_berakhir,
    status_kontrak: getStatusKontrak(kontrak_berakhir)
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
export function isEligibleCuti(tanggalBergabung, profile = null) {
  const masaKerjaCukup = hitungMasaKerja(tanggalBergabung || profile?.tanggal_bergabung) >= ATTENDANCE_CONFIG.MIN_TENURE_FOR_LEAVE
  if (profile) return masaKerjaCukup && isKontrakAktif(profile) && isJenisKontrakEligibleCuti(profile.jenis_kontrak)
  return masaKerjaCukup
}

/* ================= HITUNG JATAH CUTI TAHUNAN ================= */
export function hitungJatahCuti(tanggalBergabung, profile = null) {
  if (profile) return isEligibleCuti(profile.tanggal_bergabung, profile) ? JATAH_CUTI_TAHUNAN : 0
  if (!isEligibleCuti(tanggalBergabung)) return 0
  return JATAH_CUTI_TAHUNAN
}

function buildAnnualLeavePayload(profile) {
  const periode = getKontrakPeriode(profile)
  const kontrakAktif = periode?.status_kontrak !== 'berakhir' && !!periode?.kontrak_mulai && !!periode?.kontrak_berakhir
  const jenisEligible = isJenisKontrakEligibleCuti(profile?.jenis_kontrak)
  const masaKerjaCukup = hitungMasaKerja(profile?.tanggal_bergabung) >= ATTENDANCE_CONFIG.MIN_TENURE_FOR_LEAVE
  const status = kontrakAktif && jenisEligible && masaKerjaCukup
    ? STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR
    : kontrakAktif && !jenisEligible
      ? STATUS_CUTI_TAHUNAN.TIDAK_ELIGIBLE
      : periode?.status_kontrak === 'berakhir'
        ? STATUS_CUTI_TAHUNAN.EXPIRED_KONTRAK
        : STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE

  return {
    user_id: profile.id,
    nama: profile.nama_lengkap || profile.email || '-',
    kontrak_mulai: periode?.kontrak_mulai || null,
    kontrak_berakhir: periode?.kontrak_berakhir || null,
    tahun: periode?.tahun || getTahunCutiBerjalan(),
    periode_mulai: periode?.periode_mulai || null,
    periode_selesai: periode?.periode_selesai || null,
    jatah_cuti: 0,
    sisa_cuti: 0,
    cuti_terpakai: 0,
    status
  }
}

async function expireCutiRowIfNeeded(row) {
  if (!row || row.status !== STATUS_CUTI_TAHUNAN.AKTIF || getStatusKontrak(row.kontrak_berakhir) !== 'berakhir') return row

  const sisaHangus = Number(row.sisa_cuti) || 0
  const { data, error } = await supabase
    .from('cuti_tahunan')
    .update({
      status: STATUS_CUTI_TAHUNAN.EXPIRED_KONTRAK,
      expired_at: new Date().toISOString(),
      sisa_cuti_hangus: sisaHangus,
      sisa_cuti: 0
    })
    .eq('id', row.id)
    .select('*')
    .single()

  if (error) throw error

  await supabase
    .from('profiles')
    .update({ sisa_cuti: 0, status_kontrak: 'berakhir' })
    .eq('id', row.user_id)

  return data
}

/* ================= AMBIL / DETEKSI CUTI TAHUNAN ================= */
export async function getOrCreateCutiTahunan(profile) {
  if (!profile?.id) return null

  const detected = buildAnnualLeavePayload(profile)
  const computedStatusKontrak = getStatusKontrak(detected.kontrak_berakhir)
  if ((profile.status_kontrak || null) !== computedStatusKontrak) {
    await supabase.from('profiles').update({ status_kontrak: computedStatusKontrak }).eq('id', profile.id)
  }
  const query = supabase
    .from('cuti_tahunan')
    .select('*')
    .eq('user_id', profile.id)

  if (detected.kontrak_mulai && detected.kontrak_berakhir) {
    query.eq('kontrak_mulai', detected.kontrak_mulai).eq('kontrak_berakhir', detected.kontrak_berakhir)
  } else {
    query.eq('tahun', detected.tahun).is('kontrak_mulai', null).is('kontrak_berakhir', null)
  }

  const { data: existing, error: existingError } = await query.maybeSingle()

  if (existingError) throw existingError
  if (existing) {
    const expired = await expireCutiRowIfNeeded(existing)
    const canRefreshDetection = [
      STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE,
      STATUS_CUTI_TAHUNAN.TIDAK_ELIGIBLE,
      STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR
    ].includes(expired.status)
    if (canRefreshDetection && expired.status !== detected.status) {
      const { data: updated, error: updateError } = await supabase
        .from('cuti_tahunan')
        .update({
          nama: detected.nama,
          kontrak_mulai: detected.kontrak_mulai,
          kontrak_berakhir: detected.kontrak_berakhir,
          tahun: detected.tahun,
          periode_mulai: detected.periode_mulai,
          periode_selesai: detected.periode_selesai,
          status: detected.status
        })
        .eq('id', expired.id)
        .select('*')
        .single()
      if (updateError) throw updateError
      return updated
    }
    return expired
  }

  const { data, error } = await supabase
    .from('cuti_tahunan')
    .insert([detected])
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function syncEligibleCutiTahunanForProfiles(profiles) {
  const rows = []
  for (const profile of (profiles || [])) {
    rows.push(await getOrCreateCutiTahunan(profile))
  }
  return rows
}

export async function getCutiTahunanAktif(userId) {
  const { data, error } = await supabase
    .from('cuti_tahunan')
    .select('*')
    .eq('user_id', userId)
    .eq('status', STATUS_CUTI_TAHUNAN.AKTIF)
    .order('periode_mulai', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return expireCutiRowIfNeeded(data)
}

/* ================= AMBIL/HITUNG SISA CUTI ================= */
export async function getSisaCuti(userId, tanggalBergabung) {
  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_CUTI_SELECT)
    .eq('id', userId)
    .maybeSingle()

  const row = profile
    ? await getOrCreateCutiTahunan(profile)
    : await getCutiTahunanAktif(userId)

  if (row) {
    return {
      jatah: Number(row.jatah_cuti) || 0,
      terpakai: Number(row.cuti_terpakai) || 0,
      sisa: Number(row.sisa_cuti) || 0,
      status: row.status,
      jenis_kontrak: profile?.jenis_kontrak || null,
      cuti_message: row.status === STATUS_CUTI_TAHUNAN.TIDAK_ELIGIBLE ? getJenisKontrakCutiMessage(profile?.jenis_kontrak) : null,
      kontrak_mulai: row.kontrak_mulai,
      kontrak_berakhir: row.kontrak_berakhir,
      status_kontrak: getStatusKontrak(row.kontrak_berakhir),
      periode_mulai: row.periode_mulai,
      periode_selesai: row.periode_selesai,
      row
    }
  }

  // Fallback untuk database yang belum menjalankan migration cuti_tahunan.
  const jatah = hitungJatahCuti(tanggalBergabung)
  return {
    jatah,
    terpakai: 0,
    sisa: jatah,
    status: jatah > 0 ? STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR : STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE,
    jenis_kontrak: null,
    cuti_message: null,
    kontrak_mulai: null,
    kontrak_berakhir: null,
    status_kontrak: 'aktif',
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

export async function approveJatahCutiTahunan(rowOrProfile, approver) {
  if (!canManageCutiTahunan(approver)) throw new Error('Tidak punya akses approve jatah cuti tahunan')

  const row = rowOrProfile?.periode_mulai ? await expireCutiRowIfNeeded(rowOrProfile) : await getOrCreateCutiTahunan(rowOrProfile)
  if (!row) throw new Error('Data cuti tahunan tidak ditemukan')
  if (row.status === STATUS_CUTI_TAHUNAN.TIDAK_ELIGIBLE) throw new Error('Jenis kontrak ini tidak mendapatkan cuti tahunan.')
  if (row.status !== STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR && row.status !== STATUS_CUTI_TAHUNAN.AKTIF) throw new Error('Periode cuti belum eligible untuk approval.')
  if (getStatusKontrak(row.kontrak_berakhir) === 'berakhir') throw new Error('Kontrak sudah berakhir. Periode cuti tidak bisa diaktifkan.')

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
      cuti_terpakai: 0,
      status_kontrak: getStatusKontrak(row.kontrak_berakhir)
    })
    .eq('id', row.user_id)

  return data
}

export async function deductCutiTahunanOnApproval(userId, jumlahHari) {
  const jumlah = Number.parseInt(jumlahHari, 10)
  if (!Number.isFinite(jumlah) || jumlah < 1) throw new Error('Jumlah hari cuti tidak valid')

  const row = await getCutiTahunanAktif(userId)
  if (!row) throw new Error('Cuti tahunan belum aktif. HR/admin harus approve jatah cuti terlebih dahulu.')
  if (row.status !== STATUS_CUTI_TAHUNAN.AKTIF || getStatusKontrak(row.kontrak_berakhir) === 'berakhir') throw new Error('Kontrak/periode cuti sudah berakhir.')
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
  const status = getStatusKontrak(row.kontrak_berakhir) === 'berakhir'
    ? STATUS_CUTI_TAHUNAN.EXPIRED_KONTRAK
    : STATUS_CUTI_TAHUNAN.HANGUS

  const { data, error } = await supabase
    .from('cuti_tahunan')
    .update({
      status,
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
    .update({ sisa_cuti: 0, status_kontrak: getStatusKontrak(row.kontrak_berakhir) })
    .eq('id', row.user_id)

  return data
}


export async function extendCutiTahunan(rowId, { months, reason }, actor) {
  if (!canManageCutiTahunan(actor)) throw new Error('Tidak punya akses extend cuti tahunan')

  const jumlahBulan = Number.parseInt(months, 10)
  const alasan = String(reason || '').trim()
  if (!Number.isFinite(jumlahBulan) || jumlahBulan < 1) throw new Error('Jumlah bulan extend tidak valid')
  if (!alasan) throw new Error('Alasan extend wajib diisi')

  const { data: row, error: rowError } = await supabase
    .from('cuti_tahunan')
    .select('*')
    .eq('id', rowId)
    .single()

  if (rowError) throw rowError
  if (!row) throw new Error('Data cuti tahunan tidak ditemukan')
  if ([STATUS_CUTI_TAHUNAN.HANGUS, STATUS_CUTI_TAHUNAN.EXPIRED_KONTRAK].includes(row.status)) {
    throw new Error('Periode cuti sudah expired/hangus dan tidak bisa di-extend.')
  }
  if (row.status !== STATUS_CUTI_TAHUNAN.AKTIF || getStatusKontrak(row.periode_selesai) === 'berakhir') {
    throw new Error('Periode cuti sudah expired/hangus dan tidak bisa di-extend.')
  }

  const oldPeriodeSelesai = row.periode_selesai
  const newPeriodeSelesai = toDateStr(addMonthsForExtend(oldPeriodeSelesai, jumlahBulan))
  if (!newPeriodeSelesai) throw new Error('Tanggal periode selesai tidak valid')

  const { data, error } = await supabase
    .from('cuti_tahunan')
    .update({ periode_selesai: newPeriodeSelesai })
    .eq('id', row.id)
    .select('*')
    .single()

  if (error) throw error

  const { error: historyError } = await supabase.from('cuti_extend_history').insert([{
    cuti_tahunan_id: row.id,
    user_id: row.user_id,
    extended_months: jumlahBulan,
    old_periode_selesai: oldPeriodeSelesai,
    new_periode_selesai: newPeriodeSelesai,
    reason: alasan,
    extended_by: actor.id
  }])
  if (historyError) throw historyError

  return data
}

/* ================= RESET CUTI (saat non-aktif) ================= */
export async function resetCutiKaryawan(userId) {
  await supabase
    .from('profiles')
    .update({ sisa_cuti: 0, cuti_terpakai: 0 })
    .eq('id', userId)
}
