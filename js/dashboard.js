import { supabase } from './supabase.js'
import { getTodayLokal, getDurasiMenit, toJamLokal, toTanggalLokal, toTanggalAbsensiLokal } from './timezone.js'
import { createTotalJamKerjaChart, createAktivitasChart, createAbsensiChart } from './chart-helpers.js'
import { canApproveAttendance } from './attendance-approval.js'
import { getServerTimeIso, startServerDigitalClock } from './server-time.js'
import { getSisaCuti } from './services/leave-service.js'
import { applyTenantFilter, isSuperAdmin, isStaff } from './access-control.js'

const FILTER_KEY = 'genpro_dashboard_filter_v1'

function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
  return String(value ?? '').replace(/[&<>"']/g, c => map[c])
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function monthRange(today = getTodayLokal()) {
  const [y, m] = today.split('-').map(Number)
  return {
    dateFrom: new Date(Date.UTC(y, m - 1, 1)).toISOString().split('T')[0],
    dateTo: new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0],
    preset: 'month'
  }
}

function getRange() {
  const fallback = monthRange()
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}')
    const dateFrom = saved.dateFrom || fallback.dateFrom
    const dateTo = saved.dateTo || fallback.dateTo
    if (!dateFrom || !dateTo || dateFrom > dateTo) return fallback
    return { dateFrom, dateTo, preset: saved.preset || 'custom' }
  } catch {
    return fallback
  }
}

function saveRange(dateFrom, dateTo, preset = 'custom') {
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    window.showToast?.('Range tanggal dashboard tidak valid.', 'warning')
    return false
  }
  localStorage.setItem(FILTER_KEY, JSON.stringify({ dateFrom, dateTo, preset }))
  return true
}

async function fetchAbsensiRowsForUser({ userId, nama, dateFrom = null, dateTo = null, tanggal = null, select = '*' } = {}) {
  const applyDateFilter = q => {
    if (tanggal) return q.eq('tanggal', tanggal)
    if (dateFrom) q = q.gte('tanggal', dateFrom)
    if (dateTo) q = q.lte('tanggal', dateTo)
    return q
  }

  if (userId) {
    let byUser = applyTenantFilter(supabase.from('absensi').select(select).eq('user_id', userId), { userColumn: 'user_id' })
    const { data, error } = await applyDateFilter(byUser)
    if (error) throw error
    if (Array.isArray(data) ? data.length : data) return data
  }

  if (!nama) return tanggal ? null : []
  let byName = applyTenantFilter(supabase.from('absensi').select(select).eq('nama', nama), { userColumn: 'user_id' })
  const { data, error } = await applyDateFilter(byName)
  if (error) throw error
  return data || (tanggal ? null : [])
}

async function fetchAbsensiSingleForUser(options) {
  const rows = await fetchAbsensiRowsForUser(options)
  return Array.isArray(rows) ? (rows[0] || null) : rows
}

function stat(label, value, note, icon, tone = '') {
  return `<div class="gp-stat-card ${tone}"><div class="gp-stat-icon"><i class="fa ${icon}"></i></div><small>${label}</small><strong>${value}</strong><span>${note}</span></div>`
}

function badgeClass(status) {
  const s = String(status || '').toLowerCase()
  if (s.includes('complete') || s.includes('hadir') || s.includes('tepat')) return 'gp-badge-green'
  if (s.includes('open') || s.includes('pending') || s.includes('menunggu') || s.includes('terlambat')) return 'gp-badge-yellow'
  if (s.includes('lupa') || s.includes('tidak') || s.includes('alpha') || s.includes('tolak')) return 'gp-badge-red'
  return 'gp-badge-blue'
}

