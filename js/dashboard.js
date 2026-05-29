import { supabase } from './supabase.js'
import { getTodayLokal, getDurasiMenit } from './timezone.js'
import { createTotalJamKerjaChart, createAktivitasChart, createAbsensiChart } from './chart-helpers.js'
import { canApproveAttendance, RADIUS_STATUS } from './attendance-approval.js'

export async function renderDashboard() {
  const content = document.getElementById('content')
  const user = window.currentUser

  if (!user) {
    content.innerHTML = `<div class="card"><p>Silakan login dulu</p></div>`
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

    const { data: absenKemarin, error: errKemarin } = await supabase
      .from('absensi')
      .select('*')
      .eq('nama', user.nama_lengkap || user.email)
      .eq('tanggal', tanggalKemarinStr)
      .maybeSingle()

    if (!errKemarin && absenKemarin?.waktu_masuk && !absenKemarin?.waktu_pulang) {
      await supabase
        .from('absensi')
        .update({ status_absensi: 'OPEN', status_kehadiran: 'MENUNGGU_VERIFIKASI' })
        .eq('id', absenKemarin.id)
    }
  } catch (e) {
    console.error('Gagal sinkronisasi status OPEN absensi:', e)
  }

  // Get profile terbaru
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const fullName = profile?.nama_lengkap || user.email
  const sisaCuti = profile?.sisa_cuti || 0

  if (profile?.foto_url && profile.foto_url !== window.currentUser.foto_url) {
    window.currentUser.foto_url = profile.foto_url
    const el = document.getElementById('topbarAvatar')
    if (el) {
      el.style.backgroundImage = `url(${profile.foto_url})`
      el.style.backgroundSize  = 'cover'
      el.textContent = ''
    }
  }

  // Date range (current month)
  // Gunakan tanggal lokal (dari titik radius) sebagai basis bulan
  const todayLocal = getTodayLokal()
  const [tyear, tmonth] = todayLocal.split('-').map(Number)
  const firstDay = new Date(Date.UTC(tyear, tmonth - 1, 1))
  const lastDay  = new Date(Date.UTC(tyear, tmonth, 0))
  const dateFrom = firstDay.toISOString().split('T')[0]
  const dateTo   = lastDay.toISOString().split('T')[0]

  const isAdmin = canApproveAttendance(user)

  // Get total jam kerja (personal user login)
  const { data: absensiMonth } = await supabase
    .from('absensi')
    .select('waktu_masuk, waktu_pulang, status_masuk, status_absensi, status_kehadiran')
    .eq('status_absensi', 'COMPLETE')
    .eq('nama', fullName)
    .gte('tanggal', dateFrom)
    .lte('tanggal', dateTo)

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
      
      const { data: absenHariIni } = await supabase.from('absensi').select('*').eq('tanggal', hariIniStr)
      const { data: jadwalHariIni } = await supabase.from('jadwal').select('*').eq('tanggal', hariIniStr)
      
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
  const { data: absensiHariIni } = await supabase
    .from('absensi')
    .select('waktu_masuk, waktu_pulang, status_absensi, status_kehadiran')
    .eq('nama', fullName)
    .eq('tanggal', todayLocal)
    .maybeSingle()

  const { data: shiftHariIni } = await supabase
    .from('jadwal')
    .select('shift_code, status_override')
    .eq('user_id', user.id)
    .eq('tanggal', todayLocal)
    .maybeSingle()

  const totalHadirBulanIni = absensiMonth?.filter(a => a.waktu_masuk && a.status_absensi === 'COMPLETE').length || 0
  const totalTerlambatBulanIni = absensiMonth?.filter(a => a.status_masuk === 'Terlambat').length || 0
  const totalLupaPulangBulanIni = absensiMonth?.filter(a => a.status_kehadiran === 'LUPA_ABSEN_PULANG').length || 0

  const { data: riwayatTerbaru } = await supabase
    .from('absensi')
    .select('tanggal, waktu_masuk, waktu_pulang, status_absensi, status_kehadiran')
    .eq('nama', fullName)
    .order('tanggal', { ascending: false })
    .limit(5)

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
      ${(riwayatTerbaru || []).map(r => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem;"><span>${r.tanggal}</span><span>${r.waktu_masuk || '-'} → ${r.waktu_pulang || '-'}</span><strong>${r.status_absensi || '-'}</strong></div>`).join('') || '<div style="font-size:.82rem;color:var(--text-muted)">Belum ada riwayat absensi.</div>'}
    </div>
  `

  // ===== HR ANALYTICS GLOBAL (ADMIN / SUPER ADMIN) =====
  let adminGlobalHtml = ''
  if (isAdmin) {
    const { data: globalAbsensi } = await supabase
      .from('absensi')
      .select('nama, status_masuk, status_absensi, status_kehadiran, waktu_masuk, waktu_pulang')
      .eq('status_absensi', 'COMPLETE')
      .gte('tanggal', dateFrom)
      .lte('tanggal', dateTo)

    const hadirGlobal = globalAbsensi?.filter(a => a.waktu_masuk).length || 0
    const terlambatGlobal = globalAbsensi?.filter(a => a.status_masuk === 'Terlambat').length || 0
    const lupaPulangGlobal = globalAbsensi?.filter(a => a.status_kehadiran === 'LUPA_ABSEN_PULANG').length || 0

    const rankMap = {}
    ;(globalAbsensi || []).forEach(a => {
      if (!a.nama) return
      if (!rankMap[a.nama]) rankMap[a.nama] = { hadir: 0 }
      if (a.waktu_masuk) rankMap[a.nama].hadir += 1
    })
    const ranking = Object.entries(rankMap).sort((a, b) => b[1].hadir - a[1].hadir).slice(0, 5)

    adminGlobalHtml = `
      <div style="margin-bottom: 20px;">
        <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">HR Analytics Global</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Total Hadir</div><div style="font-size:1.2rem;font-weight:800">${hadirGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Total Terlambat</div><div style="font-size:1.2rem;font-weight:800">${terlambatGlobal}</div></div>
          <div class="card" style="padding:12px;"><div style="font-size:.7rem;color:var(--text-muted)">Lupa Absen Pulang</div><div style="font-size:1.2rem;font-weight:800">${lupaPulangGlobal}</div></div>
        </div>
      </div>
      <div class="card fade-up" style="padding:16px;margin-bottom:20px;" id="adminGlobalStats" data-hadir="${hadirGlobal}" data-terlambat="${terlambatGlobal}" data-lupa="${lupaPulangGlobal}">
        <div style="font-size:.75rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;">Ranking Staff (Top 5 Kehadiran)</div>
        ${ranking.map(([nama, v], i) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem;"><span>#${i + 1} ${nama}</span><strong>${v.hadir} hadir</strong></div>`).join('')}
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

    <div class="card fade-up" style="padding: 18px; margin-bottom: 20px; background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; border: none;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-weight: 800; font-size: 1.1rem;">${fullName}</div>
          <div style="font-size: .8rem; color: rgba(255,255,255,0.8); margin-top: 6px;">Saldo Cuti: <strong>${sisaCuti} hari</strong></div>
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
        ${firstDay.toLocaleDateString('id-ID')} - ${lastDay.toLocaleDateString('id-ID')}
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

  if (typeof Chart === 'undefined') {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
    script.onload = () => { loadCharts(user.id, dateFrom, dateTo, totalJamKerja) }
    document.head.appendChild(script)
  } else {
    loadCharts(user.id, dateFrom, dateTo, totalJamKerja)
  }
}

async function loadCharts(userId, dateFrom, dateTo, totalJamKerja) {
  setTimeout(() => {
    createTotalJamKerjaChart('jamKerjaChart', totalJamKerja)
    createAktivitasChart('aktivitasChart', userId, dateFrom, dateTo)
    createAbsensiChart('absensiChartKehadiran', 'absensiChartMasuk', 'absensiChartPulang', userId, dateFrom, dateTo)
    if (canApproveAttendance(window.currentUser) && document.getElementById('adminGlobalChart')) {
      const ctx = document.getElementById('adminGlobalChart')
      const statsEl = document.getElementById('adminGlobalStats')
      const hadir = Number(statsEl?.dataset?.hadir || 0)
      const terlambat = Number(statsEl?.dataset?.terlambat || 0)
      const lupa = Number(statsEl?.dataset?.lupa || 0)
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Hadir', 'Terlambat', 'Lupa Pulang'],
          datasets: [{ data: [hadir, terlambat, lupa], backgroundColor: ['#16a34a', '#d97706', '#dc2626'] }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      })
    }
  }, 100)
}
