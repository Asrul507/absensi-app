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

export function toJamLokal(isoStr) {
  if (!isoStr) return '-'
  try {
    const raw = String(isoStr).trim()
    const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (m) {
      const hh = String(Math.max(0, Math.min(23, Number(m[1])))).padStart(2, '0')
      return `${hh}:${m[2]}`
    }

    const d = parseAbsensiTimestamp(isoStr)
    if (!d) return '-'
    return new Intl.DateTimeFormat(LOCALE_ID, {
      timeZone: TZ_NAME,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23'
    }).format(d)
  } catch {
    return '-'
  }
}

export function toTanggalLokal(isoStr) {
  if (!isoStr) return '-'
  try {
    const d = parseAbsensiTimestamp(isoStr)
    if (!d) return '-'
    return new Intl.DateTimeFormat(LOCALE_ID, {
      timeZone: TZ_NAME,
      day: '2-digit',
      month: '2-digit',
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

export async function getTimezoneFromLokasi() {
  // Pertahankan compatibility agar import lama tidak rusak
  try {
    await supabase.from('lokasi_absen').select('id').limit(1)
  } catch {}
  return TZ_NAME
}
