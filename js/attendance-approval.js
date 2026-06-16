import { supabase } from './supabase.js'
import { toJamLokal, getDurasiMenit, buildTimestampLokal, toTanggalJamLokal } from './timezone.js'
import { getShiftDetailByCode } from './shift-resolver.js'
import { getServerTimeIso } from './server-time.js'

export const STATUS_ABSENSI = {
  OPEN: 'OPEN',
  COMPLETE: 'COMPLETE',
  REJECTED: 'REJECTED'
}

export const STATUS_KEHADIRAN = {
  MENUNGGU_VERIFIKASI: 'MENUNGGU_VERIFIKASI',
  HADIR: 'HADIR',
  TERLAMBAT: 'TERLAMBAT',
  PULANG_CEPAT: 'PULANG_CEPAT',
  LUPA_ABSEN_MASUK: 'LUPA_ABSEN_MASUK',
  LUPA_ABSEN_PULANG: 'LUPA_ABSEN_PULANG',
  CUTI: 'CUTI',
  IZIN: 'IZIN',
  SAKIT: 'SAKIT',
  OFF: 'OFF'
}

export const RADIUS_STATUS = {
  VALID: 'VALID',
  OUT_RADIUS: 'OUT_RADIUS'
}

const APPROVER_ROLES = ['admin', 'super_admin', 'spv', 'supervisor']

export function canApproveAttendance(user = window.currentUser) {
  return APPROVER_ROLES.includes(user?.role)
}

export function isCompleteAttendance(row) {
  return normalizeStatusAbsensi(row?.status_absensi) === STATUS_ABSENSI.COMPLETE
}

export function normalizeStatusAbsensi(status) {
  const value = String(status || '').trim().toUpperCase()
  if (value === 'COMPLETE' || value === 'APPROVED MANUAL') return STATUS_ABSENSI.COMPLETE
  if (value === 'REJECTED') return STATUS_ABSENSI.REJECTED
  return STATUS_ABSENSI.OPEN
}

export function getOpenStatusValues() {
  return ['OPEN', 'open', null]
}

export function determineRadiusStatus({ geo, selectedLocation, assignedLocation } = {}) {
  const inKnownArea = geo?.status === 'success' && Array.isArray(geo.areas) && geo.areas.length > 0
  const isTestingOutside = !inKnownArea || String(selectedLocation || '').includes('Luar Radius') || String(selectedLocation || '').includes('Testing')
  const wrongAssignedPoint = Boolean(assignedLocation && selectedLocation && selectedLocation !== assignedLocation)
  return (isTestingOutside || wrongAssignedPoint) ? RADIUS_STATUS.OUT_RADIUS : RADIUS_STATUS.VALID
}

export function buildPendingAttendanceFields(radiusStatus = RADIUS_STATUS.VALID, approvalFlag = null) {
  return {
    status_absensi: STATUS_ABSENSI.OPEN,
    status_kehadiran: STATUS_KEHADIRAN.MENUNGGU_VERIFIKASI,
    radius_status: radiusStatus,
    approval_flag: approvalFlag
  }
}

