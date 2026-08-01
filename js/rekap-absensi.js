/**
 * js/rekap-absensi.js
 * ============================================================
 * Halaman Statistik Absensi — memuat grafik, statistik personal,
 * dan HR Analytics Global (sesuai role) yang dipindahkan dari dashboard.
 * ============================================================
 */

import { supabase } from './supabase.js'
import { getTodayLokal, getDurasiMenit, toJamLokal, toTanggalLokal, toTanggalAbsensiLokal } from './timezone.js'
import { createTotalJamKerjaChart, createAktivitasChart, createAbsensiChart } from './chart-helpers.js'
import { canApproveAttendance, RADIUS_STATUS } from './attendance-approval.js'
import { applyTenantFilter, isStaff } from './access-control.js'

/* ============================================================
   HELPER: Fetch data absensi user (sama seperti di dashboard.js)
   ============================================================ */
async function fetchAbsensiRows({ userId, nama, dateFrom = null, dateTo = null, tanggal = null, select = '*' } = {}) {
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

/* ============================================================
   RENDER GRAFIK (dipanggil setelah HTML sudah di-render)
   ============================================================ */
function loadRekapCharts(userId, dateFrom, dateTo, totalJamKerja, adminStats) {
  setTimeout(() => {
    createTotalJamKerjaChart('jamKerjaChart', totalJamKerja)
    createAktivitasChart('aktivitasChart', userId, dateFrom, dateTo)
      .catch(err => console.warn('Gagal render chart aktivitas:', err))
    createAbsensiChart('absensiChartKehadiran', 'absensiChartMasuk', 'absensiChartPulang', userId, dateFrom, dateTo)
      .catch(err => console.warn('Gagal render chart absensi:', err))

    if (adminStats && typeof Chart !== 'undefined' && document.getElementById('adminGlobalChart')) {
      const ctx = document.getElementById('adminGlobalChart')
      window.appCharts = window.appCharts || {}
      try { window.appCharts.adminGlobalChart?.destroy() } catch (_) { /* noop */ }
      try { Chart.getChart(ctx)?.destroy() } catch (_) { /* noop */ }
      window.appCharts.adminGlobalChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Hadir', 'Terlambat', 'Pulang Cepat', 'Cuti', 'Izin', 'Sakit', 'Off', 'Alpha', 'Pending'],
          datasets: [{
            data: [
              adminStats.hadir, adminStats.terlambat, adminStats.pulangCepat,
              adminStats.cuti, adminStats.izin, adminStats.sakit,
              adminStats.off, adminStats.alpha, adminStats.pending
            ],
            backgroundColor: [
              '#16a34a', '#d97706', '#0ea5e9', '#22c55e',
              '#3b82f6', '#f59e0b', '#64748b', '#dc2626', '#8b5cf6'
            ]
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      })
    }
  }, 100)
}

/* ============================================================
   EXPORT UTAMA: renderRekapAbsensi
   ============================================================ */
export async function renderRekapAbsensi(user) {
  const content = document.getElementById('content')
  if (!user) {
    content.innerHTML = `<div class="card"><p>Silakan login dulu</p></div>`
    return
  }

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:60vh;">
      <div style="text-align:center;">
        <i class="fa fa-spinner fa-spin" style="font-size:2rem;color:var(--primary);"></i>
        <p style="margin-top:12px;color:var(--text-muted);font-size:.85rem;">Memuat statistik...</p>
      </div>
    </div>`

  try {
    const isAdmin = canApproveAttendance(user) && !isStaff(user)

    // Rentang bulan berjalan
    const todayLocal = getTodayLokal()
    const [tyear, tmonth] = todayLocal.split('-').map(Number)
    const firstDay = new Date(Date.UTC(tyear, tmonth - 1, 1))
    const lastDay  = new Date(Date.UTC(tyear, tmonth, 0))
    const dateFrom = firstDay.toISOString().split('T')[0]
    const dateTo   = lastDay.toISOString().split('T')[0]

    // Profil pengguna
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle()
    const fullName = profile?.nama_lengkap || user.email

    // Data absensi personal bulan ini
    const absensiMonthAll = await fetchAbsensiRows({
      userId: user.id,
      nama: fullName,
      dateFrom,
      dateTo,
      select: 'tanggal, waktu_masuk, waktu_pulang, status_masuk, status_absensi, status_kehadiran'
    })
    const absensiMonth = (absensiMonthAll || []).filter(a => a.status_absensi === 'COMPLETE')

    let totalJamKerja = 0
    absensiMonth.forEach(a => {
      if (a.waktu_masuk && a.waktu_pulang) {
        const d = getDurasiMenit(a.waktu_masuk, a.waktu_pulang)
        if (d !== null) totalJamKerja += d / 60
      }
    })

    const totalHadir        = absensiMonth.filter(a => a.waktu_masuk).length
    const totalTerlambat    = absensiMonth.filter(a => a.status_masuk === 'Terlambat').length
    const totalLupaPulang   = absensiMonth.filter(a => a.status_kehadiran === 'LUPA_ABSEN_PULANG').length

    // Shift & status absensi hari ini
    const { data: shiftHariIni } = await supabase
      .from('jadwal')
      .select('shift_code, status_override')
      .eq('user_id', user.id)
      .eq('tanggal', todayLocal)
      .maybeSingle()
    const absensiHariIni = (absensiMonthAll || []).find(a => a.tanggal === todayLocal) || null

    // Riwayat terbaru
    const riwayatTerbaru = (absensiMonthAll || [])
      .slice()
      .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))
      .slice(0, 5)

    // ===== LIVE MONITORING KEHADIRAN HARI INI (khusus admin) =====
    let liveMonitoringHtml = ''

    if (isAdmin) {
      try {
        const hariIniStr = getTodayLokal()
        const { data: absenHariIni } = await applyTenantFilter(supabase.from('absensi').select('status_absensi,radius_status,approval_flag,status_masuk,waktu_masuk,waktu_pulang').eq('tanggal', hariIniStr), { user })
        const { data: jadwalHariIni } = await applyTenantFilter(supabase.from('jadwal').select('status_override,shift_code').eq('tanggal', hariIniStr), { user })

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
          if (['OFF', 'cuti', 'sakit', 'izin'].includes(j.status_override) || j.shift_code === '8') liburAtauCuti++
        })

        liveMonitoringHtml = `
          <div class="card fade-up" style="padding:16px;margin-bottom:20px;">
            <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:12px;">
              <i class="fa fa-circle-dot" style="color:var(--primary);"></i> Live Monitoring Kehadiran Hari Ini
            </div>
            ${openApproval > 0 ? `<button onclick="window.navigate('approval-absensi')" style="width:100%;margin-bottom:10px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:10px;padding:9px;font-weight:900;cursor:pointer;"><i class="fa fa-bell"></i> Absensi Menunggu Approval (${openApproval})</button>` : ''}
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center;">
              <div style="background:#dcfce7;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#166534;">${tepatWaktu}</div><div style="font-size:.6rem;color:#166534;font-weight:700;">Tepat Waktu</div></div>
              <div style="background:#fffbeb;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#b45309;">${sedangKerja}</div><div style="font-size:.6rem;color:#b45309;font-weight:700;">On Duty</div></div>
              <div style="background:#fee2e2;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#991b1b;">${terlambat}</div><div style="font-size:.6rem;color:#991b1b;font-weight:700;">Terlambat</div></div>
              <div style="background:#f1f5f9;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#475569;">${liburAtauCuti}</div><div style="font-size:.6rem;color:#475569;font-weight:700;">Off / Cuti</div></div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;text-align:center;margin-top:8px;">
              <div style="background:#fffbeb;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#b45309;">${openApproval}</div><div style="font-size:.6rem;color:#b45309;font-weight:700;">Menunggu Approval</div></div>
              <div style="background:#fee2e2;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#991b1b;">${outRadius}</div><div style="font-size:.6rem;color:#991b1b;font-weight:700;">Out Radius</div></div>
              <div style="background:#fef3c7;padding:10px 4px;border-radius:10px;"><div style="font-size:1.2rem;font-weight:900;color:#92400e;">${lupaAbsen}</div><div style="font-size:.6rem;color:#92400e;font-weight:700;">Lupa Absen</div></div>
            </div>
          </div>
        `
      } catch (err) {
        console.error('Gagal memuat live monitoring:', err)
      }
    }

    // ===== HR ANALYTICS GLOBAL (khusus admin) =====
    let adminGlobalHtml = ''
    let adminStats = null

    if (isAdmin) {
      try {
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
        const hadirGlobal      = completedAbsensi.filter(a => a.waktu_masuk).length
        const terlambatGlobal  = completedAbsensi.filter(a => a.status_masuk === 'Terlambat' || a.status_kehadiran === 'TERLAMBAT').length
        const pulangCepatGlobal= completedAbsensi.filter(a => a.status_kehadiran === 'PULANG_CEPAT' || Number(a.menit_pulang_cepat || 0) > 0).length
        const lupaPulangGlobal = (globalAbsensi || []).filter(a => a.status_kehadiran === 'LUPA_ABSEN_PULANG').length
        const openApprovalGlobal=(globalAbsensi || []).filter(a => a.status_absensi === 'OPEN').length
        const cutiGlobal       = (globalJadwal || []).filter(j => j.status_override === 'cuti').length
        const izinGlobal       = (globalJadwal || []).filter(j => j.status_override === 'izin').length
        const sakitGlobal      = (globalJadwal || []).filter(j => j.status_override === 'sakit').length
        const offGlobal        = (globalJadwal || []).filter(j => j.status_override === 'off' || j.shift_code === '8').length
        const attendanceKeys   = new Set((globalAbsensi || []).map(a => `${a.user_id || a.nama}|${a.tanggal}`))
        const alphaGlobal      = (globalJadwal || []).filter(j => {
          if (!j.user_id || !j.tanggal || j.tanggal > todayValue) return false
          if (['cuti', 'izin', 'sakit', 'off'].includes(j.status_override) || j.shift_code === '8') return false
          return !attendanceKeys.has(`${j.user_id}|${j.tanggal}`)
        }).length

        adminStats = {
          hadir: hadirGlobal, terlambat: terlambatGlobal, pulangCepat: pulangCepatGlobal,
          cuti: cutiGlobal, izin: izinGlobal, sakit: sakitGlobal,
          off: offGlobal, alpha: alphaGlobal, pending: openApprovalGlobal
        }

        // Ranking
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
        const rajinHtml       = renderRankList([...rankRows].sort((a, b) => b.tepat - a.tepat), 'tepat', 'tepat waktu')
        const terlambatRankHtml = renderRankList([...rankRows].sort((a, b) => b.terlambat - a.terlambat), 'terlambat', 'telat')
        const baikHtml        = renderRankList([...rankRows].sort((a, b) => (b.hadir - b.terlambat) - (a.hadir - a.terlambat)), 'hadir', 'hadir')
        const burukHtml       = renderRankList([...rankRows].sort((a, b) => b.masalah - a.masalah), 'masalah', 'masalah')

        adminGlobalHtml = `
          <div style="margin-bottom:20px;">
            <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:12px;">HR Analytics Global — Bulan Ini</div>
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
          <div class="card fade-up" style="padding:16px;margin-bottom:20px;">
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
      } catch (err) {
        console.error('Gagal memuat HR Analytics Global:', err)
      }
    }

    // ===== HTML STATISTIK PERSONAL =====
    const personalStatsHtml = `
      <div style="margin-bottom:20px;">
        <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:12px;">Statistik Personal — Bulan Ini</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Hadir Bulan Ini</div><div style="font-size:1.2rem;font-weight:800">${totalHadir}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Terlambat Bulan Ini</div><div style="font-size:1.2rem;font-weight:800">${totalTerlambat}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Lupa Absen Pulang</div><div style="font-size:1.2rem;font-weight:800">${totalLupaPulang}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Jam Kerja Bulan Ini</div><div style="font-size:1.2rem;font-weight:800">${totalJamKerja.toFixed(1)} jam</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Shift Hari Ini</div><div style="font-size:1rem;font-weight:800">${shiftHariIni?.status_override || shiftHariIni?.shift_code || '-'}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Status Absensi Hari Ini</div><div style="font-size:1rem;font-weight:800">${absensiHariIni?.status_absensi || 'Belum Absen'}</div></div>
        </div>
      </div>

      <div class="card fade-up" style="padding:16px;margin-bottom:20px;">
        <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;">Riwayat Absensi Terbaru</div>
        ${riwayatTerbaru.length
          ? riwayatTerbaru.map(r => `
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem;">
                <span>${toTanggalAbsensiLokal(r?.tanggal, r?.waktu_masuk || r?.waktu_pulang)}</span>
                <span>${r.waktu_masuk ? toJamLokal(r.waktu_masuk) : '-'} → ${r.waktu_pulang ? toJamLokal(r.waktu_pulang) : '-'}</span>
                <strong>${r.status_absensi || '-'}</strong>
              </div>`).join('')
          : '<div style="font-size:.82rem;color:var(--text-muted)">Belum ada riwayat absensi.</div>'
        }
      </div>
    `

    // ===== RENDER HALAMAN =====
    content.innerHTML = `
      <div class="page-header" style="margin-bottom:20px;">
        <h2 style="margin:0;"><i class="fa fa-chart-line"></i> Statistik Absensi</h2>
        <p style="margin:4px 0 0;color:var(--text-muted);font-size:.82rem;">
          ${toTanggalLokal(firstDay.toISOString())} – ${toTanggalLokal(lastDay.toISOString())}
        </p>
      </div>

      ${isAdmin ? liveMonitoringHtml : ''}

      ${isAdmin ? adminGlobalHtml : ''}

      ${personalStatsHtml}

      <div class="card fade-up" style="padding:18px;margin-bottom:20px;text-align:center;">
        <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:14px;">Total Jam Kerja</div>
        <div style="position:relative;width:160px;height:160px;margin:0 auto;">
          <canvas id="jamKerjaChart"></canvas>
          <div id="jamKerjaChart-text" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;"></div>
        </div>
      </div>

      <div class="card fade-up" style="padding:18px;margin-bottom:20px;">
        <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:12px;">Aktivitas Saya (Jam Datang &amp; Pulang)</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:12px;">
          ${toTanggalLokal(firstDay.toISOString())} – ${toTanggalLokal(lastDay.toISOString())}
        </div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <div style="position:relative;width:100%;min-width:600px;height:300px;">
            <canvas id="aktivitasChart"></canvas>
          </div>
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:12px;">Distribusi Absensi</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
          <div class="card fade-up" style="padding:14px;">
            <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);margin-bottom:10px;text-align:center;">Kehadiran</div>
            <div style="position:relative;width:100%;height:200px;"><canvas id="absensiChartKehadiran"></canvas></div>
          </div>
          <div class="card fade-up" style="padding:14px;">
            <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);margin-bottom:10px;text-align:center;">Absen Masuk</div>
            <div style="position:relative;width:100%;height:200px;"><canvas id="absensiChartMasuk"></canvas></div>
          </div>
          <div class="card fade-up" style="padding:14px;">
            <div style="font-size:.75rem;font-weight:700;color:var(--text-muted);margin-bottom:10px;text-align:center;">Absen Pulang</div>
            <div style="position:relative;width:100%;height:200px;"><canvas id="absensiChartPulang"></canvas></div>
          </div>
        </div>
      </div>
    `

    // Muat Chart.js jika belum tersedia, lalu render grafik
    if (typeof Chart === 'undefined') {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
      script.onload = () => { loadRekapCharts(user.id, dateFrom, dateTo, totalJamKerja, adminStats) }
      document.head.appendChild(script)
    } else {
      loadRekapCharts(user.id, dateFrom, dateTo, totalJamKerja, adminStats)
    }

  } catch (err) {
    console.error('Gagal render statistik absensi:', err)
    content.innerHTML = `
      <div class="card" style="padding:18px;border-color:#fecaca;background:#fef2f2;color:#991b1b;">
        <strong>Statistik gagal dimuat.</strong>
        <p style="margin:.5rem 0 0;">Data tidak dapat ditampilkan. Coba muat ulang atau hubungi admin.</p>
      </div>`
    window.showToast?.('Statistik absensi gagal dimuat.', 'error')
  }
}