function filterHtml({ dateFrom, dateTo, preset }) {
  return `
    <div class="gp-filter-card">
      <div>
        <div style="font-size:.72rem;font-weight:900;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Filter Data Dashboard</div>
        <div class="gp-filter-fields">
          <div class="gp-field"><label>Dari Tanggal</label><input id="dashboardDateFrom" type="date" value="${dateFrom}"></div>
          <div class="gp-field"><label>Sampai Tanggal</label><input id="dashboardDateTo" type="date" value="${dateTo}"></div>
          <div class="gp-field"><label>Periode Cepat</label><select id="dashboardPreset"><option value="custom" ${preset === 'custom' ? 'selected' : ''}>Custom</option><option value="today" ${preset === 'today' ? 'selected' : ''}>Hari Ini</option><option value="last7" ${preset === 'last7' ? 'selected' : ''}>7 Hari Terakhir</option><option value="month" ${preset === 'month' ? 'selected' : ''}>Bulan Berjalan</option></select></div>
        </div>
      </div>
      <div class="gp-filter-actions"><button class="gp-btn gp-btn-soft" onclick="window.resetDashboardFilter?.()"><i class="fa fa-rotate-left"></i> Reset</button><button class="gp-btn gp-btn-primary" onclick="window.applyDashboardFilter?.()"><i class="fa fa-filter"></i> Terapkan</button></div>
    </div>`
}

function bindDashboardFilterEvents() {
  const presetEl = document.getElementById('dashboardPreset')
  const fromEl = document.getElementById('dashboardDateFrom')
  const toEl = document.getElementById('dashboardDateTo')
  if (!presetEl || !fromEl || !toEl) return
  presetEl.addEventListener('change', () => {
    const today = getTodayLokal()
    if (presetEl.value === 'today') fromEl.value = toEl.value = today
    if (presetEl.value === 'last7') { fromEl.value = addDays(today, -6); toEl.value = today }
    if (presetEl.value === 'month') { const r = monthRange(today); fromEl.value = r.dateFrom; toEl.value = r.dateTo }
  })
}

window.applyDashboardFilter = function () {
  const dateFrom = document.getElementById('dashboardDateFrom')?.value
  const dateTo = document.getElementById('dashboardDateTo')?.value
  const preset = document.getElementById('dashboardPreset')?.value || 'custom'
  if (saveRange(dateFrom, dateTo, preset)) renderDashboard()
}

window.resetDashboardFilter = function () {
  localStorage.setItem(FILTER_KEY, JSON.stringify(monthRange()))
  renderDashboard()
}

