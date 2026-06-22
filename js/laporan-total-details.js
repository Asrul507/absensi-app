import { toJamLokal, getDurasiMenit } from './timezone.js'
import { showToast } from './feedback.js'
import {
  getRowDepartment,
  getRowEmployeeName,
  getRowOffice,
  getRowOfficeDomain,
  getRowUsername
} from './report-scope.js'

function safeText(value, fallback = '-') {
  const text = value === null || value === undefined || value === '' ? fallback : String(value)
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function formatJam(value) { return value ? toJamLokal(value) : '-' }
function mntToHM(totalMenit) {
  const m = Number.parseInt(totalMenit, 10) || 0
  if (m <= 0) return '-'
  const jam = Math.floor(m / 60)
  const menit = m % 60
  if (jam <= 0) return `${menit}m`
  return menit ? `${jam}j ${menit}m` : `${jam}j`
}
function mntToReadable(totalMenit) { return mntToHM(totalMenit).replace('-', '0m') }
function durasiKerja(a) {
  if (!a?.waktu_masuk || !a?.waktu_pulang) return { menit: 0, label: '-' }
  const menit = getDurasiMenit(a.waktu_masuk, a.waktu_pulang) || 0
  return { menit, label: mntToHM(menit) }
}
function isLate(a) { return a?.status_masuk === 'Terlambat' && (Number.parseInt(a?.menit_terlambat, 10) || 0) > 0 }
function isAbsent(a) { return !a?.waktu_masuk }
function isForgotCheckout(a) { return Boolean(a?.waktu_masuk && !a?.waktu_pulang) }
function isRadiusOut(a) {
  const masuk = String(a?.status_lokasi || a?.radius_status || a?.lokasi_status || '').toLowerCase()
  const pulang = String(a?.status_lokasi_pulang || a?.radius_status_pulang || '').toLowerCase()
  return masuk.includes('luar') || masuk === 'out' || pulang.includes('luar') || pulang === 'out'
}
function textStatus(a) {
  return [a?.status_kehadiran, a?.status_absensi, a?.status_masuk, a?.keterangan, a?.alasan]
    .map(v => String(v || '').toLowerCase())
    .join(' ')
}
function hasWord(a, word) { return textStatus(a).includes(word) }
function baseRow(a) {
  const telat = isLate(a) ? (Number.parseInt(a.menit_terlambat, 10) || 0) : 0
  return {
    office: getRowOffice(a),
    domain: getRowOfficeDomain(a),
    department: getRowDepartment(a),
    username: getRowUsername(a),
    nama: getRowEmployeeName(a),
    tanggal: a?.tanggal || '-',
    jamMasuk: formatJam(a?.waktu_masuk),
    jamPulang: formatJam(a?.waktu_pulang),
    status: a?.status_masuk || a?.status_kehadiran || a?.status_absensi || '-',
    telatMenit: telat,
    telatLabel: mntToReadable(telat),
    jamKerja: durasiKerja(a).label,
    radiusMasuk: a?.status_lokasi || a?.radius_status || a?.lokasi_status || '-',
    radiusPulang: a?.status_lokasi_pulang || a?.radius_status_pulang || '-',
    keterangan: a?.keterangan || a?.alasan || '-'
  }
}
function buildRecap(data = []) {
  const late = []
  const onTime = []
  const absent = []
  const forgotCheckout = []
  const radiusOut = []
  const izin = []
  const sakit = []
  const cuti = []
  let totalLate = 0
  let totalWork = 0

  data.forEach(a => {
    const row = baseRow(a)
    if (isLate(a)) { late.push(row); totalLate += row.telatMenit }
    if (a?.waktu_masuk && !isLate(a)) onTime.push(row)
    if (isAbsent(a)) absent.push(row)
    if (isForgotCheckout(a)) forgotCheckout.push(row)
    if (isRadiusOut(a)) radiusOut.push(row)
    if (hasWord(a, 'izin')) izin.push(row)
    if (hasWord(a, 'sakit')) sakit.push(row)
    if (hasWord(a, 'cuti')) cuti.push(row)
    totalWork += durasiKerja(a).menit
  })

  const summary = [
    ['Total Record', data.length, 'Semua data sesuai filter', 'var(--primary)'],
    ['Total Hadir', data.filter(a => a.waktu_masuk).length, 'Ada jam masuk', 'var(--success)'],
    ['Tepat Waktu', onTime.length, 'Ada jam masuk dan tidak terlambat', 'var(--success)'],
    ['Total Terlambat', late.length, `${mntToReadable(totalLate)} total durasi`, 'var(--danger)'],
    ['Tidak Hadir', absent.length, 'Tidak ada jam masuk', 'var(--warning)'],
    ['Lupa Absen Pulang', forgotCheckout.length, 'Ada masuk, belum ada pulang', '#b45309'],
    ['Radius OUT', radiusOut.length, 'Masuk/pulang luar radius', '#7c3aed'],
    ['Izin', izin.length, 'Berdasarkan status/keterangan', '#1d4ed8'],
    ['Sakit', sakit.length, 'Berdasarkan status/keterangan', '#b45309'],
    ['Cuti', cuti.length, 'Berdasarkan status/keterangan', '#15803d'],
    ['Total Jam Kerja', mntToHM(totalWork), `${totalWork} menit`, 'var(--text)']
  ].map(([label, value, detail, color]) => ({ label, value, detail, color }))

  const groups = [
    { key: 'terlambat', title: 'Detail Total Terlambat', rows: late, columns: ['nama', 'tanggal', 'jamMasuk', 'telatMenit', 'telatLabel', 'office', 'department'], empty: 'Tidak ada data terlambat.' },
    { key: 'lupa-pulang', title: 'Detail Lupa Absen Pulang', rows: forgotCheckout, columns: ['nama', 'tanggal', 'jamMasuk', 'office', 'department'], empty: 'Tidak ada data lupa absen pulang.' },
    { key: 'tidak-hadir', title: 'Detail Tidak Hadir', rows: absent, columns: ['nama', 'tanggal', 'office', 'department', 'keterangan'], empty: 'Tidak ada data tidak hadir.' },
    { key: 'radius-out', title: 'Detail Radius OUT', rows: radiusOut, columns: ['nama', 'tanggal', 'jamMasuk', 'jamPulang', 'radiusMasuk', 'radiusPulang'], empty: 'Tidak ada data radius OUT.' },
    { key: 'izin', title: 'Detail Izin', rows: izin, columns: ['nama', 'tanggal', 'office', 'department', 'keterangan'], empty: 'Tidak ada data izin.' },
    { key: 'sakit', title: 'Detail Sakit', rows: sakit, columns: ['nama', 'tanggal', 'office', 'department', 'keterangan'], empty: 'Tidak ada data sakit.' },
    { key: 'cuti', title: 'Detail Cuti', rows: cuti, columns: ['nama', 'tanggal', 'office', 'department', 'keterangan'], empty: 'Tidak ada data cuti.' }
  ]
  return { summary, groups }
}
function colLabel(key) {
  return {
    nama: 'Nama', tanggal: 'Tanggal', jamMasuk: 'Jam Masuk', jamPulang: 'Jam Pulang', telatMenit: 'Durasi Terlambat (menit)', telatLabel: 'Durasi Terlambat', office: 'Office', department: 'Department', radiusMasuk: 'Radius Masuk', radiusPulang: 'Radius Pulang', keterangan: 'Keterangan'
  }[key] || key
}
function renderGroup(group) {
  const columns = group.columns || []
  const rows = group.rows || []
  const body = rows.length
    ? rows.map((row, idx) => `<tr><td class="td-num">${idx + 1}</td>${columns.map(col => `<td>${safeText(row[col])}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length + 1}" style="text-align:center;color:var(--text-muted);padding:18px;">${safeText(group.empty)}</td></tr>`
  return `<div class="card" style="padding:0;overflow:hidden;margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--gray-100);">
      <div style="font-weight:900;color:var(--text);"><i class="fa fa-list-check"></i> ${safeText(group.title)}</div>
      <span class="badge badge-blue">${rows.length} data</span>
    </div>
    <div class="tbl-wrap"><table><thead><tr><th>No</th>${columns.map(col => `<th>${safeText(colLabel(col))}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
  </div>`
}
function renderTotalDetail() {
  const el = document.getElementById('lkTableArea')
  if (!el) return
  const data = window._lkDataScoped || []
  if (!data.length) {
    el.innerHTML = `<div class="empty-state" style="padding:52px 24px;"><i class="fa fa-inbox"></i><p>Tidak ada data untuk filter yang dipilih</p></div>`
    return
  }
  const recap = buildRecap(data)
  window._lkExportTotalDetail = recap
  el.innerHTML = `<div class="card" style="padding:14px;margin-bottom:14px;">
    <div style="font-weight:900;margin-bottom:10px;color:var(--text);"><i class="fa fa-list-check"></i> Rekap Total Sesuai Filter</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
      ${recap.summary.map(item => `<div style="border:1px solid var(--gray-100);border-radius:14px;padding:12px;background:var(--white);"><div style="font-size:.64rem;color:var(--text-muted);text-transform:uppercase;font-weight:800;">${safeText(item.label)}</div><div style="font-size:1.45rem;font-weight:900;color:${item.color};margin-top:4px;">${safeText(item.value)}</div><div style="font-size:.68rem;color:var(--text-muted);margin-top:3px;">${safeText(item.detail)}</div></div>`).join('')}
    </div>
  </div>${recap.groups.map(renderGroup).join('')}`
}
function exportDetailRow(row) {
  return {
    'Office': row.office,
    'Department': row.department,
    'Username': row.username,
    'Nama Karyawan': row.nama,
    'Tanggal': row.tanggal,
    'Jam Masuk': row.jamMasuk,
    'Jam Pulang': row.jamPulang,
    'Status': row.status,
    'Durasi Terlambat (menit)': row.telatMenit,
    'Durasi Terlambat': row.telatLabel,
    'Jam Kerja': row.jamKerja,
    'Radius Masuk': row.radiusMasuk,
    'Radius Pulang': row.radiusPulang,
    'Keterangan': row.keterangan
  }
}
function exportTotalDetail() {
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum dimuat.', 'warning'); return }
  const recap = window._lkExportTotalDetail || buildRecap(window._lkDataScoped || [])
  const wb = XLSX.utils.book_new()
  const summaryRows = recap.summary.map(item => ({ Kategori: item.label, Total: item.value, Keterangan: item.detail }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Ringkasan Total')
  recap.groups.forEach(group => {
    const rows = (group.rows || []).map(exportDetailRow)
    if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), group.title.replace('Detail ', '').slice(0, 31))
  })
  XLSX.writeFile(wb, `laporan-absensi-total-detail-${document.getElementById('lkFilterDari')?.value || 'mulai'}-to-${document.getElementById('lkFilterSampai')?.value || 'selesai'}.xlsx`)
}
function ensureTotalTab() {
  const rekap = document.getElementById('lkTabRekap')
  if (!rekap || document.getElementById('lkTabTotalDetail')) return
  rekap.insertAdjacentHTML('afterend', `<button id="lkTabTotalDetail" class="btn-secondary btn-sm" onclick="window.switchLaporanTab('total-detail')"><i class="fa fa-list-check"></i> Rekap Total & Detail</button>`)
}
function setTabClass(tab) {
  const rinci = document.getElementById('lkTabRinci')
  const rekap = document.getElementById('lkTabRekap')
  const total = document.getElementById('lkTabTotalDetail')
  if (rinci) rinci.className = tab === 'rinci' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  if (rekap) rekap.className = tab === 'rekap' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  if (total) total.className = tab === 'total-detail' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
}
function installReportTotalDetails() {
  ensureTotalTab()
  if (typeof window.switchLaporanTab === 'function' && !window.switchLaporanTab.__totalDetailWrapped) {
    const originalSwitch = window.switchLaporanTab
    window.switchLaporanTab = function(tab) {
      if (tab === 'total-detail') {
        window._lkTabAktif = 'total-detail'
        setTabClass(tab)
        renderTotalDetail()
        return
      }
      originalSwitch(tab)
      setTabClass(tab)
    }
    window.switchLaporanTab.__totalDetailWrapped = true
  }
  if (typeof window.applyLaporanFilter === 'function' && !window.applyLaporanFilter.__totalDetailWrapped) {
    const originalApply = window.applyLaporanFilter
    window.applyLaporanFilter = async function(...args) {
      const result = await originalApply.apply(this, args)
      ensureTotalTab()
      if (window._lkTabAktif === 'total-detail') {
        setTabClass('total-detail')
        renderTotalDetail()
      }
      return result
    }
    window.applyLaporanFilter.__totalDetailWrapped = true
  }
  if (typeof window.downloadLaporanExcel === 'function' && !window.downloadLaporanExcel.__totalDetailWrapped) {
    const originalDownload = window.downloadLaporanExcel
    window.downloadLaporanExcel = function(...args) {
      if (window._lkTabAktif === 'total-detail') return exportTotalDetail()
      return originalDownload.apply(this, args)
    }
    window.downloadLaporanExcel.__totalDetailWrapped = true
  }
}
function hookNavigate() {
  if (typeof window.navigate !== 'function' || window.navigate.__totalDetailWrapped) return
  const originalNavigate = window.navigate
  window.navigate = async function(page, ...args) {
    const result = await originalNavigate.call(this, page, ...args)
    if (page === 'laporan-keseluruhan') setTimeout(installReportTotalDetails, 80)
    return result
  }
  window.navigate.__totalDetailWrapped = true
}
function retryInstallHook(attempt = 0) {
  hookNavigate()
  if (document.getElementById('lkTableArea')) installReportTotalDetails()
  if (attempt < 30 && typeof window.navigate !== 'function') {
    setTimeout(() => retryInstallHook(attempt + 1), 400)
  }
}

retryInstallHook()
document.addEventListener('DOMContentLoaded', () => retryInstallHook())
document.addEventListener('click', () => {
  if (document.getElementById('lkTableArea')) setTimeout(installReportTotalDetails, 50)
})