function timeToMinutes(value) {
  const [h, m] = String(value || '').slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function isShiftCrossDay(jamMasukJadwal = null, jamPulangJadwal = null) {
  const startMinutes = timeToMinutes(jamMasukJadwal)
  const endMinutes = timeToMinutes(jamPulangJadwal)
  return startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes
}

function minutesOnShiftDay(timeValue, jamMasukJadwal = null, jamPulangJadwal = null) {
  const minutes = timeToMinutes(timeValue)
  const startMinutes = timeToMinutes(jamMasukJadwal)
  if (minutes === null) return null
  if (isShiftCrossDay(jamMasukJadwal, jamPulangJadwal) && startMinutes !== null && minutes < startMinutes) return minutes + 1440
  return minutes
}

export function buildAttendanceDateTime(tanggal, jamInput, { jamMasukJadwal = null, jamPulangJadwal = null } = {}) {
  if (!tanggal || !jamInput) return null
  const [y, m, d] = String(tanggal).split('-').map(Number)
  const normalizedJam = String(jamInput).trim().slice(0, 5)
  if (!y || !m || !d || !/^\d{2}:\d{2}$/.test(normalizedJam)) return null

  const date = new Date(y, m - 1, d)
  const inputMinutes = timeToMinutes(normalizedJam)
  const startMinutes = timeToMinutes(jamMasukJadwal)
  if (isShiftCrossDay(jamMasukJadwal, jamPulangJadwal) && inputMinutes !== null && startMinutes !== null && inputMinutes < startMinutes) {
    date.setDate(date.getDate() + 1)
  }

  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return buildTimestampLokal(`${yyyy}-${mm}-${dd}`, normalizedJam)
}

export function recalculateAttendanceStatus(row = {}, shiftInfo = {}) {
  const waktuMasuk = row.waktu_masuk || null
  const waktuPulang = row.waktu_pulang || null
  const jamMasukJadwal = shiftInfo?.jam_masuk || row.jam_jadwal_masuk || null
  const jamPulangJadwal = shiftInfo?.jam_pulang || row.jam_jadwal_pulang || null

  if (!waktuMasuk && waktuPulang) {
    return {
      status_kehadiran: STATUS_KEHADIRAN.LUPA_ABSEN_MASUK,
      status_pulang: row.status_pulang || 'Manual',
      menit_pulang_cepat: Number(row.menit_pulang_cepat || 0)
    }
  }

  if (waktuMasuk && !waktuPulang) {
    return {
      status_kehadiran: STATUS_KEHADIRAN.LUPA_ABSEN_PULANG,
      status_pulang: null,
      menit_pulang_cepat: 0
    }
  }

  if (!waktuMasuk && !waktuPulang) {
    return {
      status_kehadiran: STATUS_KEHADIRAN.MENUNGGU_VERIFIKASI,
      status_pulang: null,
      menit_pulang_cepat: 0
    }
  }

  const actualPulangMinutes = minutesOnShiftDay(toJamLokal(waktuPulang), jamMasukJadwal, jamPulangJadwal)
  const targetPulangMinutes = minutesOnShiftDay(jamPulangJadwal, jamMasukJadwal, jamPulangJadwal)
  const minutesEarly = actualPulangMinutes !== null && targetPulangMinutes !== null
    ? Math.max(0, targetPulangMinutes - actualPulangMinutes)
    : 0

  return {
    status_kehadiran: minutesEarly > 0 ? STATUS_KEHADIRAN.PULANG_CEPAT : STATUS_KEHADIRAN.HADIR,
    status_pulang: minutesEarly > 0 ? 'Pulang Cepat' : 'Selesai',
    menit_pulang_cepat: minutesEarly
  }
}

export function calculateFinalAttendanceStatus(row = {}) {
  return recalculateAttendanceStatus(row).status_kehadiran
}

export function formatAttendanceStatus(status) {
  const value = String(status || '').replaceAll('_', ' ')
  return value || '-'
}

export function getTotalJamKerja(row) {
  if (!row?.waktu_masuk || !row?.waktu_pulang) return '-'
  const durasi = getDurasiMenit(row.waktu_masuk, row.waktu_pulang)
  if (durasi === null) return '-'
  return `${(durasi / 60).toFixed(2)} jam`
}


function localInputToMakassarIso(value) {
  if (!value) return null
  const raw = String(value).trim()

  const isoLike = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (isoLike) return buildTimestampLokal(isoLike[1], isoLike[2])

  const localLike = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})$/)
  if (localLike) {
    const [, day, month, year, jam] = localLike
    return buildTimestampLokal(`${year}-${month}-${day}`, jam)
  }

  return null
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]))
}

function imageThumb(url, label) {
  if (!url) return '<span style="color:var(--text-muted);font-size:.75rem;">-</span>'
  return `<button onclick="window.previewImageFullScreen('${escapeHtml(url)}')" style="border:none;background:transparent;padding:0;cursor:pointer;"><img src="${escapeHtml(url)}" alt="${label}" style="width:46px;height:46px;border-radius:10px;object-fit:cover;border:1px solid var(--border);"></button>`
}

