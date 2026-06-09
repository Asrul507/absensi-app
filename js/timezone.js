import { supabase } from './supabase.js'

const TZ_NAME = 'Asia/Makassar'
const LOCALE_ID = 'id-ID'

export async function initTimezone() {
  return TZ_NAME
}

export function resetTimezoneCache() {
  // no-op: timezone dikunci ke Asia/Makassar
}

export function getUtcOffset() {
  return 8
}

export function parseAbsensiTimestamp(value) {
  if (!value) return null
  const raw = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}[ T].*[+-]\d{2}$/.test(raw)) {
    const norm = raw.replace(' ', 'T') + ':00'
    const d = new Date(norm)
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)) {
    const norm = raw.replace(' ', 'T') + 'Z'
    const d = new Date(norm)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function getMakassarDateTimeParts(value, includeTime = false) {
  const d = parseAbsensiTimestamp(value)
  if (!d) return null

  const options = {
    timeZone: TZ_NAME,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }

  if (includeTime) {
    options.hour = '2-digit'
    options.minute = '2-digit'
    options.hour12 = false
    options.hourCycle = 'h23'
  }

  const parts = new Intl.DateTimeFormat(LOCALE_ID, options).formatToParts(d)
  const part = (type) => parts.find(p => p.type === type)?.value
  const hourPart = includeTime ? part('hour') : null
  const minutePart = includeTime ? part('minute') : null

  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: includeTime && hourPart ? String(Number(hourPart) % 24).padStart(2, '0') : null,
    minute: includeTime && minutePart ? String(Number(minutePart)).padStart(2, '0') : null
  }
}

export function toJamLokal(isoStr) {
  if (!isoStr) return '-'
  try {
    const raw = String(isoStr).trim()
    const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (m) {
      const hh = String(Math.max(0, Math.min(23, Number(m[1])))).padStart(2, '0')
      return `${hh}:${m[2]}`
    }

    const parts = getMakassarDateTimeParts(isoStr, true)
    if (!parts?.hour || !parts?.minute) return '-'
    return `${parts.hour}:${parts.minute}`
  } catch {
    return '-'
  }
}

export function toTanggalLokal(isoStr) {
  if (!isoStr) return '-'
  try {
    const parts = getMakassarDateTimeParts(isoStr, false)
    if (!parts?.day || !parts?.month || !parts?.year) return '-'
    return `${parts.day}/${parts.month}/${parts.year}`
  } catch {
    return '-'
  }
}

export function toTanggalJamLokal(isoStr) {
  if (!isoStr) return '-'
  try {
    const parts = getMakassarDateTimeParts(isoStr, true)
    if (!parts?.day || !parts?.month || !parts?.year || !parts?.hour || !parts?.minute) return '-'
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
  } catch {
    return '-'
  }
}

export function toDatetimeLocalLokal(isoStr) {
  if (!isoStr) return ''
  try {
    const parts = getMakassarDateTimeParts(isoStr, true)
    if (!parts?.day || !parts?.month || !parts?.year || !parts?.hour || !parts?.minute) return ''
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
  } catch {
    return ''
  }
}