export async function renderDashboard() {
  const content = document.getElementById('content')
  const user = window.currentUser
  if (!content) return
  if (!user) { content.innerHTML = `<div class="card"><p>Silakan login dulu</p></div>`; return }

  try {
    if (isSuperAdmin(user)) { await renderSuperAdminDashboard(content); return }

    const serverIso = await getServerTimeIso()
    const range = getRange()
    const todayLocal = getTodayLokal()
    const isAdmin = canApproveAttendance(user) && !isStaff(user)
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    const fullName = profile?.nama_lengkap || user.nama_lengkap || user.email || 'User'
    let saldo = { sisa: profile?.sisa_cuti || 0, status: '-', periode_mulai: null, periode_selesai: null }
    try { saldo = await getSisaCuti(user.id, profile?.tanggal_bergabung || user.tanggal_bergabung) } catch (err) { console.warn('Gagal memuat saldo cuti tahunan:', err) }
    if (profile?.foto_url && profile.foto_url !== window.currentUser.foto_url) window.currentUser.foto_url = profile.foto_url

    const body = isAdmin ? await adminBody(user, range) : await personalBody({ user, fullName, range, todayLocal, sisaCuti: saldo.sisa || 0, saldo })

    content.innerHTML = `
      <div class="gp-dashboard-shell">
        <div class="gp-dashboard-hero"><div><div style="font-size:.72rem;font-weight:900;text-transform:uppercase;color:rgba(255,255,255,.72);margin-bottom:8px;">GenPro Absensi App</div><h2>Dashboard ${isAdmin ? 'Admin' : 'Personal'}</h2><p>${esc(fullName)} · Ringkasan berdasarkan filter tanggal</p></div><div class="gp-hero-clock"><span>Waktu Server</span><strong id="dashboardLiveClock">--:--:--</strong><span id="dashboardLiveDate">Memuat waktu server...</span></div></div>
        ${filterHtml(range)}
        ${body.html}
        ${chartsSection(range)}
        <div class="gp-panel"><div class="gp-panel-title"><strong>Kalender HRD</strong><span>Jadwal kerja dan agenda</span></div><div style="padding:12px;text-align:center;border:1.5px dashed var(--border);border-radius:16px;background:var(--gray-50);"><p style="font-size:.85rem;color:var(--text-muted);margin-bottom:10px;">Lihat jadwal kerja dan agenda perusahaan.</p><button class="gp-btn gp-btn-primary" onclick="window.navigate('kalender')"><i class="fa fa-eye"></i> Buka Kalender HRD</button></div></div>
      </div>`

    bindDashboardFilterEvents()
    startServerDigitalClock({ key: 'dashboard', timeElementId: 'dashboardLiveClock', dateElementId: 'dashboardLiveDate', serverIso: serverIso || new Date().toISOString() })
    const totalJamKerja = isAdmin ? 0 : body.totalJamKerja
    if (typeof Chart === 'undefined') {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
      script.onload = () => loadCharts(user.id, range.dateFrom, range.dateTo, totalJamKerja)
      document.head.appendChild(script)
    } else loadCharts(user.id, range.dateFrom, range.dateTo, totalJamKerja)
  } catch (err) {
    console.error('Gagal render dashboard:', err)
    content.innerHTML = `<div class="card" style="padding:18px;border-color:#fecaca;background:#fef2f2;color:#991b1b;"><strong>Dashboard gagal dimuat.</strong><p style="margin:.5rem 0 0;">Data tidak dapat ditampilkan. Coba muat ulang atau hubungi admin.</p></div>`
    window.showToast?.('Dashboard gagal dimuat.', 'error')
  }
}

async function personalBody({ user, fullName, range, todayLocal, sisaCuti, saldo }) {
  const rows = await fetchAbsensiRowsForUser({ userId: user.id, nama: fullName, dateFrom: range.dateFrom, dateTo: range.dateTo, select: 'tanggal,waktu_masuk,waktu_pulang,status_masuk,status_absensi,status_kehadiran' })
  const complete = (rows || []).filter(a => a.status_absensi === 'COMPLETE')
  let totalJamKerja = 0
  complete.forEach(a => { if (a.waktu_masuk && a.waktu_pulang) { const m = getDurasiMenit(a.waktu_masuk, a.waktu_pulang); if (m !== null) totalJamKerja += m / 60 } })
  const today = await fetchAbsensiSingleForUser({ userId: user.id, nama: fullName, tanggal: todayLocal, select: 'waktu_masuk,waktu_pulang,status_absensi,status_kehadiran' })
  const { data: shift } = await supabase.from('jadwal').select('shift_code,status_override').eq('user_id', user.id).eq('tanggal', todayLocal).maybeSingle()
  const hadir = complete.filter(a => a.waktu_masuk).length
  const telat = complete.filter(a => a.status_masuk === 'Terlambat' || a.status_kehadiran === 'TERLAMBAT').length
  const lupa = (rows || []).filter(a => String(a.status_kehadiran || '').includes('LUPA') || (a.waktu_masuk && !a.waktu_pulang)).length
  const history = (rows || []).slice().sort((a,b) => String(b.tanggal).localeCompare(String(a.tanggal))).slice(0,5)
  return { totalJamKerja, html: `<div class="gp-stat-grid">${stat('Hadir', hadir, 'Periode terpilih', 'fa-user-check', 'gp-stat-green')}${stat('Terlambat', telat, 'Periode terpilih', 'fa-clock', 'gp-stat-yellow')}${stat('Lupa Pulang', lupa, 'Butuh perhatian', 'fa-triangle-exclamation', 'gp-stat-red')}${stat('Jam Kerja', totalJamKerja.toFixed(1), 'Total jam periode', 'fa-business-time')}</div><div class="gp-chart-grid"><div class="gp-panel"><div class="gp-panel-title"><strong>Status Hari Ini</strong><span>${toTanggalLokal(todayLocal)}</span></div><div class="gp-mini-row"><span>Shift</span><strong>${esc(shift?.status_override || shift?.shift_code || '-')}</strong></div><div class="gp-mini-row"><span>Status Absen</span><strong><span class="gp-badge ${badgeClass(today?.status_absensi)}">${esc(today?.status_absensi || 'Belum Absen')}</span></strong></div><div class="gp-mini-row"><span>Masuk</span><strong>${today?.waktu_masuk ? toJamLokal(today.waktu_masuk) : '-'}</strong></div><div class="gp-mini-row"><span>Pulang</span><strong>${today?.waktu_pulang ? toJamLokal(today.waktu_pulang) : '-'}</strong></div><div class="gp-mini-row"><span>Saldo Cuti</span><strong>${sisaCuti} hari</strong></div><div style="margin-top:10px;font-size:.75rem;color:var(--text-muted);">${esc(saldo.status || '-')} · ${esc(saldo.periode_mulai || '-')} s/d ${esc(saldo.periode_selesai || '-')}</div></div><div class="gp-panel"><div class="gp-panel-title"><strong>Riwayat Terbaru</strong><span>5 data terakhir</span></div>${history.length ? history.map(r => `<div class="gp-mini-row"><span>${toTanggalAbsensiLokal(r?.tanggal, r?.waktu_masuk || r?.waktu_pulang)}</span><span>${r.waktu_masuk ? toJamLokal(r.waktu_masuk) : '-'} → ${r.waktu_pulang ? toJamLokal(r.waktu_pulang) : '-'}</span><strong><span class="gp-badge ${badgeClass(r.status_absensi)}">${esc(r.status_absensi || '-')}</span></strong></div>`).join('') : '<div style="font-size:.82rem;color:var(--text-muted);padding:10px 0;">Belum ada riwayat absensi.</div>'}</div></div>${shortcuts(false)}` }
}