function badge(text, color = '#475569', bg = '#f1f5f9') {
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;background:${bg};color:${color};font-weight:800;font-size:.68rem;white-space:nowrap;">${text}</span>`
}

export async function renderAttendanceApproval(user) {
  const content = document.getElementById('content')
  if (!content) return

  if (!canApproveAttendance(user)) {
    content.innerHTML = `<div class="card" style="padding:24px;text-align:center;"><i class="fa fa-lock" style="font-size:2rem;color:var(--danger);"></i><p style="font-weight:800;margin-top:10px;">Akses approval hanya untuk Admin, Super Admin, dan SPV.</p></div>`
    return
  }

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-clipboard-check"></i> Approval Absensi</h2>
    </div>
    <div class="card fade-up" style="padding:14px;margin-bottom:14px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <input id="approvalSearch" placeholder="Cari nama..." oninput="window.loadAttendanceApproval()" style="flex:1;min-width:180px;padding:10px;border:1.5px solid var(--border);border-radius:var(--r-md);">
        <button class="btn-secondary btn-sm" onclick="window.loadAttendanceApproval()"><i class="fa fa-refresh"></i> Refresh</button>
      </div>
    </div>
    <div id="approvalList"><div class="card" style="text-align:center;padding:28px;"><i class="fa fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i></div></div>
  `

  await window.loadAttendanceApproval()
}

window.loadAttendanceApproval = async function () {
  const container = document.getElementById('approvalList')
  if (!container) return

  const search = document.getElementById('approvalSearch')?.value?.trim() || ''
  let query = supabase
    .from('absensi')
    .select('*')
    .eq('status_absensi', STATUS_ABSENSI.OPEN)
    .order('tanggal', { ascending: false })
    .order('waktu_masuk', { ascending: true })

  if (search) query = query.ilike('nama', `%${search}%`)

  const { data, error } = await query
  if (error) {
    container.innerHTML = `<div class="card" style="padding:18px;color:var(--danger);">${escapeHtml(error.message)}</div>`
    return
  }

  const rows = data || []
  if (!rows.length) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:28px;color:var(--text-muted);"><i class="fa fa-circle-check" style="font-size:2rem;color:var(--success);"></i><p style="font-weight:800;margin-top:8px;">Tidak ada absensi OPEN.</p></div>`
    return
  }

  container.innerHTML = rows.map(row => {
    const radiusBadge = row.radius_status === RADIUS_STATUS.OUT_RADIUS
      ? badge('⚠ OUT_RADIUS', '#b91c1c', '#fee2e2')
      : badge('VALID', '#166534', '#dcfce7')
    const suggested = calculateFinalAttendanceStatus(row)
    return `
      <div class="card fade-up" style="padding:14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div style="font-weight:900;font-size:1rem;">${escapeHtml(row.nama || '-')}</div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(row.tanggal || '-')} · Shift ${escapeHtml(row.shift_code || row.kode_shift || '-')}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${badge('OPEN', '#b45309', '#fffbeb')}${radiusBadge}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:12px;font-size:.82rem;">
          <div><strong>Masuk</strong><br>${row.waktu_masuk ? toJamLokal(row.waktu_masuk) : '-'}</div>
          <div><strong>Pulang</strong><br>${row.waktu_pulang ? toJamLokal(row.waktu_pulang) : '-'}</div>
          <div><strong>Total Jam</strong><br>${getTotalJamKerja(row)}</div>
          <div><strong>Lokasi Masuk</strong><br>${escapeHtml(row.lokasi_masuk || '-')}</div>
          <div><strong>Lokasi Pulang</strong><br>${escapeHtml(row.lokasi_pulang || '-')}</div>
          <div><strong>Status</strong><br>${formatAttendanceStatus(row.status_kehadiran)}</div>
        </div>
        <div style="display:flex;gap:12px;margin-top:12px;align-items:center;">
          <div><div style="font-size:.65rem;font-weight:800;color:var(--text-muted);">Foto Masuk</div>${imageThumb(row.foto_masuk, 'Foto masuk')}</div>
          <div><div style="font-size:.65rem;font-weight:800;color:var(--text-muted);">Foto Pulang</div>${imageThumb(row.foto_pulang, 'Foto pulang')}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
          <input id="editMasuk-${row.id}" type="text" value="${row.waktu_masuk ? toTanggalJamLokal(row.waktu_masuk) : ''}" placeholder="DD/MM/YYYY HH:mm" inputmode="numeric" style="padding:9px;border:1px solid var(--border);border-radius:10px;">
          <input id="editPulang-${row.id}" type="text" value="${row.waktu_pulang ? toTanggalJamLokal(row.waktu_pulang) : ''}" placeholder="DD/MM/YYYY HH:mm" inputmode="numeric" style="padding:9px;border:1px solid var(--border);border-radius:10px;">
        </div>
        <textarea id="note-${row.id}" placeholder="Catatan approval (opsional)" style="width:100%;margin-top:8px;padding:9px;border:1px solid var(--border);border-radius:10px;min-height:58px;"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button class="btn-primary btn-sm" onclick="window.approveAttendance('${row.id}', '${suggested}', this)"><i class="fa fa-check"></i> Approve (${suggested.replaceAll('_',' ')})</button>
          <button class="btn-secondary btn-sm" onclick="window.approveAttendance('${row.id}', 'HADIR', this)"><i class="fa fa-pen"></i> Simpan Edit & Approve</button>
          <button class="btn-danger btn-sm" onclick="window.rejectAttendance('${row.id}', this)"><i class="fa fa-times"></i> Reject</button>
        </div>
      </div>`
  }).join('')
}

