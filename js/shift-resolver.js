import { supabase } from './supabase.js'

const LEGACY_SHIFT_FALLBACKS = {
  '2': { code: '2', nama_shift: 'Shift Pagi', jam_masuk: '07:00', jam_pulang: '15:00', lintas_hari: false },
  '3': { code: '3', nama_shift: 'Shift Sore', jam_masuk: '15:00', jam_pulang: '23:00', lintas_hari: false },
  '4': { code: '4', nama_shift: 'Shift Malam', jam_masuk: '23:00', jam_pulang: '07:00', lintas_hari: true },
  '8': { code: '8', nama_shift: 'OFF', jam_masuk: '-', jam_pulang: '-', lintas_hari: false }
}

let cachedShiftRows = null

function normalizeName(name = '') {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeTime(value) {
  return String(value || '').trim().slice(0, 5)
}

function inferLintasHari(row) {
  if (row.lintas_hari !== undefined && row.lintas_hari !== null) return Boolean(row.lintas_hari)

  const masuk = normalizeTime(row.jam_masuk)
  const pulang = normalizeTime(row.jam_pulang)
  if (!masuk || !pulang || masuk === '-' || pulang === '-') return false

  return pulang < masuk
}

function fromRow(row, fallbackCode = null) {
  const code = String(row.id ?? row.shift_code ?? row.kode_shift ?? fallbackCode ?? '')
  return {
    code,
    nama_shift: row.nama_shift || row.nama || 'Shift',
    jam_masuk: row.jam_masuk || '-',
    jam_pulang: row.jam_pulang || '-',
    lintas_hari: inferLintasHari(row)
  }
}

export async function loadShiftMaster() {
  if (cachedShiftRows) return cachedShiftRows
  const { data, error } = await supabase.from('shift').select('*').order('id')
  if (error) {
    console.warn('Gagal load shift master, fallback ke kode legacy:', error.message)
    cachedShiftRows = []
    return cachedShiftRows
  }
  cachedShiftRows = Array.isArray(data) ? data : []
  return cachedShiftRows
}

export function resetShiftMasterCache() {
  cachedShiftRows = null
}

export async function getShiftDetailByCode(code) {
  const codeStr = String(code || '')
  if (!codeStr) return null

  const rows = await loadShiftMaster()

  const byId = rows.find(r => String(r.id ?? '') === codeStr)
  if (byId) return fromRow(byId, codeStr)

  const byShiftCode = rows.find(r => String(r.shift_code ?? r.kode_shift ?? '') === codeStr)
  if (byShiftCode) return fromRow(byShiftCode, codeStr)

  const legacy = LEGACY_SHIFT_FALLBACKS[codeStr]
  if (!legacy) return null

  const byName = rows.find(r => normalizeName(r.nama_shift || r.nama) === normalizeName(legacy.nama_shift))
  if (byName) return fromRow(byName, codeStr)

  return { ...legacy }
}

export async function getAllShiftOptions() {
  const rows = await loadShiftMaster()
  if (rows.length) return rows.map(row => fromRow(row))

  return Object.values(LEGACY_SHIFT_FALLBACKS).map(shift => ({ ...shift }))
}

export async function getShiftDetailByJamMasuk(jamMasuk) {
  const jam = normalizeTime(jamMasuk)
  if (!jam || jam === '--:--' || jam === '-') return null

  const rows = await loadShiftMaster()
  const byJam = rows.find(r => normalizeTime(r.jam_masuk) === jam)
  if (byJam) return fromRow(byJam)

  const legacy = Object.values(LEGACY_SHIFT_FALLBACKS).find(v => normalizeTime(v.jam_masuk) === jam)
  return legacy ? { ...legacy } : null
}