async function adminBody(user, range) {
  let aq = supabase.from('absensi').select('user_id,nama,tanggal,status_masuk,status_absensi,status_kehadiran,waktu_masuk,waktu_pulang,menit_pulang_cepat,client_id,department_id,departemen').gte('tanggal', range.dateFrom).lte('tanggal', range.dateTo)
  aq = applyTenantFilter(aq, { user, legacyDepartmentColumn: 'departemen' })
  const { data: absensi, error: ae } = await aq
  if (ae) throw ae
  let jq = supabase.from('jadwal').select('user_id,tanggal,shift_code,status_override,client_id,department_id,departemen').gte('tanggal', range.dateFrom).lte('tanggal', range.dateTo)
  jq = applyTenantFilter(jq, { user, legacyDepartmentColumn: 'departemen' })
  const { data: jadwal, error: je } = await jq
  if (je) throw je
  const complete = (absensi || []).filter(a => a.status_absensi === 'COMPLETE')
  const hadir = complete.filter(a => a.waktu_masuk).length
  const telat = complete.filter(a => a.status_masuk === 'Terlambat' || a.status_kehadiran === 'TERLAMBAT').length
  const pulangCepat = complete.filter(a => a.status_kehadiran === 'PULANG_CEPAT' || Number(a.menit_pulang_cepat || 0) > 0).length
  const pending = (absensi || []).filter(a => a.status_absensi === 'OPEN').length
  const lupa = (absensi || []).filter(a => String(a.status_kehadiran || '').includes('LUPA')).length
  const byOverride = name => (jadwal || []).filter(j => String(j.status_override || '').toLowerCase() === name).length
  const cuti = byOverride('cuti'), izin = byOverride('izin'), sakit = byOverride('sakit')
  const off = (jadwal || []).filter(j => String(j.status_override || '').toLowerCase() === 'off' || j.shift_code === '8').length
  const keys = new Set((absensi || []).map(a => `${a.user_id || a.nama}|${a.tanggal}`))
  const alpha = (jadwal || []).filter(j => j.user_id && j.tanggal <= getTodayLokal() && !['cuti','izin','sakit','off'].includes(String(j.status_override || '').toLowerCase()) && j.shift_code !== '8' && !keys.has(`${j.user_id}|${j.tanggal}`)).length
  const rank = {}
  complete.forEach(a => { const k = a.nama || a.user_id; if (!k) return; rank[k] ||= { nama: a.nama || 'Tanpa Nama', hadir: 0, tepat: 0, telat: 0, masalah: 0 }; rank[k].hadir++; const late = a.status_masuk === 'Terlambat' || a.status_kehadiran === 'TERLAMBAT'; if (late) rank[k].telat++; else rank[k].tepat++; if (late || String(a.status_kehadiran || '').includes('LUPA') || !a.waktu_pulang) rank[k].masalah++ })
  const list = (rows, key, suffix) => rows.length ? rows.slice(0,5).map((r,i) => `<div class="gp-mini-row"><span>#${i+1} ${esc(r.nama)}</span><strong>${r[key]} ${suffix}</strong></div>`).join('') : '<div style="font-size:.82rem;color:var(--text-muted);padding:10px 0;">Belum ada data pada periode ini.</div>'
  const ranks = Object.values(rank)
  return { html: `<div class="gp-stat-grid">${stat('Hadir', hadir, 'Sesuai filter tanggal', 'fa-user-check', 'gp-stat-green')}${stat('Terlambat', telat, 'Masuk terlambat', 'fa-clock', 'gp-stat-yellow')}${stat('Tidak Hadir / Alpha', alpha, 'Berdasarkan jadwal', 'fa-user-xmark', 'gp-stat-red')}${stat('Pending Approval', pending, 'Absensi status OPEN', 'fa-file-signature')}</div><div class="gp-chart-grid"><div class="gp-panel"><div class="gp-panel-title"><strong>Grafik Global Kehadiran</strong><span>${toTanggalLokal(range.dateFrom)} - ${toTanggalLokal(range.dateTo)}</span></div><div style="position:relative;width:100%;height:260px;"><canvas id="adminGlobalChart"></canvas></div><div id="adminGlobalStats" data-hadir="${hadir}" data-terlambat="${telat}" data-pulang-cepat="${pulangCepat}" data-cuti="${cuti}" data-izin="${izin}" data-sakit="${sakit}" data-off="${off}" data-alpha="${alpha}" data-pending="${pending}"></div></div><div class="gp-panel"><div class="gp-panel-title"><strong>Ringkasan Status</strong><span>Periode terpilih</span></div><div class="gp-mini-row"><span>Cuti</span><strong>${cuti}</strong></div><div class="gp-mini-row"><span>Izin</span><strong>${izin}</strong></div><div class="gp-mini-row"><span>Sakit</span><strong>${sakit}</strong></div><div class="gp-mini-row"><span>Off</span><strong>${off}</strong></div><div class="gp-mini-row"><span>Lupa Absen</span><strong>${lupa}</strong></div></div></div><div class="gp-panel"><div class="gp-panel-title"><strong>Ranking Kehadiran</strong><span>Berdasarkan filter tanggal</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;"><div><strong style="font-size:.78rem;">Paling Rajin Tepat Waktu</strong>${list([...ranks].sort((a,b)=>b.tepat-a.tepat),'tepat','tepat waktu')}</div><div><strong style="font-size:.78rem;">Paling Sering Terlambat</strong>${list([...ranks].sort((a,b)=>b.telat-a.telat),'telat','telat')}</div><div><strong style="font-size:.78rem;">Kehadiran Paling Baik</strong>${list([...ranks].sort((a,b)=>b.hadir-a.hadir),'hadir','hadir')}</div><div><strong style="font-size:.78rem;">Perlu Perhatian</strong>${list([...ranks].sort((a,b)=>b.masalah-a.masalah),'masalah','masalah')}</div></div></div>${shortcuts(true)}` }
}

