import { supabase } from './supabase.js'
import { toJamLokal, getDurasiMenit, buildTimestampLokal, toTanggalJamLokal } from './timezone.js'
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

const APPROVER_ROLES = ['admin', 'super_admin', 'spv']

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

export function calculateFinalAttendanceStatus(row = {}) {
  if (!row.waktu_masuk && row.waktu_pulang) return STATUS_KEHADIRAN.LUPA_ABSEN_MASUK
  if (row.waktu_masuk && !row.waktu_pulang) return STATUS_KEHADIRAN.LUPA_ABSEN_PULANG
  if (row.menit_pulang_cepat && Number(row.menit_pulang_cepat) > 0) return STATUS_KEHADIRAN.PULANG_CEPAT
  if (row.status_masuk === 'Terlambat' || Number(row.menit_terlambat || 0) > 0) return STATUS_KEHADIRAN.TERLAMBAT
  return STATUS_KEHADIRAN.HADIR
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
          <button class="btn-primary btn-sm" onclick="window.approveAttendance('${row.id}', '${suggested}')"><i class="fa fa-check"></i> Approve (${suggested.replaceAll('_',' ')})</button>
          <button class="btn-secondary btn-sm" onclick="window.approveAttendance('${row.id}', 'HADIR')"><i class="fa fa-pen"></i> Perbaiki & Approve</button>
          <button class="btn-danger btn-sm" onclick="window.rejectAttendance('${row.id}')"><i class="fa fa-times"></i> Reject</button>
        </div>
      </div>`
  }).join('')
}

window.approveAttendance = async function (id, finalStatus) {
  if (!canApproveAttendance()) return
  const note = document.getElementById(`note-${id}`)?.value || ''
  const masuk = document.getElementById(`editMasuk-${id}`)?.value || null
  const pulang = document.getElementById(`editPulang-${id}`)?.value || null
  const serverIso = await getServerTimeIso()
  const payload = {
    status_absensi: STATUS_ABSENSI.COMPLETE,
    status_kehadiran: finalStatus || STATUS_KEHADIRAN.HADIR,
    approved_by: window.currentUser?.id || null,
    approved_at: serverIso,
    approval_note: note || null
  }
  if (masuk) payload.waktu_masuk = localInputToMakassarIso(masuk)
  if (pulang) payload.waktu_pulang = localInputToMakassarIso(pulang)

  const { error } = await supabase.from('absensi').update(payload).eq('id', id)
  if (error) { alert('Gagal approve: ' + error.message); return }
  await window.loadAttendanceApproval()
}

window.rejectAttendance = async function (id) {
  if (!canApproveAttendance()) return
  const note = document.getElementById(`note-${id}`)?.value || ''
  const serverIso = await getServerTimeIso()
  const { error } = await supabase.from('absensi').update({
    status_absensi: STATUS_ABSENSI.REJECTED,
    approved_by: window.currentUser?.id || null,
    approved_at: serverIso,
    approval_note: note || null
  }).eq('id', id)
  if (error) { alert('Gagal reject: ' + error.message); return }
  await window.loadAttendanceApproval()
}
