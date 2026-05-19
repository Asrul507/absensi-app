import { supabase } from './supabase.js'
import { hitungMasaKerja, formatMasaKerja, getSisaCuti, hitungJatahCuti } from './cuti.js'

export async function renderDashboard() {
  const content = document.getElementById('content')
  const user = window.currentUser
  const role = user?.role || 'staff'
  const today = new Date().toISOString().split('T')[0]

  content.innerHTML = `
    <div class="live-clock-card fade-up">
      <div id="liveClock" class="live-clock">00:00:00</div>
      <div id="liveDate" class="live-date">Loading...</div>
    </div>

    <div class="stats-grid fade-up-1" id="kpiGrid">
      <div class="stat-card blue"><div class="stat-icon"><i class="fa fa-users"></i></div><div class="stat-label">Total Staff</div><div class="stat-value" id="kpiTotal">-</div></div>
      <div class="stat-card green"><div class="stat-icon"><i class="fa fa-check"></i></div><div class="stat-label">Hadir</div><div class="stat-value" id="kpiHadir">-</div></div>
      <div class="stat-card yellow"><div class="stat-icon"><i class="fa fa-clock"></i></div><div class="stat-label">Belum Absen</div><div class="stat-value" id="kpiBelum">-</div></div>
      <div class="stat-card red"><div class="stat-icon"><i class="fa fa-exclamation"></i></div><div class="stat-label">Terlambat</div><div class="stat-value" id="kpiTelat">-</div></div>
    </div>

    <div id="sectionMain"></div>
    <div id="sectionCutiChart" class="fade-up-2"></div>
    <div id="sectionAdmin"></div>
  `

  // Live clock
  function updateClock() {
    const now = new Date()
    const clockEl = document.getElementById('liveClock')
    const dateEl = document.getElementById('liveDate')
    if (clockEl) clockEl.innerText = now.toLocaleTimeString('id-ID')
    if (dateEl) dateEl.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
  updateClock()
  setInterval(updateClock, 1000)

  // KPI
  const { count: totalUser } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status_akun', 'Aktif')
  const { data: absensiHariIni } = await supabase.from('absensi').select('*').eq('tanggal', today)
  const hadir = absensiHariIni?.filter(a => a.waktu_masuk)?.length || 0
  const telat = absensiHariIni?.filter(a => a.status_masuk === 'Terlambat')?.length || 0
  const belum = (totalUser || 0) - hadir

  document.getElementById('kpiTotal').innerText = totalUser || 0
  document.getElementById('kpiHadir').innerText = hadir
  document.getElementById('kpiBelum').innerText = belum
  document.getElementById('kpiTelat').innerText = telat

  // ========================
  // STAFF DASHBOARD
  // ========================
  if (role === 'staff') {
    const { data: myShift } = await supabase.from('jadwal').select('*').eq('user_id', user.id).eq('tanggal', today).maybeSingle()
    const { data: myAbsen } = await supabase.from('absensi').select('*').eq('nama', user.nama_lengkap).eq('tanggal', today).maybeSingle()

    const masaKerja = hitungMasaKerja(user.tanggal_bergabung)
    const { jatah, terpakai, sisa } = await getSisaCuti(user.id, user.tanggal_bergabung)

    let shiftText = getShiftLabel(myShift)
    let statusHariIni = '❌ Belum Absen'
    if (myAbsen?.waktu_masuk && !myAbsen?.waktu_pulang) statusHariIni = '🟡 Sedang Bekerja'
    if (myAbsen?.waktu_masuk && myAbsen?.waktu_pulang) statusHariIni = '🟢 Selesai'

    document.getElementById('sectionMain').innerHTML = `
      <div class="card fade-up-1">
        <div class="card-title"><i class="fa fa-user-circle"></i> Info Hari Ini</div>
        <div class="stats-grid" style="grid-template-columns:1fr 1fr;">
          <div class="stat-card blue">
            <div class="stat-icon"><i class="fa fa-calendar-day"></i></div>
            <div class="stat-label">Shift Hari Ini</div>
            <div class="stat-value" style="font-size:1.1rem;">${shiftText}</div>
          </div>
          <div class="stat-card green">
            <div class="stat-icon"><i class="fa fa-fingerprint"></i></div>
            <div class="stat-label">Status Absen</div>
            <div class="stat-value" style="font-size:1rem;">${statusHariIni}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <button class="btn-primary" onclick="navigate('absensi')"><i class="fa fa-camera"></i> Absen Sekarang</button>
          <button class="btn-secondary" onclick="navigate('riwayat')"><i class="fa fa-list"></i> Riwayat</button>
          <button class="btn-secondary" onclick="navigate('pengajuan')"><i class="fa fa-file"></i> Pengajuan</button>
        </div>
      </div>
    `

    // Cuti chart staff
    document.getElementById('sectionCutiChart').innerHTML = `
      <div class="card fade-up-2">
        <div class="card-title"><i class="fa fa-umbrella-beach"></i> Cuti Saya</div>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.82rem;">
              <span>Masa Kerja</span><strong>${formatMasaKerja(masaKerja)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.82rem;">
              <span>Jatah Cuti Tahunan</span><strong>${jatah} hari</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.82rem;">
              <span>Cuti Terpakai</span><strong style="color:var(--warning);">${terpakai} hari</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:.82rem;">
              <span>Sisa Cuti</span><strong style="color:${sisa < 0 ? 'var(--danger)' : 'var(--success)'};">${sisa} hari${sisa < 0 ? ' (minus)' : ''}</strong>
            </div>
          </div>
          <div style="width:140px;text-align:center;">
            ${renderDonut(jatah, terpakai, sisa)}
          </div>
        </div>
        ${masaKerja < 6
          ? `<div class="alert warning" style="margin-top:12px;"><i class="fa fa-info-circle"></i> Cuti aktif setelah 6 bulan kerja (${6 - masaKerja} bulan lagi)</div>`
          : masaKerja < 12
            ? `<div class="alert info" style="margin-top:12px;"><i class="fa fa-info-circle"></i> Jatah 12 hari/tahun aktif setelah 12 bulan kerja (${12 - masaKerja} bulan lagi)</div>`
            : ''
        }
      </div>
    `
  }

  // ========================
  // ADMIN DASHBOARD
  // ========================
  if (role === 'admin' || role === 'super_admin') {
    const { data: jadwalHariIni } = await supabase.from('jadwal').select('*, profiles:user_id(nama_lengkap)').eq('tanggal', today)
    const { data: belumPulangData } = await supabase.from('absensi').select('*').eq('tanggal', today).is('waktu_pulang', null)
    const { data: pending } = await supabase.from('absensi').select('*').eq('tanggal', today).eq('status_validasi', 'pending')

    document.getElementById('sectionAdmin').innerHTML = `
      <div class="card fade-up-2">
        <div class="card-title"><i class="fa fa-chart-bar"></i> Live Monitoring</div>
        <div class="stats-grid" style="grid-template-columns:1fr 1fr;">
          <div class="stat-card red">
            <div class="stat-icon"><i class="fa fa-exclamation-circle"></i></div>
            <div class="stat-label">Perlu Validasi</div>
            <div class="stat-value">${pending?.length || 0}</div>
          </div>
          <div class="stat-card yellow">
            <div class="stat-icon"><i class="fa fa-door-open"></i></div>
            <div class="stat-label">Belum Pulang</div>
            <div class="stat-value">${belumPulangData?.length || 0}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
          <button class="btn-primary" onclick="navigate('jadwal')"><i class="fa fa-calendar"></i> Kelola Jadwal</button>
          <button class="btn-secondary" onclick="navigate('users')"><i class="fa fa-users"></i> Kelola User</button>
          <button class="btn-secondary" onclick="navigate('pengajuan')"><i class="fa fa-inbox"></i> Approval</button>
          <button class="btn-secondary" onclick="navigate('riwayat')"><i class="fa fa-list"></i> Riwayat</button>
        </div>
      </div>

      <div class="card fade-up-3">
        <div class="card-title"><i class="fa fa-calendar-day"></i> Jadwal Hari Ini</div>
        ${!jadwalHariIni || jadwalHariIni.length === 0
          ? `<div class="empty-state"><i class="fa fa-calendar"></i><p>Belum ada jadwal hari ini</p></div>`
          : jadwalHariIni.map(j => `
            <div class="absen-record">
              <div class="ar-top">
                <div class="ar-date">${j.profiles?.nama_lengkap || '-'}</div>
                <span class="badge badge-blue">${getShiftLabel(j)}</span>
              </div>
            </div>
          `).join('')}
      </div>
    `

    // Cuti chart admin - semua karyawan
    await renderCutiChartAdmin()
  }
}

/* ================= CUTI CHART ADMIN ================= */
async function renderCutiChartAdmin() {
  const chartEl = document.getElementById('sectionCutiChart')
  if (!chartEl) return

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, nama_lengkap, tanggal_bergabung, sisa_cuti, status_akun')
    .eq('status_akun', 'Aktif')
    .order('nama_lengkap')

  if (!profiles || profiles.length === 0) return

  const tahunIni = new Date().getFullYear()

  // Load semua pengajuan cuti approved tahun ini
  const { data: semuaCuti } = await supabase
    .from('pengajuan')
    .select('user_id, jumlah_hari, status, created_at')
    .eq('jenis', 'cuti')
    .eq('status', 'approved')
    .gte('tanggal_pengajuan', `${tahunIni}-01-01`)

  // Hitung per user
  const cutiMap = {}
  ;(semuaCuti || []).forEach(c => {
    if (!cutiMap[c.user_id]) cutiMap[c.user_id] = 0
    cutiMap[c.user_id] += parseInt(c.jumlah_hari) || 0
  })

  // Load pending cuti
  const { data: pending } = await supabase
    .from('pengajuan')
    .select('user_id, jumlah_hari')
    .eq('jenis', 'cuti')
    .eq('status', 'pending')

  const pendingMap = {}
  ;(pending || []).forEach(c => {
    if (!pendingMap[c.user_id]) pendingMap[c.user_id] = 0
    pendingMap[c.user_id] += parseInt(c.jumlah_hari) || 0
  })

  const rows = profiles.map(p => {
    const jatah = hitungJatahCuti(p.tanggal_bergabung)
    const terpakai = cutiMap[p.id] || 0
    const sisa = jatah - terpakai
    const pend = pendingMap[p.id] || 0
    return { ...p, jatah, terpakai, sisa, pending: pend }
  })

  chartEl.innerHTML = `
    <div class="card fade-up-2">
      <div class="card-title"><i class="fa fa-chart-bar"></i> Rekap Cuti Karyawan ${tahunIni}</div>

      <div style="display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap;font-size:.78rem;">
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:2px;background:#22c55e;display:inline-block;"></span>Sisa Cuti</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:2px;background:#f59e0b;display:inline-block;"></span>Cuti Diambil</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:2px;background:#3b82f6;display:inline-block;"></span>Pending</span>
      </div>

      ${rows.map(r => {
        const pct_sisa = r.jatah > 0 ? Math.max(0, r.sisa) / r.jatah * 100 : 0
        const pct_pakai = r.jatah > 0 ? Math.min(100, r.terpakai / r.jatah * 100) : 0
        const pct_pend = r.jatah > 0 ? Math.min(20, r.pending / r.jatah * 100) : 0

        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
              <span style="font-size:.82rem;font-weight:700;color:var(--text);">${r.nama_lengkap}</span>
              <span style="font-size:.74rem;color:var(--text-muted);">
                ${r.terpakai}/${r.jatah} diambil
                ${r.pending > 0 ? `· <span style="color:#3b82f6;">${r.pending} pending</span>` : ''}
                · <span style="color:${r.sisa < 0 ? 'var(--danger)' : 'var(--success)'};">sisa ${r.sisa}</span>
              </span>
            </div>
            <div style="height:10px;background:var(--gray-100);border-radius:999px;overflow:hidden;display:flex;">
              <div style="width:${pct_pakai}%;background:#f59e0b;transition:.4s;"></div>
              <div style="width:${pct_pend}%;background:#3b82f6;transition:.4s;opacity:.7;"></div>
              <div style="width:${pct_sisa}%;background:#22c55e;transition:.4s;"></div>
            </div>
            ${r.jatah === 0 ? `<div style="font-size:.7rem;color:var(--text-muted);margin-top:3px;">Belum eligible jatah cuti tahunan</div>` : ''}
          </div>
        `
      }).join('')}

      <div style="text-align:right;margin-top:8px;">
        <button class="btn-secondary btn-sm" onclick="navigate('users')">
          <i class="fa fa-users"></i> Detail User
        </button>
      </div>
    </div>
  `
}

/* ================= DONUT CHART (SVG) ================= */
function renderDonut(jatah, terpakai, sisa) {
  if (jatah === 0) return `<div style="font-size:.8rem;color:var(--text-muted);text-align:center;">Belum ada jatah cuti</div>`

  const total = jatah
  const r = 44
  const circ = 2 * Math.PI * r
  const pct_pakai = Math.min(1, terpakai / total)
  const pct_sisa = Math.max(0, sisa) / total

  const dash_pakai = pct_pakai * circ
  const dash_sisa = pct_sisa * circ

  return `
    <svg viewBox="0 0 100 100" width="120" height="120">
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--gray-100)" stroke-width="10"/>
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="#f59e0b" stroke-width="10"
        stroke-dasharray="${dash_pakai} ${circ}" stroke-dashoffset="${circ * 0.25}" stroke-linecap="round"/>
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="#22c55e" stroke-width="10"
        stroke-dasharray="${dash_sisa} ${circ}" stroke-dashoffset="${circ * 0.25 - dash_pakai}" stroke-linecap="round"/>
      <text x="50" y="46" text-anchor="middle" font-size="14" font-weight="900" fill="var(--text)">${sisa < 0 ? sisa : sisa}</text>
      <text x="50" y="60" text-anchor="middle" font-size="9" fill="var(--text-muted)">sisa</text>
    </svg>
  `
}

/* ================= SHIFT LABEL ================= */
function getShiftLabel(j) {
  if (!j) return '-'
  if (j?.status_override === 'cuti') return '🌴 Cuti'
  if (j?.status_override === 'sakit') return '🤒 Sakit'
  if (j?.status_override === 'izin') return '📋 Izin'
  if (j?.shift_code == '2') return '🌅 Pagi'
  if (j?.shift_code == '3') return '🌇 Sore'
  if (j?.shift_code == '4') return '🌙 Malam'
  if (j?.shift_code == '8') return '⚫ OFF'
  return '-'
}