function setAttendanceApprovalButtons(id, disabled) {
  document.querySelectorAll(`button[onclick*="${id}"]`).forEach(btn => { btn.disabled = disabled })
}

function denyAttendanceApprovalAccess() {
  alert('Akses approval absensi hanya untuk Admin, Super Admin, dan SPV.')
}

window.approveAttendance = async function (id, finalStatus, actionButton = null) {
  if (!canApproveAttendance()) { denyAttendanceApprovalAccess(); return }
  setAttendanceApprovalButtons(id, true)
  const originalButtonHtml = actionButton?.innerHTML || ''
  if (actionButton) actionButton.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'
  const note = document.getElementById(`note-${id}`)?.value || ''
  const masuk = document.getElementById(`editMasuk-${id}`)?.value || null
  const pulang = document.getElementById(`editPulang-${id}`)?.value || null

  try {
    const serverIso = await getServerTimeIso()

    const { data: currentRow, error: currentError } = await supabase
    .from('absensi')
    .select('*')
    .eq('id', id)
    .eq('status_absensi', STATUS_ABSENSI.OPEN)
    .maybeSingle()
    if (currentError) throw new Error('Gagal memuat absensi: ' + currentError.message)
    if (!currentRow) throw new Error('Approval gagal: absensi sudah diproses atau tidak lagi berstatus OPEN.')

  const nextRow = { ...currentRow }
  if (masuk) nextRow.waktu_masuk = localInputToMakassarIso(masuk)
  if (pulang) nextRow.waktu_pulang = localInputToMakassarIso(pulang)

  const shiftInfo = currentRow.shift_code ? await getShiftDetailByCode(currentRow.shift_code) : null
  const recalculated = recalculateAttendanceStatus(nextRow, shiftInfo || {})
  const payload = {
    status_absensi: STATUS_ABSENSI.COMPLETE,
    status_kehadiran: recalculated.status_kehadiran,
    status_pulang: recalculated.status_pulang,
    menit_pulang_cepat: recalculated.menit_pulang_cepat,
    approved_by: window.currentUser?.id || null,
    approved_at: serverIso,
    approval_note: note || null
  }
  if (nextRow.waktu_masuk !== currentRow.waktu_masuk) payload.waktu_masuk = nextRow.waktu_masuk
  if (nextRow.waktu_pulang !== currentRow.waktu_pulang) payload.waktu_pulang = nextRow.waktu_pulang

  console.log('[APPROVAL ABSENSI] before approve update', { id, payload, manualActionLabel: finalStatus })
  const updateResult = await supabase
    .from('absensi')
    .update(payload)
    .eq('id', id)
    .eq('status_absensi', STATUS_ABSENSI.OPEN)
    .select('id,status_absensi,status_kehadiran,approved_by,approved_at,approval_note,waktu_masuk,waktu_pulang,status_pulang,menit_pulang_cepat')
    .maybeSingle()
  console.log('[APPROVAL ABSENSI] approve update response', updateResult)

    if (updateResult.error) throw new Error('Gagal approve: ' + updateResult.error.message)
    if (!updateResult.data) throw new Error('Approval gagal: absensi sudah diproses atau tidak lagi berstatus OPEN.')

  const verifyResult = await supabase
    .from('absensi')
    .select('id,status_absensi,status_kehadiran,approved_by,approved_at,approval_note,waktu_masuk,waktu_pulang,status_pulang,menit_pulang_cepat')
    .eq('id', id)
    .maybeSingle()
  console.log('[APPROVAL ABSENSI] approve verify from DB', verifyResult)

    if (verifyResult.error) throw new Error('Gagal cek ulang approval: ' + verifyResult.error.message)
  if (verifyResult.data?.status_absensi !== STATUS_ABSENSI.COMPLETE) {
      throw new Error('Approval belum tersimpan sebagai COMPLETE. Silakan coba lagi.')
  }

    await window.loadAttendanceApproval()
  } catch (err) {
    alert(err.message || 'Gagal approve absensi.')
    setAttendanceApprovalButtons(id, false)
    if (actionButton && originalButtonHtml) actionButton.innerHTML = originalButtonHtml
  }
}

