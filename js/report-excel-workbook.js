import { toJamLokal, getDurasiMenit } from './timezone.js'
import { showToast } from './feedback.js'
import {
  getRowDepartment,
  getRowEmployeeName,
  getRowOffice,
  getRowOfficeDomain,
  getRowUsername
} from './report-scope.js'

function formatJam(value) { return value ? toJamLokal(value) : '-' }
function mntToHM(totalMenit) {
  const m = Number.parseInt(totalMenit, 10) || 0
  if (m <= 0) return '-'
  const jam = Math.floor(m / 60)
  const menit = m % 60
  if (jam <= 0) return `${menit}m`
  return menit ? `${jam}j ${menit}m` : `${jam}j`
}
function durasiKerja(a) {
  if (!a?.waktu_masuk || !a?.waktu_pulang) return { menit: 0, label: '-' }
  const menit = getDurasiMenit(a.waktu_masuk, a.waktu_pulang) || 0
  return { menit, label: mntToHM(menit) }
}
function isLate(a) { return a?.status_masuk === 'Terlambat' && (Number.parseInt(a?.menit_terlambat, 10) || 0) > 0 }
function isAbsent(a) { return !a?.waktu_masuk }
function isForgotCheckout(a) { return Boolean(a?.waktu_masuk && !a?.waktu_pulang) }
function textStatus(a) {
  return [a?.status_kehadiran, a?.status_absensi, a?.status_masuk, a?.keterangan, a?.alasan]
    .map(v => String(v || '').toLowerCase())
    .join(' ')
}
function hasWord(a, word) { return textStatus(a).includes(word) }
function isRadiusOut(a) {
  const masuk = String(a?.status_lokasi || a?.radius_status || a?.lokasi_status || '').toLowerCase()
  const pulang = String(a?.status_lokasi_pulang || a?.radius_status_pulang || '').toLowerCase()
  return masuk.includes('luar') || masuk === 'out' || pulang.includes('luar') || pulang === 'out'
}
function baseRow(a) {
  const lateMinutes = isLate(a) ? (Number.parseInt(a.menit_terlambat, 10) || 0) : 0
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
    lateMinutes,
    lateLabel: lateMinutes ? mntToHM(lateMinutes) : '-',
    jamKerja: durasiKerja(a).label,
    radiusMasuk: a?.status_lokasi || a?.radius_status || a?.lokasi_status || '-',
    radiusPulang: a?.status_lokasi_pulang || a?.radius_status_pulang || '-',
    keterangan: a?.keterangan || a?.alasan || '-'
  }
}
function getFilterMeta(data = []) {
  const first = data[0]
  const selectedOffice = document.getElementById('lkFilterOffice')?.selectedOptions?.[0]?.textContent?.trim()
  const selectedDept = document.getElementById('lkFilterDepartment')?.selectedOptions?.[0]?.textContent?.trim()
  const user = window.currentUser || {}
  const office = selectedOffice || user?.clients?.nama_client || user?.nama_client || getRowOffice(first) || 'Semua Office'
  const department = selectedDept || user?.departments?.nama_department || user?.departemen || getRowDepartment(first) || 'Semua Department'
  return {
    office,
    department,
    dari: document.getElementById('lkFilterDari')?.value || '-',
    sampai: document.getElementById('lkFilterSampai')?.value || '-'
  }
}
function addMetaRows(title, data) {
  const meta = getFilterMeta(data)
  return [
    [title],
    ['Nama Office', meta.office],
    ['Department', meta.department],
    ['Dari Tanggal', meta.dari],
    ['Sampai Tanggal', meta.sampai],
    []
  ]
}
function makeSheet(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const colCount = Math.max(...aoa.map(row => row.length), 1)
  ws['!cols'] = Array.from({ length: colCount }, (_, idx) => ({ wch: idx === 0 ? 24 : 18 }))
  return ws
}
function appendSheet(wb, name, aoa) {
  XLSX.utils.book_append_sheet(wb, makeSheet(aoa), name.slice(0, 31))
}
function detailPerHariAoa(data = []) {
  const rows = data.map(baseRow)
  return [
    ...addMetaRows('DETAIL ABSENSI PER HARI', data),
    ['No', 'Office', 'Domain Office', 'Department', 'Username', 'Nama Karyawan', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status', 'Durasi Terlambat (menit)', 'Durasi Terlambat', 'Jam Kerja', 'Radius Masuk', 'Radius Pulang', 'Keterangan'],
    ...rows.map((r, i) => [i + 1, r.office, r.domain, r.department, r.username, r.nama, r.tanggal, r.jamMasuk, r.jamPulang, r.status, r.lateMinutes, r.lateLabel, r.jamKerja, r.radiusMasuk, r.radiusPulang, r.keterangan])
  ]
}
function buildRecap(data = []) {
  const groups = {
    late: [],
    absent: [],
    forgotCheckout: [],
    radiusOut: [],
    izin: [],
    sakit: [],
    cuti: []
  }
  let totalLate = 0
  let totalWork = 0
  data.forEach(a => {
    const row = baseRow(a)
    if (isLate(a)) { groups.late.push(row); totalLate += row.lateMinutes }
    if (isAbsent(a)) groups.absent.push(row)
    if (isForgotCheckout(a)) groups.forgotCheckout.push(row)
    if (isRadiusOut(a)) groups.radiusOut.push(row)
    if (hasWord(a, 'izin')) groups.izin.push(row)
    if (hasWord(a, 'sakit')) groups.sakit.push(row)
    if (hasWord(a, 'cuti')) groups.cuti.push(row)
    totalWork += durasiKerja(a).menit
  })
  return {
    totalLate,
    totalWork,
    groups,
    summary: [
      ['Total Record', data.length, 'Semua data sesuai filter'],
      ['Total Hadir', data.filter(a => a.waktu_masuk).length, 'Ada jam masuk'],
      ['Tepat Waktu', data.filter(a => a.waktu_masuk && !isLate(a)).length, 'Ada jam masuk dan tidak terlambat'],
      ['Total Terlambat', groups.late.length, `${mntToHM(totalLate).replace('-', '0m')} total durasi`],
      ['Tidak Hadir', groups.absent.length, 'Tidak ada jam masuk'],
      ['Lupa Absen Pulang', groups.forgotCheckout.length, 'Ada masuk, belum ada pulang'],
      ['Radius OUT', groups.radiusOut.length, 'Masuk/pulang luar radius'],
      ['Izin', groups.izin.length, 'Berdasarkan status/keterangan'],
      ['Sakit', groups.sakit.length, 'Berdasarkan status/keterangan'],
      ['Cuti', groups.cuti.length, 'Berdasarkan status/keterangan'],
      ['Total Jam Kerja', mntToHM(totalWork), `${totalWork} menit`]
    ]
  }
}
function addDetailSection(aoa, title, rows, columns) {
  aoa.push([])
  aoa.push([title, `${rows.length} data`])
  aoa.push(['No', ...columns.map(c => c.label)])
  if (!rows.length) {
    aoa.push(['-', 'Tidak ada data'])
    return
  }
  rows.forEach((row, idx) => aoa.push([idx + 1, ...columns.map(c => row[c.key])]))
}
function rekapTotalDetailAoa(data = []) {
  const recap = buildRecap(data)
  const aoa = [
    ...addMetaRows('REKAP TOTAL & DETAIL', data),
    ['Kategori', 'Total', 'Keterangan'],
    ...recap.summary
  ]
  addDetailSection(aoa, 'Detail Total Terlambat', recap.groups.late, [
    { key: 'nama', label: 'Nama' }, { key: 'tanggal', label: 'Tanggal' }, { key: 'jamMasuk', label: 'Jam Masuk' }, { key: 'lateMinutes', label: 'Durasi Terlambat (menit)' }, { key: 'lateLabel', label: 'Durasi Terlambat' }, { key: 'office', label: 'Office' }, { key: 'department', label: 'Department' }
  ])
  addDetailSection(aoa, 'Detail Lupa Absen Pulang', recap.groups.forgotCheckout, [
    { key: 'nama', label: 'Nama' }, { key: 'tanggal', label: 'Tanggal' }, { key: 'jamMasuk', label: 'Jam Masuk' }, { key: 'office', label: 'Office' }, { key: 'department', label: 'Department' }
  ])
  addDetailSection(aoa, 'Detail Tidak Hadir', recap.groups.absent, [
    { key: 'nama', label: 'Nama' }, { key: 'tanggal', label: 'Tanggal' }, { key: 'office', label: 'Office' }, { key: 'department', label: 'Department' }, { key: 'keterangan', label: 'Keterangan' }
  ])
  addDetailSection(aoa, 'Detail Radius OUT', recap.groups.radiusOut, [
    { key: 'nama', label: 'Nama' }, { key: 'tanggal', label: 'Tanggal' }, { key: 'jamMasuk', label: 'Jam Masuk' }, { key: 'jamPulang', label: 'Jam Pulang' }, { key: 'radiusMasuk', label: 'Radius Masuk' }, { key: 'radiusPulang', label: 'Radius Pulang' }
  ])
  addDetailSection(aoa, 'Detail Izin', recap.groups.izin, [
    { key: 'nama', label: 'Nama' }, { key: 'tanggal', label: 'Tanggal' }, { key: 'office', label: 'Office' }, { key: 'department', label: 'Department' }, { key: 'keterangan', label: 'Keterangan' }
  ])
  addDetailSection(aoa, 'Detail Sakit', recap.groups.sakit, [
    { key: 'nama', label: 'Nama' }, { key: 'tanggal', label: 'Tanggal' }, { key: 'office', label: 'Office' }, { key: 'department', label: 'Department' }, { key: 'keterangan', label: 'Keterangan' }
  ])
  addDetailSection(aoa, 'Detail Cuti', recap.groups.cuti, [
    { key: 'nama', label: 'Nama' }, { key: 'tanggal', label: 'Tanggal' }, { key: 'office', label: 'Office' }, { key: 'department', label: 'Department' }, { key: 'keterangan', label: 'Keterangan' }
  ])
  return aoa
}
function problemLabel(a) {
  const parts = []
  if (isLate(a)) parts.push(`Terlambat ${Number.parseInt(a.menit_terlambat, 10) || 0} menit (${formatJam(a.waktu_masuk)})`)
  if (isAbsent(a)) parts.push('Tidak hadir')
  if (isForgotCheckout(a)) parts.push(`Lupa absen pulang (masuk ${formatJam(a.waktu_masuk)})`)
  if (isRadiusOut(a)) parts.push('Radius OUT')
  if (hasWord(a, 'izin')) parts.push('Izin')
  if (hasWord(a, 'sakit')) parts.push('Sakit')
  if (hasWord(a, 'cuti')) parts.push('Cuti')
  return parts.length ? `${a?.tanggal || '-'}: ${parts.join(', ')}` : ''
}
function rekapPerStaffAoa(data = []) {
  const grouped = new Map()
  data.forEach(a => {
    const key = a?.user_id || `${getRowEmployeeName(a)}-${getRowUsername(a)}`
    if (!grouped.has(key)) {
      grouped.set(key, {
        office: getRowOffice(a), domain: getRowOfficeDomain(a), department: getRowDepartment(a), username: getRowUsername(a), nama: getRowEmployeeName(a),
        totalRecord: 0, hadir: 0, tepatWaktu: 0, terlambat: 0, menitTerlambat: 0, tidakHadir: 0, lupaPulang: 0, radiusOut: 0, izin: 0, sakit: 0, cuti: 0, totalKerja: 0, masalah: []
      })
    }
    const row = grouped.get(key)
    row.totalRecord += 1
    if (a?.waktu_masuk) row.hadir += 1
    if (a?.waktu_masuk && !isLate(a)) row.tepatWaktu += 1
    if (isLate(a)) { row.terlambat += 1; row.menitTerlambat += Number.parseInt(a.menit_terlambat, 10) || 0 }
    if (isAbsent(a)) row.tidakHadir += 1
    if (isForgotCheckout(a)) row.lupaPulang += 1
    if (isRadiusOut(a)) row.radiusOut += 1
    if (hasWord(a, 'izin')) row.izin += 1
    if (hasWord(a, 'sakit')) row.sakit += 1
    if (hasWord(a, 'cuti')) row.cuti += 1
    row.totalKerja += durasiKerja(a).menit
    const problem = problemLabel(a)
    if (problem) row.masalah.push(problem)
  })
  const rows = Array.from(grouped.values()).sort((a, b) => a.nama.localeCompare(b.nama))
  return [
    ...addMetaRows('REKAP PER STAFF', data),
    ['No', 'Office', 'Domain Office', 'Department', 'Username', 'Nama Karyawan', 'Total Record', 'Total Hadir', 'Tepat Waktu', 'Total Terlambat', 'Total Menit Terlambat', 'Tidak Hadir', 'Lupa Absen Pulang', 'Radius OUT', 'Izin', 'Sakit', 'Cuti', 'Total Jam Kerja', 'Detail Absen Bermasalah'],
    ...rows.map((r, idx) => [idx + 1, r.office, r.domain, r.department, r.username, r.nama, r.totalRecord, r.hadir, r.tepatWaktu, r.terlambat, r.menitTerlambat, r.tidakHadir, r.lupaPulang, r.radiusOut, r.izin, r.sakit, r.cuti, mntToHM(r.totalKerja), r.masalah.join('; ') || '-'])
  ]
}
function exportWorkbookByActiveTab() {
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum dimuat.', 'warning'); return }
  const data = window._lkDataScoped || []
  if (!data.length) { showToast('Tidak ada data untuk diexport.', 'info'); return }
  const tab = window._lkTabAktif || 'rinci'
  const wb = XLSX.utils.book_new()
  if (tab === 'rekap') {
    appendSheet(wb, 'Rekap Per Staff', rekapPerStaffAoa(data))
  } else {
    appendSheet(wb, 'Detail Per Hari', detailPerHariAoa(data))
    appendSheet(wb, 'Rekap Total Detail', rekapTotalDetailAoa(data))
  }
  const meta = getFilterMeta(data)
  XLSX.writeFile(wb, `laporan-keseluruhan-${tab}-${meta.dari}-to-${meta.sampai}.xlsx`)
}
function installWorkbookExport() {
  if (typeof window.downloadLaporanExcel !== 'function' || window.downloadLaporanExcel.__workbookFormatWrapped) return
  const originalDownload = window.downloadLaporanExcel
  window.downloadLaporanExcel = function(...args) {
    if (document.getElementById('lkTableArea')) return exportWorkbookByActiveTab()
    return originalDownload.apply(this, args)
  }
  window.downloadLaporanExcel.__workbookFormatWrapped = true
}
function hookNavigate() {
  if (typeof window.navigate !== 'function' || window.navigate.__reportWorkbookWrapped) return
  const originalNavigate = window.navigate
  window.navigate = async function(page, ...args) {
    const result = await originalNavigate.call(this, page, ...args)
    if (page === 'laporan-keseluruhan') setTimeout(installWorkbookExport, 120)
    return result
  }
  window.navigate.__reportWorkbookWrapped = true
}
function retryInstall(attempt = 0) {
  hookNavigate()
  if (document.getElementById('lkTableArea')) installWorkbookExport()
  if (attempt < 30 && typeof window.navigate !== 'function') setTimeout(() => retryInstall(attempt + 1), 400)
}

retryInstall()
document.addEventListener('DOMContentLoaded', () => retryInstall())
document.addEventListener('click', () => {
  if (document.getElementById('lkTableArea')) setTimeout(installWorkbookExport, 50)
})
