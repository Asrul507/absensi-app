import { supabase } from './supabase.js'
import { getTodayLokal, getDurasiMenit, toJamLokal, toTanggalLokal, toTanggalAbsensiLokal } from './timezone.js'
import { createTotalJamKerjaChart, createAktivitasChart, createAbsensiChart } from './chart-helpers.js'
import { canApproveAttendance, RADIUS_STATUS } from './attendance-approval.js'
import { getServerTimeIso, startServerDigitalClock } from './server-time.js'
import { getSisaCuti } from './services/leave-service.js'
import { applyTenantFilter, isSuperAdmin, isStaff } from './access-control.js'

async function fetchAbsensiRowsForUser({ userId, nama, dateFrom = null, dateTo = null, tanggal = null, select = '*' } = {}) {
  async function applyFilters(query) {
    if (tanggal) return query.eq('tanggal', tanggal)
    let q = query
    if (dateFrom) q = q.gte('tanggal', dateFrom)
    if (dateTo) q = q.lte('tanggal', dateTo)
    return q
  }

  if (userId) {
    let byUser = applyTenantFilter(supabase.from('absensi').select(select).eq('user_id', userId), { userColumn: 'user_id' })
    byUser = await applyFilters(byUser)
    const { data, error } = await byUser
    if (error) throw error
    if (Array.isArray(data) ? data.length : data) return data
  }

  if (!nama) return tanggal ? null : []
  let byName = applyTenantFilter(supabase.from('absensi').select(select).eq('nama', nama), { userColumn: 'user_id' })
  byName = await applyFilters(byName)
  const { data, error } = await byName
  if (error) throw error
  return data || (tanggal ? null : [])
}

async function fetchAbsensiSingleForUser(options) {
  const rows = await fetchAbsensiRowsForUser(options)
  return Array.isArray(rows) ? (rows[0] || null) : rows
}