export function toTanggalPanjangLokal(isoStr) {
  if (!isoStr) return '-'
  try {
    const d = parseAbsensiTimestamp(isoStr)
    if (!d) return '-'

    const parts = new Intl.DateTimeFormat(LOCALE_ID, {
      timeZone: TZ_NAME,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(d)
  } catch {
    return '-'
  }
}

export function toTanggalAbsensiLokal(tanggal, fallbackTimestamp = null) {
  const rawTanggal = String(tanggal ?? '').trim()

  if (rawTanggal && rawTanggal !== 'undefined' && rawTanggal !== 'null') {
    const dateOnly = rawTanggal.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnly) {
      const d = parseAbsensiTimestamp(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00+08:00`)
      if (d) {
        return new Intl.DateTimeFormat(LOCALE_ID, {
          timeZone: TZ_NAME,
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }).format(d)
      }
    }

    const formatted = toTanggalPanjangLokal(rawTanggal)
    if (formatted && formatted !== '-') return formatted
  }

  const fallback = toTanggalPanjangLokal(fallbackTimestamp)
  return fallback && fallback !== '-' ? fallback : 'Tanggal tidak tersedia'
}

export function toBulanTahunLokal(isoStr) {
  if (!isoStr) return '-'
  try {
    const d = parseAbsensiTimestamp(isoStr)
    if (!d) return '-'
    return new Intl.DateTimeFormat(LOCALE_ID, {
      timeZone: TZ_NAME,
      month: 'long',
      year: 'numeric'
    }).format(d)
  } catch {
    return '-'
  }
}

export function buildTimestampLokal(tanggal, jamHHMM) {
  if (!tanggal || !jamHHMM) return null
  try {
    const parts  = jamHHMM.trim().split(':')
    const jam    = String(parts[0] || '00').padStart(2, '0')
    const menit  = String(parts[1] || '00').padStart(2, '0')
    return `${tanggal}T${jam}:${menit}:00+08:00`
  } catch {
    return null
  }
}

export function getLabelTimezone() {
  return 'WITA (UTC+8)'
}

export function getDurasiMenit(waktuMasuk, waktuPulang) {
  const masuk = parseAbsensiTimestamp(waktuMasuk)
  const pulang = parseAbsensiTimestamp(waktuPulang)
  if (!masuk || !pulang) return null

  let menit = Math.round((pulang - masuk) / 60000)
  if (menit < 0) menit += 24 * 60
  if (menit < 0) return null
  return menit
}

export function getTodayLokal() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_NAME,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)

  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  const d = parts.find(p => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

function parseDateOnlyLocal(value) {
  if (!value) return null
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  return {
    date,
    year,
    month,
    day,
    value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
}

function formatDateOnlyLocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayLocal() {
  return getTodayLokal()
}

export function getCurrentMonthStartLocal(todayValue = getTodayLokal()) {
  const today = parseDateOnlyLocal(todayValue)
  if (!today) return null
  return `${today.year}-${String(today.month).padStart(2, '0')}-01`
}

export function getNextMonthStartLocal(todayValue = getTodayLokal()) {
  const today = parseDateOnlyLocal(todayValue)
  if (!today) return null
  const date = new Date(today.year, today.month, 1)
  return formatDateOnlyLocal(date)
}

export function getNextMonthEndLocal(todayValue = getTodayLokal()) {
  const today = parseDateOnlyLocal(todayValue)
  if (!today) return null
  const date = new Date(today.year, today.month + 1, 0)
  return formatDateOnlyLocal(date)
}

export function isAllowedLeaveDate(tanggal, todayValue = getTodayLokal()) {
  const selected = parseDateOnlyLocal(tanggal)
  const minDate = getCurrentMonthStartLocal(todayValue)
  const maxDate = getNextMonthEndLocal(todayValue)
  if (!selected || !minDate || !maxDate) return false
  return selected.value >= minDate && selected.value <= maxDate
}

export function isAllowedCorrectionDate(tanggal, todayValue = getTodayLokal()) {
  const selected = parseDateOnlyLocal(tanggal)
  const today = parseDateOnlyLocal(todayValue)
  if (!selected || !today) return false
  return selected.value <= today.value
}

export function validateLeaveDateRangeLocal(tanggalMulai, tanggalSelesai, todayValue = getTodayLokal()) {
  const start = parseDateOnlyLocal(tanggalMulai)
  const end = parseDateOnlyLocal(tanggalSelesai)
  if (!start) throw new Error('Tanggal mulai wajib diisi atau formatnya tidak valid')
  if (!end) throw new Error('Tanggal selesai wajib diisi atau formatnya tidak valid')
  if (end.value < start.value) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.')

  const minDate = getCurrentMonthStartLocal(todayValue)
  const maxDate = getNextMonthEndLocal(todayValue)
  if (!minDate || !maxDate) throw new Error('Tanggal lokal aplikasi tidak valid.')

  if (start.value < minDate || end.value < minDate) {
    throw new Error('Pengajuan tidak boleh untuk bulan sebelumnya.')
  }

  if (start.value > maxDate || end.value > maxDate) {
    throw new Error('Pengajuan hanya boleh untuk bulan berjalan atau bulan setelahnya.')
  }

  return true
}

export function validateCorrectionDateLocal(tanggal, todayValue = getTodayLokal()) {
  const selected = parseDateOnlyLocal(tanggal)
  if (!selected) throw new Error('Tanggal wajib diisi atau formatnya tidak valid')
  const today = parseDateOnlyLocal(todayValue)
  if (!today) throw new Error('Tanggal lokal aplikasi tidak valid.')
  if (selected.value > today.value) {
    throw new Error('Perbaikan absen tidak boleh untuk tanggal setelah hari ini.')
  }
  return true
}

export async function getTimezoneFromLokasi() {
  // Pertahankan compatibility agar import lama tidak rusak
  try {
    await supabase.from('lokasi_absen').select('id').limit(1)
  } catch {}
  return TZ_NAME
}
