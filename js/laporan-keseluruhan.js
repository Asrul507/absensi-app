import { supabase } from './supabase.js'
import { toJamLokal, getDurasiMenit } from './timezone.js'
import { showToast } from './feedback.js'
import { normalizeRole } from './access-control.js'
import {
  ATTENDANCE_REPORT_SELECT,
  applyAttendanceReportQueryScope,
  filterRowsByReportControls,
  filterRowsByUserScope,
  getReportRoleScope,
  getRowDepartment,
  getRowEmployeeName,
  getRowOffice,
  getRowOfficeDomain,
  getRowUsername,
  loadDepartmentOptionsForReport,
  loadOfficeOptionsForReport
} from './report-scope.js'

function safeText(value, fallback = '-') {
  const text = value === null || value === undefined || value === '' ? fallback : String(value)
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function formatJam(isoStr) { return toJamLokal(isoStr) }
function mntToHM(totalMenit) {
  const m = Number.parseInt(totalMenit, 10) || 0
  if (m <= 0) return '-'
  const jam = Math.floor(m / 60); const menit = m % 60
  if (jam <= 0) return `${menit}m`
  return menit ? `${jam}j ${menit}m` : `${jam}j`
}
function mntToReadable(totalMenit) { return mntToHM(totalMenit).replace('-', '0m') }
function hitungDurasiKerja(waktuMasuk, waktuPulang) {
  if (!waktuMasuk || !waktuPulang) return { menit: 0, label: '-' }
  const menit = getDurasiMenit(waktuMasuk, waktuPulang) ?? 0
  return { menit, label: mntToHM(menit) }
}
function badgeRadius(status) {
  if (!status) return '<span style="font-size:.72rem;color:var(--text-muted);">-</span>'
  const s = String(status).toLowerCase()
  if (s.includes('dalam') || s === 'in' || s.includes('valid') || s.includes('ok')) return '<span class="badge badge-green">IN</span>'
  if (s.includes('luar') || s === 'out' || s.includes('radius')) return '<span class="badge badge-red">OUT</span>'
  return `<span class="badge badge-yellow">${safeText(status)}</span>`
}
function badgeStatus(a) {
  const terlambat = a.status_masuk === 'Terlambat' && (Number.parseInt(a.menit_terlambat, 10) || 0) > 0
  if (!a.waktu_masuk) return '<span class="badge badge-red">Tidak Hadir</span>'
  if (!a.waktu_pulang) return '<span class="badge badge-yellow">Belum Pulang</span>'
  if (terlambat) return `<span class="badge badge-red">Terlambat ${safeText(a.menit_terlambat)}m</span>`
  return '<span class="badge badge-green">Tepat Waktu</span>'
}
function buildDepartmentOptions(departments = [], selected = '') {
  return `<option value="">Semua Department</option>${departments.map(d => `<option value="${safeText(d.id)}" ${String(d.id) === String(selected) ? 'selected' : ''}>${safeText(d.nama_department)}</option>`).join('')}`
}
function getFilterSummary() {
  const office = document.getElementById('lkFilterOffice')?.selectedOptions?.[0]?.textContent || 'Semua Office'
  const dept = document.getElementById('lkFilterDepartment')?.selectedOptions?.[0]?.textContent || 'Semua Department'
  return `${office} · ${dept}`
}

export async function renderLaporanKeseluruhan(user = window.currentUser) {
  const content = document.getElementById('content')
  const role = normalizeRole(user?.role)
  const scope = getReportRoleScope(user)
  const now = new Date()
  const fdStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const ldStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  content.innerHTML = `<div class="page-header fade-up"><h2><i class="fa fa-file-lines"></i> Laporan Absensi Keseluruhan</h2><button class="btn-primary btn-sm" onclick="window.downloadLaporanExcel()"><i class="fa fa-download"></i> Excel</button></div><div id="lkFilterCard" class="card fade-up" style="padding:14px 18px;margin-bottom:14px;"><div style="text-align:center;padding:16px;"><i class="fa fa-spinner fa-spin"></i> Memuat filter...</div></div><div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;" class="fade-up"><button id="lkTabRinci" class="btn-primary btn-sm" onclick="window.switchLaporanTab('rinci')"><i class="fa fa-table-list"></i> Detail Per Hari</button><button id="lkTabRekap" class="btn-secondary btn-sm" onclick="window.switchLaporanTab('rekap')"><i class="fa fa-chart-bar"></i> Rekap Per Staff</button></div><div id="lkSummaryCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:14px;" class="fade-up"></div><div id="lkTableArea" class="fade-up-1"><div class="card" style="text-align:center;padding:32px;"><i class="fa fa-spinner fa-spin"></i><p>Memuat data laporan…</p></div></div>`
  window._lkUser = user
  window._lkRole = role
  window._lkTabAktif = 'rinci'
  window._lkDataScoped = []
  window._lkDataRaw = []
  window._lkOfficeOptions = await loadOfficeOptionsForReport(user)
  window._lkDepartmentOptions = await loadDepartmentOptionsForReport(user, '')
  renderFilterCard(scope, user, fdStr, ldStr)
  await window.applyLaporanFilter()
}

function renderFilterCard(scope, user, fdStr, ldStr) {
  const card = document.getElementById('lkFilterCard')
  const officeName = user?.clients?.nama_client || user?.nama_client || user?.client_id || '-'
  const deptName = user?.departments?.nama_department || user?.departemen || user?.department_id || '-'
  const officeFilter = scope.isSuperAdmin ? `<div style="flex:1;min-width:170px;"><label>Office</label><select id="lkFilterOffice" onchange="window.reloadLaporanDepartments()"><option value="">Semua Office</option>${(window._lkOfficeOptions || []).map(c => `<option value="${safeText(c.id)}">${safeText(c.nama_client)} (${safeText(c.domain_login || c.kode_client)})</option>`).join('')}</select></div>` : (!scope.isStaff ? `<div style="flex:1;min-width:170px;"><label>Office</label><input value="${safeText(officeName)}" disabled></div>` : '')
  const departmentFilter = scope.isSuperAdmin || scope.isOfficeWide ? `<div style="flex:1;min-width:170px;"><label>Department</label><select id="lkFilterDepartment">${buildDepartmentOptions(window._lkDepartmentOptions || [])}</select></div>` : (scope.isDeptAdmin ? `<div style="flex:1;min-width:170px;"><label>Department</label><input value="${safeText(deptName)}" disabled></div>` : '')
  const nameFilter = !scope.isStaff ? `<div style="flex:2;min-width:170px;"><label>Nama Karyawan</label><input id="lkFilterNama" placeholder="Nama/username (kosong = semua)"></div>` : ''
  card.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">${officeFilter}${departmentFilter}${nameFilter}<div style="flex:1;min-width:130px;"><label>Dari Tanggal</label><input type="date" id="lkFilterDari" value="${fdStr}"></div><div style="flex:1;min-width:130px;"><label>Sampai Tanggal</label><input type="date" id="lkFilterSampai" value="${ldStr}"></div><button class="btn-primary btn-sm" onclick="window.applyLaporanFilter()"><i class="fa fa-search"></i> Tampilkan</button></div>`
}

window.reloadLaporanDepartments = async function() {
  try {
    const officeId = document.getElementById('lkFilterOffice')?.value || ''
    window._lkDepartmentOptions = await loadDepartmentOptionsForReport(window._lkUser, officeId)
    const dept = document.getElementById('lkFilterDepartment')
    if (dept) dept.innerHTML = buildDepartmentOptions(window._lkDepartmentOptions || [])
  } catch (err) { console.error('reloadLaporanDepartments error:', err); showToast('Gagal memuat Department laporan.', 'error') }
}
window.switchLaporanTab = function(tab) {
  window._lkTabAktif = tab
  document.getElementById('lkTabRinci').className = tab === 'rinci' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  document.getElementById('lkTabRekap').className = tab === 'rekap' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  renderLaporanArea()
}

window.applyLaporanFilter = async function() {
  const user = window._lkUser
  const dari = document.getElementById('lkFilterDari')?.value
  const sampai = document.getElementById('lkFilterSampai')?.value
  const officeId = document.getElementById('lkFilterOffice')?.value || ''
  const departmentId = document.getElementById('lkFilterDepartment')?.value || ''
  const name = document.getElementById('lkFilterNama')?.value || ''
  const tableArea = document.getElementById('lkTableArea')
  if (tableArea) tableArea.innerHTML = `<div class="card" style="text-align:center;padding:32px;"><i class="fa fa-spinner fa-spin"></i><p>Memuat data…</p></div>`
  try {
    let query = supabase.from('absensi').select(ATTENDANCE_REPORT_SELECT).eq('status_absensi', 'COMPLETE').order('tanggal', { ascending: false }).order('waktu_masuk', { ascending: true })
    query = applyAttendanceReportQueryScope(query, user)
    if (dari) query = query.gte('tanggal', dari)
    if (sampai) query = query.lte('tanggal', sampai)
    const { data, error } = await query
    if (error) throw error
    const scoped = filterRowsByUserScope(data || [], user)
    const filtered = filterRowsByReportControls(scoped, { officeId, departmentId, name })
    window._lkDataRaw = data || []
    window._lkDataScoped = filtered
    updateSummaryCards(filtered)
    renderLaporanArea()
  } catch (err) {
    console.error('Laporan filter error:', err)
    showToast('Gagal memuat laporan: ' + err.message, 'error')
    if (tableArea) tableArea.innerHTML = `<div class="card" style="padding:18px;border-left:4px solid var(--danger);"><strong style="color:var(--danger);">Gagal memuat laporan</strong><p>${safeText(err.message)}</p></div>`
  }
}

function updateSummaryCards(data = []) {
  let tepatWaktu = 0, terlambat = 0, tidakHadir = 0, radiusOut = 0
  data.forEach(a => { if (!a.waktu_masuk) tidakHadir++; else if (a.status_masuk === 'Terlambat' && (parseInt(a.menit_terlambat) || 0) > 0) terlambat++; else tepatWaktu++; const rs = String(a.status_lokasi || a.radius_status || a.lokasi_status || '').toLowerCase(); if (rs.includes('luar') || rs === 'out') radiusOut++ })
  const el = document.getElementById('lkSummaryCards')
  if (el) el.innerHTML = [['Total Records', data.length, 'var(--primary)'], ['Tepat Waktu', tepatWaktu, 'var(--success)'], ['Terlambat', terlambat, 'var(--danger)'], ['Tidak Hadir', tidakHadir, 'var(--warning)'], ['Radius OUT', radiusOut, '#7c3aed']].map(([label, val, color]) => `<div class="card" style="padding:14px;text-align:center;"><div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;">${label}</div><div style="font-size:1.7rem;font-weight:900;color:${color};">${val}</div></div>`).join('')
}
function renderLaporanArea() { window._lkTabAktif === 'rekap' ? renderTabRekap(window._lkDataScoped || []) : renderTabRinci(window._lkDataScoped || []) }

function renderTabRinci(data) {
  const el = document.getElementById('lkTableArea')
  if (!data.length) { el.innerHTML = `<div class="empty-state" style="padding:52px 24px;"><i class="fa fa-inbox"></i><p>Tidak ada data untuk filter yang dipilih</p></div>`; window._lkExportRinci = []; return }
  window._lkExportRinci = data.map(a => buildRinciExportRow(a))
  el.innerHTML = `<div class="card" style="padding:0;overflow:hidden;"><div class="tbl-wrap"><table><thead><tr><th>No</th><th>Nama Karyawan</th><th>Username</th><th>Office</th><th>Department</th><th>Tanggal</th><th>Jam Masuk</th><th>Jam Pulang</th><th>Status</th><th>Terlambat</th><th>Jam Kerja</th><th>Radius Masuk</th><th>Radius Pulang</th></tr></thead><tbody>${data.map((a, idx) => { const durasi = hitungDurasiKerja(a.waktu_masuk, a.waktu_pulang); const terlambatMnt = a.status_masuk === 'Terlambat' ? (parseInt(a.menit_terlambat) || 0) : 0; return `<tr><td class="td-num">${idx + 1}</td><td><strong>${safeText(getRowEmployeeName(a))}</strong></td><td>${safeText(getRowUsername(a))}</td><td>${safeText(getRowOffice(a))}<div style="font-size:.7rem;color:var(--text-muted);">${safeText(getRowOfficeDomain(a))}</div></td><td>${safeText(getRowDepartment(a))}</td><td>${safeText(a.tanggal)}</td><td>${formatJam(a.waktu_masuk)}</td><td>${formatJam(a.waktu_pulang)}</td><td>${badgeStatus(a)}</td><td>${terlambatMnt ? mntToReadable(terlambatMnt) : '-'}</td><td>${durasi.label}</td><td>${badgeRadius(a.status_lokasi || a.radius_status || a.lokasi_status)}</td><td>${badgeRadius(a.status_lokasi_pulang || a.radius_status_pulang)}</td></tr>` }).join('')}</tbody></table></div><div style="padding:10px 16px;font-size:.74rem;color:var(--text-muted);border-top:1px solid var(--gray-100);">Menampilkan <strong>${data.length}</strong> record absensi · ${safeText(getFilterSummary())}</div></div>`
}
function buildRinciExportRow(a) { const durasi = hitungDurasiKerja(a.waktu_masuk, a.waktu_pulang); return { 'Office': getRowOffice(a), 'Domain Office': getRowOfficeDomain(a), 'Department': getRowDepartment(a), 'Username': getRowUsername(a), 'Nama Karyawan': getRowEmployeeName(a), 'Tanggal': a.tanggal || '-', 'Jam Masuk': formatJam(a.waktu_masuk), 'Jam Pulang': formatJam(a.waktu_pulang), 'Status': a.status_masuk || (a.waktu_masuk ? 'Tepat Waktu' : 'Tidak Hadir'), 'Keterlambatan (menit)': a.status_masuk === 'Terlambat' ? (parseInt(a.menit_terlambat) || 0) : 0, 'Durasi Kerja': durasi.label, 'Radius Masuk': a.status_lokasi || a.radius_status || a.lokasi_status || '-', 'Radius Pulang': a.status_lokasi_pulang || a.radius_status_pulang || '-' } }

function renderTabRekap(data) {
  const el = document.getElementById('lkTableArea')
  if (!data.length) { el.innerHTML = `<div class="empty-state" style="padding:52px 24px;"><i class="fa fa-inbox"></i><p>Tidak ada data untuk filter yang dipilih</p></div>`; window._lkExportRekap = []; return }
  const grouped = new Map()
  data.forEach(a => { const key = a.user_id || `${getRowEmployeeName(a)}-${getRowUsername(a)}`; if (!grouped.has(key)) grouped.set(key, { user_id: key, nama: getRowEmployeeName(a), username: getRowUsername(a), office: getRowOffice(a), domain: getRowOfficeDomain(a), department: getRowDepartment(a), totalHari: 0, hadir: 0, tidakHadir: 0, tepatWaktu: 0, terlambatCount: 0, totalTerlambatMnt: 0, totalKerjaMnt: 0 }); const g = grouped.get(key); g.totalHari++; if (!a.waktu_masuk) g.tidakHadir++; else { g.hadir++; const terlambat = a.status_masuk === 'Terlambat' ? (parseInt(a.menit_terlambat) || 0) : 0; if (terlambat > 0) { g.terlambatCount++; g.totalTerlambatMnt += terlambat } else g.tepatWaktu++; g.totalKerjaMnt += hitungDurasiKerja(a.waktu_masuk, a.waktu_pulang).menit } })
  const rows = Array.from(grouped.values()).sort((a, b) => a.nama.localeCompare(b.nama))
  window._lkExportRekap = rows.map(r => ({ 'Office': r.office, 'Domain Office': r.domain, 'Department': r.department, 'Username': r.username, 'Nama Karyawan': r.nama, 'Total Hadir': r.hadir, 'Tepat Waktu': r.tepatWaktu, 'Terlambat': r.terlambatCount, 'Tidak Hadir': r.tidakHadir, 'Total Menit Terlambat': r.totalTerlambatMnt, 'Total Jam Kerja': mntToHM(r.totalKerjaMnt) }))
  el.innerHTML = `<div class="card" style="padding:0;overflow:hidden;"><div class="tbl-wrap"><table><thead><tr><th>No</th><th>Nama</th><th>Username</th><th>Office</th><th>Department</th><th>Hadir</th><th>Tepat Waktu</th><th>Terlambat</th><th>Tidak Hadir</th><th>Total Terlambat</th><th>Total Jam Kerja</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td class="td-num">${i + 1}</td><td><strong>${safeText(r.nama)}</strong></td><td>${safeText(r.username)}</td><td>${safeText(r.office)}<div style="font-size:.7rem;color:var(--text-muted);">${safeText(r.domain)}</div></td><td>${safeText(r.department)}</td><td>${r.hadir}</td><td>${r.tepatWaktu}</td><td>${r.terlambatCount}</td><td>${r.tidakHadir}</td><td>${mntToReadable(r.totalTerlambatMnt)}</td><td>${mntToHM(r.totalKerjaMnt)}</td></tr>`).join('')}</tbody></table></div></div>`
}

window.downloadLaporanExcel = function() {
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum dimuat.', 'warning'); return }
  const tab = window._lkTabAktif || 'rinci'
  const rows = tab === 'rekap' ? (window._lkExportRekap || []) : (window._lkExportRinci || [])
  if (!rows.length) { showToast('Tidak ada data untuk diexport.', 'info'); return }
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(14, k.length + 2) }))
  XLSX.utils.book_append_sheet(wb, ws, tab === 'rekap' ? 'Rekap Per Staff' : 'Detail Absensi')
  XLSX.writeFile(wb, `laporan-absensi-${tab}-${document.getElementById('lkFilterDari')?.value || 'mulai'}-to-${document.getElementById('lkFilterSampai')?.value || 'selesai'}.xlsx`)
}