function shortcuts(isAdmin) {
  const items = isAdmin ? [['approval-absensi','fa-clipboard-check','Approval Absensi','Cek pending'],['perbaikan-absen','fa-pencil-alt','Perbaikan Absen','Request staff'],['users','fa-users','Data Karyawan','Kelola karyawan'],['jadwal','fa-calendar-week','Jadwal','Kelola shift'],['laporan-keseluruhan','fa-file-lines','Laporan','Download laporan']] : [['absensi','fa-right-to-bracket','Absen Masuk','Mulai kerja'],['absensi','fa-right-from-bracket','Absen Pulang','Selesai kerja'],['pengajuan','fa-file-alt','Pengajuan','Cuti / sakit / izin'],['perbaikan-absen','fa-pencil-alt','Perbaikan','Koreksi absen']]
  return `<div class="gp-panel"><div class="gp-panel-title"><strong>Shortcut</strong><span>Akses cepat menu utama</span></div><div class="gp-shortcut-row">${items.map(i => `<button class="gp-shortcut" onclick="window.navigate('${i[0]}')"><i class="fa ${i[1]}"></i><span><strong>${i[2]}</strong><span>${i[3]}</span></span></button>`).join('')}</div></div>`
}

function chartsSection(range) {
  return `<div class="gp-panel"><div class="gp-panel-title"><strong>Total Jam Kerja</strong><span>${toTanggalLokal(range.dateFrom)} - ${toTanggalLokal(range.dateTo)}</span></div><div style="position:relative;width:170px;height:170px;margin:0 auto;"><canvas id="jamKerjaChart"></canvas><div id="jamKerjaChart-text" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;"></div></div></div><div class="gp-panel"><div class="gp-panel-title"><strong>Aktivitas Saya (Jam Datang & Pulang)</strong><span>${toTanggalLokal(range.dateFrom)} - ${toTanggalLokal(range.dateTo)}</span></div><div style="overflow-x:auto;-webkit-overflow-scrolling:touch;"><div style="position:relative;width:100%;min-width:600px;height:300px;"><canvas id="aktivitasChart"></canvas></div></div></div><div class="gp-panel"><div class="gp-panel-title"><strong>Distribusi Absensi</strong><span>Semua chart mengikuti filter tanggal</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;"><div style="position:relative;width:100%;height:220px;"><canvas id="absensiChartKehadiran"></canvas></div><div style="position:relative;width:100%;height:220px;"><canvas id="absensiChartMasuk"></canvas></div><div style="position:relative;width:100%;height:220px;"><canvas id="absensiChartPulang"></canvas></div></div></div>`
}