export async function renderDashboard() {
  const content = document.getElementById('content')
  const user = window.currentUser

  if (!user) {
    content.innerHTML = `<div class="card"><p>Silakan login dulu</p></div>`
    return
  }

  try {
    if (isSuperAdmin(user)) {
      await renderSuperAdminDashboard(content)
      return
    }

  // Attendance approval workflow: jangan mengunci lupa absen pulang menjadi final.
  // Dashboard hanya memastikan record lama tetap berada di status OPEN/MENUNGGU_VERIFIKASI
  // agar admin/SPV yang memutuskan final status melalui menu Approval Absensi.
  try {
    const todayStr = getTodayLokal()
    const todayDate = new Date(todayStr + 'T00:00:00Z')
    todayDate.setUTCDate(todayDate.getUTCDate() - 1)
    const tanggalKemarinStr = todayDate.toISOString().split('T')[0]

    const absenKemarin = await fetchAbsensiSingleForUser({
      userId: user.id,
      nama: user.nama_lengkap || user.email,
      tanggal: tanggalKemarinStr,
      select: '*'
    })

    if (absenKemarin?.waktu_masuk && !absenKemarin?.waktu_pulang) {
      await supabase
        .from('absensi')
        .update({ status_absensi: 'OPEN', status_kehadiran: 'MENUNGGU_VERIFIKASI' })
        .eq('id', absenKemarin.id)
    }
  } catch (e) {
    console.error('Gagal sinkronisasi status OPEN absensi:', e)
  }

  const dashboardServerIso = await getServerTimeIso()

  // Get profile terbaru
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const fullName = profile?.nama_lengkap || user.email
  let saldoCutiTahunan = { sisa: profile?.sisa_cuti || 0, status: '-', periode_mulai: null, periode_selesai: null }
  try {
    saldoCutiTahunan = await getSisaCuti(user.id, profile?.tanggal_bergabung || user.tanggal_bergabung)
  } catch (err) {
    console.error('Gagal memuat saldo cuti tahunan:', err)
  }
  const sisaCuti = saldoCutiTahunan.sisa || 0

  if (profile?.foto_url && profile.foto_url !== window.currentUser.foto_url) {
    window.currentUser.foto_url = profile.foto_url
  }

  // Date range (current month)
  // Gunakan tanggal lokal (dari titik radius) sebagai basis bulan
  const todayLocal = getTodayLokal()
  const [tyear, tmonth] = todayLocal.split('-').map(Number)
  const firstDay = new Date(Date.UTC(tyear, tmonth - 1, 1))
  const lastDay  = new Date(Date.UTC(tyear, tmonth, 0))
  const dateFrom = firstDay.toISOString().split('T')[0]
  const dateTo   = lastDay.toISOString().split('T')[0]

  const isAdmin = canApproveAttendance(user) && !isStaff(user)

  // Get total jam kerja (personal user login)
  const absensiMonthAll = await fetchAbsensiRowsForUser({
    userId: user.id,
    nama: fullName,
    dateFrom,
    dateTo,
    select: 'tanggal, waktu_masuk, waktu_pulang, status_masuk, status_absensi, status_kehadiran'
  })
  const absensiMonth = (absensiMonthAll || []).filter(a => a.status_absensi === 'COMPLETE')

  let totalJamKerja = 0
  absensiMonth?.forEach(a => {
    if (a.waktu_masuk && a.waktu_pulang) {
      const durasiMenit = getDurasiMenit(a.waktu_masuk, a.waktu_pulang)
      if (durasiMenit !== null) totalJamKerja += durasiMenit / 60
    }
  })

  // Batasi menu utama hanya 4 tombol
  const menuItems = [
    { nav: 'absensi',       icon: 'fa-sign-in-alt',  label: 'Masuk',            color: '#f59e0b', color2: '#fbbf24' },
    { nav: 'absensi',       icon: 'fa-sign-out-alt', label: 'Pulang',           color: '#3b82f6', color2: '#60a5fa' },
    { nav: 'pengajuan',     icon: 'fa-file-alt',     label: 'Pengajuan',        color: '#8b5cf6', color2: '#a78bfa' },
    { nav: 'perbaikan-absen',icon: 'fa-pencil-alt',    label: 'Perbaikan Absen',  color: '#ef4444', color2: '#f87171' }
  ]

  const menuHtml = menuItems.map(m => `
    <button
      onclick="window.navigate('${m.nav}')"
      class="fav-btn"
      style="
        background: linear-gradient(135deg, ${m.color2} 0%, ${m.color} 100%);
        border: none;
        border-radius: 14px;
        cursor: pointer;
        text-align: center;
        color: white;
        font-weight: 700;
        padding: 14px 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 85px;
        width: 85px;
        flex-shrink: 0;
        transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      ">
      <i class="fa ${m.icon}" style="font-size:1.5rem;"></i>
      <span style="font-size:.7rem; line-height:1.2; white-space: nowrap;">${m.label}</span>
    </button>
  `).join('')

  // ===== WIDGET STATISTIK KEHADIRAN REAL-TIME KHUSUS ADMIN =====
  let adminWidgetHtml = ''
  
  if (isAdmin) {
    try {
      const hariIniStr = getTodayLokal()
      
      const { data: absenHariIni } = await applyTenantFilter(supabase.from('absensi').select('*').eq('tanggal', hariIniStr), { user })
      const { data: jadwalHariIni } = await applyTenantFilter(supabase.from('jadwal').select('*').eq('tanggal', hariIniStr), { user })
      
      let tepatWaktu = 0, terlambat = 0, sedangKerja = 0, liburAtauCuti = 0, openApproval = 0, outRadius = 0, lupaAbsen = 0
      
      absenHariIni?.forEach(a => {
        if (a.status_absensi === 'OPEN') openApproval++
        if (a.radius_status === RADIUS_STATUS.OUT_RADIUS) outRadius++
        if (a.approval_flag === 'LATE_CHECKIN_MISSING' || (a.waktu_masuk && !a.waktu_pulang)) lupaAbsen++
        if (a.waktu_masuk && a.waktu_pulang && a.status_absensi === 'COMPLETE') {
          if (a.status_masuk === 'Terlambat') terlambat++
          else tepatWaktu++
        } else if (a.waktu_masuk && !a.waktu_pulang) {
          sedangKerja++
        }
      })
      
      jadwalHariIni?.forEach(j => {
        if (['OFF', 'cuti', 'sakit', 'izin'].includes(j.status_override) || j.shift_code === '8') {
          liburAtauCuti++
        }
      })
      
      adminWidgetHtml = `
        <div class="card fade-up" style="padding: 16px; margin-bottom: 20px;">
          <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">
            <i class="fa fa-chart-line" style="color: var(--primary);"></i> Live Monitoring Kehadiran Hari Ini
          </div>
          ${openApproval > 0 ? `<button onclick="window.navigate('approval-absensi')" style="width:100%;margin-bottom:10px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:10px;padding:9px;font-weight:900;cursor:pointer;"><i class="fa fa-bell"></i> Absensi Menunggu Approval (${openApproval})</button>` : ''}
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center;">
            <div style="background: #dcfce7; padding: 10px 4px; border-radius: 10px;">
              <div style="font-size: 1.2rem; font-weight: 900; color: #166534;">${tepatWaktu}</div>
              <div style="font-size: .6rem; color: #166534; font-weight: 700;">Tepat Waktu</div>
            </div>
            <div style="background: #fffbeb; padding: 10px 4px; border-radius: 10px;">
              <div style="font-size: 1.2rem; font-weight: 900; color: #b45309;">${sedangKerja}</div>
              <div style="font-size: .6rem; color: #b45309; font-weight: 700;">On Duty</div>
            </div>
            <div style="background: #fee2e2; padding: 10px 4px; border-radius: 10px;">
              <div style="font-size: 1.2rem; font-weight: 900; color: #991b1b;">${terlambat}</div>
              <div style="font-size: .6rem; color: #991b1b; font-weight: 700;">Terlambat</div>
            </div>
            <div style="background: #f1f5f9; padding: 10px 4px; border-radius: 10px;">
              <div style="font-size: 1.2rem; font-weight: 900; color: #475569;">${liburAtauCuti}</div>
              <div style="font-size: .6rem; color: #475569; font-weight: 700;">Off / Cuti</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center;margin-top:8px;">
            <div style="background:#fffbeb;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#b45309;">${openApproval}</div><div style="font-size:.6rem;color:#b45309;font-weight:700;">Menunggu Approval</div></div>
            <div style="background:#fee2e2;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#991b1b;">${outRadius}</div><div style="font-size:.6rem;color:#991b1b;font-weight:700;">Out Radius</div></div>
            <div style="background:#fef3c7;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#92400e;">${lupaAbsen}</div><div style="font-size:.6rem;color:#92400e;font-weight:700;">Lupa Absen</div></div>
            <div style="background:#dbeafe;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#1d4ed8;">${sedangKerja}</div><div style="font-size:.6rem;color:#1d4ed8;font-weight:700;">Shift Aktif</div></div>
          </div>
        </div>
      `
    } catch (err) {
      console.error("Gagal memuat widget live monitoring hrd:", err)
    }
  }

  // ===== DASHBOARD PERSONAL STAFF =====
  const absensiHariIni = await fetchAbsensiSingleForUser({
    userId: user.id,
    nama: fullName,
    tanggal: todayLocal,
    select: 'waktu_masuk, waktu_pulang, status_absensi, status_kehadiran'
  })

  const { data: shiftHariIni } = await supabase
    .from('jadwal')
    .select('shift_code, status_override')
    .eq('user_id', user.id)
    .eq('tanggal', todayLocal)
    .maybeSingle()

  const totalHadirBulanIni = absensiMonth?.filter(a => a.waktu_masuk && a.status_absensi === 'COMPLETE').length || 0
  const totalTerlambatBulanIni = absensiMonth?.filter(a => a.status_masuk === 'Terlambat').length || 0
  const totalLupaPulangBulanIni = absensiMonth?.filter(a => a.status_kehadiran === 'LUPA_ABSEN_PULANG').length || 0

  const riwayatTerbaru = (absensiMonthAll || [])
    .slice()
    .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))
    .slice(0, 5)

  const personalHtml = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Dashboard Personal</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
        <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Hadir Bulan Ini</div><div style="font-size:1.2rem;font-weight:800">${totalHadirBulanIni}</div></div>
        <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Terlambat Bulan Ini</div><div style="font-size:1.2rem;font-weight:800">${totalTerlambatBulanIni}</div></div>
        <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Lupa Absen Pulang</div><div style="font-size:1.2rem;font-weight:800">${totalLupaPulangBulanIni}</div></div>
        <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Jam Kerja Bulan Ini</div><div style="font-size:1.2rem;font-weight:800">${totalJamKerja.toFixed(1)} jam</div></div>
        <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Shift Hari Ini</div><div style="font-size:1rem;font-weight:800">${shiftHariIni?.status_override || shiftHariIni?.shift_code || '-'}</div></div>
        <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Status Absensi Hari Ini</div><div style="font-size:1rem;font-weight:800">${absensiHariIni?.status_absensi || 'Belum Absen'}</div></div>
      </div>
    </div>

    <div class="card fade-up" style="padding: 16px; margin-bottom: 20px;">
      <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px;">Riwayat Absensi Terbaru</div>
      ${(riwayatTerbaru || []).map(r => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem;"><span>${toTanggalAbsensiLokal(r?.tanggal, r?.waktu_masuk || r?.waktu_pulang)}</span><span>${r.waktu_masuk ? toJamLokal(r.waktu_masuk) : '-'} → ${r.waktu_pulang ? toJamLokal(r.waktu_pulang) : '-'}</span><strong>${r.status_absensi || '-'}</strong></div>`).join('') || '<div style="font-size:.82rem;color:var(--text-muted)">Belum ada riwayat absensi.</div>'}
    </div>
  `

  // ===== HR ANALYTICS GLOBAL (ADMIN / SUPER ADMIN) =====
  let adminGlobalHtml = ''
  if (isAdmin) {
    let globalAbsensiQuery = supabase
      .from('absensi')
      .select('user_id, nama, tanggal, status_masuk, status_absensi, status_kehadiran, waktu_masuk, waktu_pulang, menit_pulang_cepat, client_id, department_id, departemen')
      .gte('tanggal', dateFrom)
      .lte('tanggal', dateTo)
    globalAbsensiQuery = applyTenantFilter(globalAbsensiQuery, { user, legacyDepartmentColumn: 'departemen' })
    const { data: globalAbsensi } = await globalAbsensiQuery

    let globalJadwalQuery = supabase
      .from('jadwal')
      .select('user_id, tanggal, shift_code, status_override, client_id, department_id, departemen')
      .gte('tanggal', dateFrom)
      .lte('tanggal', dateTo)
    globalJadwalQuery = applyTenantFilter(globalJadwalQuery, { user, legacyDepartmentColumn: 'departemen' })
    const { data: globalJadwal } = await globalJadwalQuery

    const todayValue = todayLocal
    const completedAbsensi = (globalAbsensi || []).filter(a => a.status_absensi === 'COMPLETE')
    const hadirGlobal = completedAbsensi.filter(a => a.waktu_masuk).length
    const terlambatGlobal = completedAbsensi.filter(a => a.status_masuk === 'Terlambat' || a.status_kehadiran === 'TERLAMBAT').length
    const pulangCepatGlobal = completedAbsensi.filter(a => a.status_kehadiran === 'PULANG_CEPAT' || Number(a.menit_pulang_cepat || 0) > 0).length
    const lupaPulangGlobal = (globalAbsensi || []).filter(a => a.status_kehadiran === 'LUPA_ABSEN_PULANG').length
    const openApprovalGlobal = (globalAbsensi || []).filter(a => a.status_absensi === 'OPEN').length
    const cutiGlobal = (globalJadwal || []).filter(j => j.status_override === 'cuti').length
    const izinGlobal = (globalJadwal || []).filter(j => j.status_override === 'izin').length
    const sakitGlobal = (globalJadwal || []).filter(j => j.status_override === 'sakit').length
    const offGlobal = (globalJadwal || []).filter(j => j.status_override === 'off' || j.shift_code === '8').length
    const attendanceKeys = new Set((globalAbsensi || []).map(a => `${a.user_id || a.nama}|${a.tanggal}`))
    const alphaGlobal = (globalJadwal || []).filter(j => {
      if (!j.user_id || !j.tanggal || j.tanggal > todayValue) return false
      if (['cuti', 'izin', 'sakit', 'off'].includes(j.status_override) || j.shift_code === '8') return false
      return !attendanceKeys.has(`${j.user_id}|${j.tanggal}`)
    }).length

    const rankMap = {}
    completedAbsensi.forEach(a => {
      const key = a.nama || a.user_id
      if (!key) return
      if (!rankMap[key]) rankMap[key] = { nama: a.nama || 'Tanpa Nama', hadir: 0, tepat: 0, terlambat: 0, masalah: 0 }
      if (a.waktu_masuk) rankMap[key].hadir += 1
      const isLate = a.status_masuk === 'Terlambat' || a.status_kehadiran === 'TERLAMBAT'
      if (isLate) rankMap[key].terlambat += 1
      else if (a.waktu_masuk) rankMap[key].tepat += 1
      if (isLate || ['LUPA_ABSEN_MASUK', 'LUPA_ABSEN_PULANG'].includes(a.status_kehadiran) || !a.waktu_masuk || !a.waktu_pulang) rankMap[key].masalah += 1
    })
    const rankRows = Object.values(rankMap)
    const renderRankList = (rows, metric, suffix) => rows.length
      ? rows.slice(0, 5).map((v, i) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem;"><span>#${i + 1} ${v.nama}</span><strong>${v[metric]} ${suffix}</strong></div>`).join('')
      : '<div style="font-size:.82rem;color:var(--text-muted);padding:10px 0;">Belum ada data bulan ini.</div>'
    const rajinHtml = renderRankList([...rankRows].sort((a, b) => b.tepat - a.tepat), 'tepat', 'tepat waktu')
    const terlambatRankHtml = renderRankList([...rankRows].sort((a, b) => b.terlambat - a.terlambat), 'terlambat', 'telat')
    const baikHtml = renderRankList([...rankRows].sort((a, b) => (b.hadir - b.terlambat) - (a.hadir - a.terlambat)), 'hadir', 'hadir')
    const burukHtml = renderRankList([...rankRows].sort((a, b) => b.masalah - a.masalah), 'masalah', 'masalah')

    adminGlobalHtml = `
      <div style="margin-bottom: 20px;">
        <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">HR Analytics Global</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Hadir</div><div style="font-size:1.2rem;font-weight:800">${hadirGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Terlambat</div><div style="font-size:1.2rem;font-weight:800">${terlambatGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Pulang Cepat</div><div style="font-size:1.2rem;font-weight:800">${pulangCepatGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Cuti</div><div style="font-size:1.2rem;font-weight:800">${cutiGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Izin</div><div style="font-size:1.2rem;font-weight:800">${izinGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Sakit</div><div style="font-size:1.2rem;font-weight:800">${sakitGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Off</div><div style="font-size:1.2rem;font-weight:800">${offGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Alpha</div><div style="font-size:1.2rem;font-weight:800">${alphaGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Pending Approval</div><div style="font-size:1.2rem;font-weight:800">${openApprovalGlobal}</div></div>
        </div>
      </div>
      <div class="card fade-up" style="padding:16px;margin-bottom:20px;" id="adminGlobalStats" data-hadir="${hadirGlobal}" data-terlambat="${terlambatGlobal}" data-pulang-cepat="${pulangCepatGlobal}" data-cuti="${cutiGlobal}" data-izin="${izinGlobal}" data-sakit="${sakitGlobal}" data-off="${offGlobal}" data-alpha="${alphaGlobal}" data-pending="${openApprovalGlobal}">
        <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;">Ranking Kehadiran Bulan Ini</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
          <div><strong style="font-size:.78rem;">Paling Rajin Tepat Waktu</strong>${rajinHtml}</div>
          <div><strong style="font-size:.78rem;">Paling Sering Terlambat</strong>${terlambatRankHtml}</div>
          <div><strong style="font-size:.78rem;">Kehadiran Paling Baik</strong>${baikHtml}</div>
          <div><strong style="font-size:.78rem;">Kehadiran Paling Buruk</strong>${burukHtml}</div>
        </div>
      </div>
      <div class="card fade-up" style="padding:16px;margin-bottom:20px;">
        <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;">Grafik Global Kehadiran</div>
        <div style="position:relative;width:100%;height:220px;"><canvas id="adminGlobalChart"></canvas></div>
      </div>
    `
  }
  content.innerHTML = `
    <div class="page-header" style="margin-bottom: 20px;">
      <h2 style="margin: 0;"><i class="fa fa-tachometer-alt"></i> Dashboard</h2>
    </div>

    <div class="card fade-up" style="padding: 16px; margin-bottom: 16px; text-align:center;">
      <div style="font-size:.7rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;margin-bottom:4px;">Waktu Server</div>
      <div id="dashboardLiveClock" style="font-family:monospace;font-size:1.8rem;font-weight:900;color:var(--primary);">--:--:--</div>
      <div id="dashboardLiveDate" style="font-size:.8rem;color:var(--text-muted);margin-top:2px;">Memuat waktu server...</div>
    </div>

    <div class="card fade-up" style="padding: 18px; margin-bottom: 20px; background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; border: none;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-weight: 800; font-size: 1.1rem;">${fullName}</div>
          <div style="font-size: .8rem; color: rgba(255,255,255,0.8); margin-top: 6px;">Saldo Cuti: <strong>${sisaCuti} hari</strong> · ${saldoCutiTahunan.status || '-'} (${saldoCutiTahunan.periode_mulai || '-'} s/d ${saldoCutiTahunan.periode_selesai || '-'})</div>
        </div>
        <div style="text-align: right; font-size: 2.2rem; opacity: 0.2;"><i class="fa fa-id-badge"></i></div>
      </div>
    </div>

    ${adminWidgetHtml}
    ${isAdmin ? adminGlobalHtml : personalHtml}

    <div style="margin-bottom: 25px; display: flex; justify-content: center; width: 100%;">
      <div style="
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 6px;
        scrollbar-width: thin;
        scrollbar-color: rgba(0,0,0,0.15) transparent;
        max-width: 100%;
      ">
        <div style="
          display: flex;
          flex-direction: row;
          justify-content: center;
          gap: 12px;
          width: max-content;
          padding: 4px 6px;
          margin: 0 auto;
        ">
          ${menuHtml}
        </div>
      </div>
    </div>

    <div class="card fade-up" style="padding: 18px; margin-bottom: 20px; text-align: center;">
      <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 14px;">Total Jam Kerja</div>
      <div style="position: relative; width: 160px; height: 160px; margin: 0 auto;">
        <canvas id="jamKerjaChart"></canvas>
        <div id="jamKerjaChart-text" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"></div>
      </div>
    </div>

    <div class="card fade-up" style="padding: 18px; margin-bottom: 20px;">
      <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Aktivitas Saya (Jam Datang & Pulang)</div>
      <div style="font-size: .75rem; color: var(--text-muted); margin-bottom: 12px;">
        ${toTanggalLokal(firstDay.toISOString())} - ${toTanggalLokal(lastDay.toISOString())}
      </div>
      <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
        <div style="position: relative; width: 100%; min-width: 600px; height: 300px;">
          <canvas id="aktivitasChart"></canvas>
        </div>
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Distribusi Absensi</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        <div class="card fade-up" style="padding: 14px;">
          <div style="font-size: .75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; text-align: center;">Kehadiran</div>
          <div style="position: relative; width: 100%; height: 200px;">
            <canvas id="absensiChartKehadiran"></canvas>
          </div>
        </div>
        <div class="card fade-up" style="padding: 14px;">
          <div style="font-size: .75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; text-align: center;">Absen Masuk</div>
          <div style="position: relative; width: 100%; height: 200px;">
            <canvas id="absensiChartMasuk"></canvas>
          </div>
        </div>
        <div class="card fade-up" style="padding: 14px;">
          <div style="font-size: .75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; text-align: center;">Absen Pulang</div>
          <div style="position: relative; width: 100%; height: 200px;">
            <canvas id="absensiChartPulang"></canvas>
          </div>
        </div>
      </div>
    </div>

    <div class="card fade-up" style="padding: 18px; margin-bottom: 20px;">
      <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 14px;">
        <i class="fa fa-calendar-alt" style="color: var(--primary);"></i> Kalender HRD
      </div>
      <div style="padding: 10px 0; text-align: center; border: 1.5px dashed var(--border); border-radius: var(--r-md); background: var(--gray-50);">
        <p style="font-size: .85rem; color: var(--text-muted); margin-bottom: 8px;">Lihat jadwal kerja dan agenda perusahaan bulan ini</p>
        <button class="btn-primary btn-sm" onclick="window.navigate('kalender')" style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
          <i class="fa fa-eye"></i> Buka Kalender HRD
        </button>
      </div>
    </div>

    <style>
      .fav-btn:hover { transform: translateY(-3px); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18) !important; }
      .fav-btn:active { transform: translateY(-1px); }
    </style>
  `

  startServerDigitalClock({ key: 'dashboard', timeElementId: 'dashboardLiveClock', dateElementId: 'dashboardLiveDate', serverIso: dashboardServerIso || new Date().toISOString() })

  if (typeof Chart === 'undefined') {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
    script.onload = () => { loadCharts(user.id, dateFrom, dateTo, totalJamKerja) }
    document.head.appendChild(script)
  } else {
    loadCharts(user.id, dateFrom, dateTo, totalJamKerja)
  }
  } catch (err) {
    console.error('Gagal render dashboard:', err)
    content.innerHTML = `<div class="card" style="padding:18px;border-color:#fecaca;background:#fef2f2;color:#991b1b;"><strong>Dashboard gagal dimuat.</strong><p style="margin:.5rem 0 0;">Data tidak dapat ditampilkan. Coba muat ulang atau hubungi admin.</p></div>`
    window.showToast?.('Dashboard gagal dimuat.', 'error')
  }
}


