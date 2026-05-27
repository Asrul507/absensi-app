import { supabase } from './supabase.js'

export const LEGACY_SHIFT_MAP = {
  '2': { code: '2', nama_shift: 'Shift Pagi', jam_masuk: '07:00', jam_pulang: '15:00' },
  '3': { code: '3', nama_shift: 'Shift Sore', jam_masuk: '15:00', jam_pulang: '23:00' },
  '4': { code: '4', nama_shift: 'Shift Malam', jam_masuk: '23:00', jam_pulang: '07:00' },
  '8': { code: '8', nama_shift: 'OFF', jam_masuk: '-', jam_pulang: '-' }
}

let cachedShiftRows = null

function normalizeName(name = '') {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ')
}

function fromRow(row, fallbackCode = null) {
  return {
    code: String(row.shift_code ?? row.kode_shift ?? fallbackCode ?? ''),
    nama_shift: row.nama_shift || row.nama || 'Shift',
    jam_masuk: row.jam_masuk || '-',
    jam_pulang: row.jam_pulang || '-'
  }
}

export async function loadShiftMaster() {
  if (cachedShiftRows) return cachedShiftRows
  const { data, error } = await supabase.from('shift').select('*')
  if (error) {
    console.warn('Gagal load shift master, fallback ke map legacy:', error.message)
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
  const rows = await loadShiftMaster()

  const byCode = rows.find(r => String(r.shift_code ?? r.kode_shift ?? '') === codeStr)
  if (byCode) return fromRow(byCode, codeStr)

  const legacy = LEGACY_SHIFT_MAP[codeStr]
  if (!legacy) return null

  const byName = rows.find(r => normalizeName(r.nama_shift) === normalizeName(legacy.nama_shift))
  if (byName) return fromRow(byName, codeStr)

  return { ...legacy }
}

export async function getAllShiftOptions() {
  const rows = await loadShiftMaster()
  const options = []

  for (const code of ['2', '3', '4', '8']) {
    const detail = await getShiftDetailByCode(code)
    if (detail) options.push(detail)
  }

  if (options.length) return options

  return Object.values(LEGACY_SHIFT_MAP)
}