window.rejectAttendance = async function (id, actionButton = null) {
  if (!canApproveAttendance()) { denyAttendanceApprovalAccess(); return }
  setAttendanceApprovalButtons(id, true)
  const originalButtonHtml = actionButton?.innerHTML || ''
  if (actionButton) actionButton.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'
  const note = document.getElementById(`note-${id}`)?.value || ''

  try {
    const serverIso = await getServerTimeIso()
    const payload = {
    status_absensi: STATUS_ABSENSI.REJECTED,
    approved_by: window.currentUser?.id || null,
    approved_at: serverIso,
    approval_note: note || null
  }

  console.log('[APPROVAL ABSENSI] before reject update', { id, payload })
  const updateResult = await supabase
    .from('absensi')
    .update(payload)
    .eq('id', id)
    .eq('status_absensi', STATUS_ABSENSI.OPEN)
    .select('id,status_absensi,status_kehadiran,approved_by,approved_at,approval_note')
    .maybeSingle()
  console.log('[APPROVAL ABSENSI] reject update response', updateResult)

    if (updateResult.error) throw new Error('Gagal reject: ' + updateResult.error.message)
    if (!updateResult.data) throw new Error('Reject gagal: absensi sudah diproses atau tidak lagi berstatus OPEN.')

  const verifyResult = await supabase
    .from('absensi')
    .select('id,status_absensi,status_kehadiran,approved_by,approved_at,approval_note')
    .eq('id', id)
    .maybeSingle()
  console.log('[APPROVAL ABSENSI] reject verify from DB', verifyResult)

    if (verifyResult.error) throw new Error('Gagal cek ulang reject: ' + verifyResult.error.message)
  if (verifyResult.data?.status_absensi !== STATUS_ABSENSI.REJECTED) {
      throw new Error('Reject belum tersimpan sebagai REJECTED. Silakan coba lagi.')
  }

    await window.loadAttendanceApproval()
  } catch (err) {
    alert(err.message || 'Gagal reject absensi.')
    setAttendanceApprovalButtons(id, false)
    if (actionButton && originalButtonHtml) actionButton.innerHTML = originalButtonHtml
  }
}