async function renderSuperAdminDashboard(content) {
  try {
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id,nama_client,kode_client,domain_login,status')
      .order('nama_client')
    if (clientsError) throw clientsError

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id,client_id,status_akun')
    if (profilesError) throw profilesError

    const { data: departments, error: departmentsError } = await supabase
      .from('departments')
      .select('id,client_id,status')
    if (departmentsError) throw departmentsError

    const rows = (clients || []).map(client => {
      const employeeRows = (profiles || []).filter(p => String(p.client_id || '') === String(client.id))
      const active = employeeRows.filter(p => ['aktif', 'active'].includes(String(p.status_akun || 'Aktif').toLowerCase())).length
      const inactive = employeeRows.length - active
      const deptTotal = (departments || []).filter(d => String(d.client_id || '') === String(client.id)).length
      return { ...client, active, inactive, deptTotal }
    })
    const totalActive = rows.reduce((sum, row) => sum + row.active, 0)
    const totalInactive = rows.reduce((sum, row) => sum + row.inactive, 0)
    const tableRows = rows.map(row => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:800;">${row.nama_client || '-'}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border);">${row.domain_login || row.kode_client || '-'}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border);text-align:right;">${row.active}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border);text-align:right;">${row.inactive}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border);text-align:right;">${row.deptTotal}</td>
        <td style="padding:10px;border-bottom:1px solid var(--border);"><span style="padding:4px 8px;border-radius:999px;background:${row.status === 'active' ? '#dcfce7' : '#fee2e2'};color:${row.status === 'active' ? '#166534' : '#991b1b'};font-weight:800;font-size:.72rem;">${row.status || '-'}</span></td>
      </tr>`).join('')

    content.innerHTML = `
      <div class="page-header" style="margin-bottom:20px;"><h2 style="margin:0;"><i class="fa fa-building"></i> Dashboard Super Admin</h2><p style="margin:6px 0 0;color:var(--text-muted);">Ringkasan Office untuk owner/developer.</p></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px;">
        <div class="card" style="padding:16px;"><div style="font-size:.72rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;">Total Office</div><div style="font-size:1.8rem;font-weight:900;">${rows.length}</div></div>
        <div class="card" style="padding:16px;"><div style="font-size:.72rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;">Karyawan Aktif</div><div style="font-size:1.8rem;font-weight:900;">${totalActive}</div></div>
        <div class="card" style="padding:16px;"><div style="font-size:.72rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;">Karyawan Nonaktif</div><div style="font-size:1.8rem;font-weight:900;">${totalInactive}</div></div>
      </div>
      <div class="card" style="padding:16px;overflow:auto;">
        <div style="font-size:.75rem;font-weight:900;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">List Office</div>
        ${rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:.85rem;"><thead><tr style="text-align:left;color:var(--text-muted);"><th style="padding:10px;">Office</th><th style="padding:10px;">Kode Domain</th><th style="padding:10px;text-align:right;">Aktif</th><th style="padding:10px;text-align:right;">Nonaktif</th><th style="padding:10px;text-align:right;">Department</th><th style="padding:10px;">Status</th></tr></thead><tbody>${tableRows}</tbody></table>` : `<div style="padding:20px;text-align:center;color:var(--text-muted);">Belum ada Office.</div>`}
      </div>`
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
      const statsEl = document.getElementById('adminGlobalStats')
      const hadir = Number(statsEl?.dataset?.hadir || 0)
      const terlambat = Number(statsEl?.dataset?.terlambat || 0)
      const pulangCepat = Number(statsEl?.dataset?.pulangCepat || 0)
      const cuti = Number(statsEl?.dataset?.cuti || 0)
      const izin = Number(statsEl?.dataset?.izin || 0)
      const sakit = Number(statsEl?.dataset?.sakit || 0)
      const off = Number(statsEl?.dataset?.off || 0)
      const alpha = Number(statsEl?.dataset?.alpha || 0)
      const pending = Number(statsEl?.dataset?.pending || 0)
      window.appCharts = window.appCharts || {}
      window.appCharts.adminGlobalChart?.destroy()
      Chart.getChart(ctx)?.destroy()
      window.appCharts.adminGlobalChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Hadir', 'Terlambat', 'Pulang Cepat', 'Cuti', 'Izin', 'Sakit', 'Off', 'Alpha', 'Pending'],
          datasets: [{ data: [hadir, terlambat, pulangCepat, cuti, izin, sakit, off, alpha, pending], backgroundColor: ['#16a34a', '#d97706', '#0ea5e9', '#22c55e', '#3b82f6', '#f59e0b', '#64748b', '#dc2626', '#8b5cf6'] }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      })
    }
  }, 100)
}