async function renderSuperAdminDashboard(content) {
  try {
    const { data: clients, error: ce } = await supabase.from('clients').select('id,nama_client,kode_client,domain_login,status').order('nama_client')
    if (ce) throw ce
    const { data: profiles, error: pe } = await supabase.from('profiles').select('id,client_id,status_akun')
    if (pe) throw pe
    const { data: departments, error: de } = await supabase.from('departments').select('id,client_id,status')
    if (de) throw de
    const rows = (clients || []).map(c => { const emp = (profiles || []).filter(p => String(p.client_id || '') === String(c.id)); const active = emp.filter(p => ['aktif','active'].includes(String(p.status_akun || 'Aktif').toLowerCase())).length; return { ...c, active, inactive: emp.length - active, deptTotal: (departments || []).filter(d => String(d.client_id || '') === String(c.id)).length } })
    const totalActive = rows.reduce((s,r) => s + r.active, 0)
    const totalInactive = rows.reduce((s,r) => s + r.inactive, 0)
    const tableRows = rows.map(r => `<tr><td style="padding:10px;border-bottom:1px solid var(--border);font-weight:800;">${esc(r.nama_client || '-')}</td><td style="padding:10px;border-bottom:1px solid var(--border);">${esc(r.domain_login || r.kode_client || '-')}</td><td style="padding:10px;border-bottom:1px solid var(--border);text-align:right;">${r.active}</td><td style="padding:10px;border-bottom:1px solid var(--border);text-align:right;">${r.inactive}</td><td style="padding:10px;border-bottom:1px solid var(--border);text-align:right;">${r.deptTotal}</td><td style="padding:10px;border-bottom:1px solid var(--border);"><span class="gp-badge ${r.status === 'active' ? 'gp-badge-green' : 'gp-badge-red'}">${esc(r.status || '-')}</span></td></tr>`).join('')
    content.innerHTML = `<div class="gp-dashboard-shell"><div class="gp-dashboard-hero"><div><div style="font-size:.72rem;font-weight:900;text-transform:uppercase;color:rgba(255,255,255,.72);margin-bottom:8px;">Owner / Developer</div><h2>Dashboard Super Admin</h2><p>Ringkasan Office dan Department GenPro.</p></div></div><div class="gp-stat-grid">${stat('Total Office', rows.length, 'Tenant terdaftar', 'fa-building')}${stat('Karyawan Aktif', totalActive, 'Akun aktif', 'fa-user-check', 'gp-stat-green')}${stat('Karyawan Nonaktif', totalInactive, 'Akun nonaktif', 'fa-user-xmark', 'gp-stat-red')}${stat('Department', rows.reduce((s,r)=>s+r.deptTotal,0), 'Total department', 'fa-sitemap')}</div><div class="gp-panel gp-table-card"><div class="gp-panel-title"><strong>List Office</strong><span>Data tenant aktif</span></div>${rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:.85rem;min-width:680px;"><thead><tr style="text-align:left;color:var(--text-muted);"><th style="padding:10px;">Office</th><th style="padding:10px;">Kode Domain</th><th style="padding:10px;text-align:right;">Aktif</th><th style="padding:10px;text-align:right;">Nonaktif</th><th style="padding:10px;text-align:right;">Department</th><th style="padding:10px;">Status</th></tr></thead><tbody>${tableRows}</tbody></table>` : `<div style="padding:20px;text-align:center;color:var(--text-muted);">Belum ada Office.</div>`}</div></div>`
  } catch (err) {
    console.error('Gagal render dashboard super_admin:', err)
    content.innerHTML = `<div class="card" style="padding:18px;border-color:#fecaca;background:#fef2f2;color:#991b1b;"><strong>Dashboard super admin gagal dimuat.</strong></div>`
    window.showToast?.('Dashboard super admin gagal dimuat.', 'error')
  }
}

async function loadCharts(userId, dateFrom, dateTo, totalJamKerja) {
  setTimeout(() => {
    createTotalJamKerjaChart('jamKerjaChart', totalJamKerja)
    createAktivitasChart('aktivitasChart', userId, dateFrom, dateTo).catch(err => console.warn('Gagal render chart aktivitas:', err))
    createAbsensiChart('absensiChartKehadiran', 'absensiChartMasuk', 'absensiChartPulang', userId, dateFrom, dateTo).catch(err => console.warn('Gagal render chart absensi:', err))
    if (typeof Chart !== 'undefined' && canApproveAttendance(window.currentUser) && document.getElementById('adminGlobalChart')) {
      const ctx = document.getElementById('adminGlobalChart')
      const el = document.getElementById('adminGlobalStats')
      const vals = ['hadir','terlambat','pulangCepat','cuti','izin','sakit','off','alpha','pending'].map(k => Number(el?.dataset?.[k] || 0))
      window.appCharts = window.appCharts || {}
      window.appCharts.adminGlobalChart?.destroy()
      Chart.getChart(ctx)?.destroy()
      window.appCharts.adminGlobalChart = new Chart(ctx, { type: 'bar', data: { labels: ['Hadir','Terlambat','Pulang Cepat','Cuti','Izin','Sakit','Off','Alpha','Pending'], datasets: [{ data: vals, backgroundColor: ['#10b981','#f59e0b','#0ea5e9','#22c55e','#3b82f6','#f97316','#64748b','#ef4444','#8b5cf6'], borderRadius: 10 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } })
    }
  }, 100)
}
