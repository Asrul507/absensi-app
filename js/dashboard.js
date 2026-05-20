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
    <div class="stats-grid fade-up-1">
      <div class="stat-card blue"><div class="stat-icon"><i class="fa fa-users"></i></div><div class="stat-label">Total Staff</div><div class="stat-value" id="kpiTotal">-</div></div>
      <div class="stat-card green"><div class="stat-icon"><i class="fa fa-check"></i></div><div class="stat-label">Hadir</div><div class="stat-value" id="kpiHadir">-</div></div>
      <div class="stat-card yellow"><div class="stat-icon"><i class="fa fa-clock"></i></div><div class="stat-label">Belum Absen</div><div class="stat-value" id="kpiBelum">-</div></div>
      <div class="stat-card red"><div class="stat-icon"><i class="fa fa-exclamation"></i></div><div class="stat-label">Terlambat</div><div class="stat-value" id="kpiTelat">-</div></div>
    </div>
    <div id="sectionMain"></div>
    <div id="sectionCutiChart" class="fade-up-2"></div>
    <div id="sectionAdmin"></div>
  `

  function updateClock() {
    const now = new Date()
    const c = document.getElementById('liveClock')
    const d = document.getElementById('liveDate')
    if (c) c.innerText = now.toLocaleTimeString('id-ID')
    if (d) d.innerText = now.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  }
  updateClock()
  setInterval(updateClock, 1000)

  const { count: totalUser } = await supabase.from('profiles').select('*', { count:'exact', head:true }).eq('status_akun','Aktif')
  const { data: absenHariIni } = await supabase.from('absensi').select('*').eq('tanggal', today)
  const hadir = absenHariIni?.filter(a => a.waktu_masuk)?.length || 0
  const telat = absenHariIni?.filter(a => a.status_masuk === 'Terlambat')?.length || 0
  const belum = (totalUser || 0) - hadir
  document.getElementById('kpiTotal').innerText = totalUser || 0
  document.getElementById('kpiHadir').innerText = hadir
  document.getElementById('kpiBelum').innerText = belum
  document.getElementById('kpiTelat').innerText = telat

  if (role === 'staff') {
    const { data: myShift } = await supabase.from('jadwal').select('*').eq('user_id', user.id).eq('tanggal', today).maybeSingle()
    const { data: myAbsen } = await supabase.from('absensi').select('*').eq('nama', user.nama_lengkap).eq('tanggal', today).maybeSingle()
    const masaKerja = hitungMasaKerja(user.tanggal_bergabung)
    const { jatah, terpakai, sisa } = await getSisaCuti(user.id, user.tanggal_bergabung)
    let shiftText = getShiftLabel(myShift)
    let statusAbsen = '❌ Belum Absen'
    if (myAbsen?.waktu_masuk && !myAbsen?.waktu_pulang) statusAbsen = '🟡 Sedang Bekerja'
    if (myAbsen?.waktu_masuk && myAbsen?.waktu_pulang)  statusAbsen = '🟢 Selesai'

    document.getElementById('sectionMain').innerHTML = `
      <div class="card fade-up-1">
        <div class="card-title"><i class="fa fa-user-circle"></i> Info Hari Ini</div>
        <div class="stats-grid" style="grid-template-columns:1fr 1fr;">
          <div class="stat-card blue"><div class="stat-icon"><i class="fa fa-calendar-day"></i></div><div class="stat-label">Shift</div><div class="stat-value" style="font-size:1rem;">${shiftText}</div></div>
          <div class="stat-card green"><div class="stat-icon"><i class="fa fa-fingerprint"></i></div><div class="stat-label">Status Absen</div><div class="stat-value" style="font-size:.9rem;">${statusAbsen}</div></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
          <button class="btn-primary" onclick="navigate('absensi')"><i class="fa fa-camera"></i> Absen Sekarang</button>
          <button class="btn-secondary" onclick="navigate('pengajuan')"><i class="fa fa-file-alt"></i> Pengajuan</button>
        </div>
      </div>
    `
    document.getElementById('sectionCutiChart').innerHTML = `
      <div class="card fade-up-2">
        <div class="card-title"><i class="fa fa-umbrella-beach"></i> Info Cuti Saya</div>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:160px;">
            ${infoRow('Masa Kerja', formatMasaKerja(masaKerja))}
            ${infoRow('Jatah Tahunan', jatah + ' hari')}
            ${infoRow('Terpakai', terpakai + ' hari', '#f59e0b')}
            ${infoRow('Sisa', sisa + ' hari' + (sisa < 0 ? ' (minus)' : ''), sisa < 0 ? 'var(--danger)' : 'var(--success)')}
          </div>
          <div style="flex-shrink:0;">${donutSVG(jatah, terpakai, sisa)}</div>
        </div>
        ${masaKerja < 6 ? `<div class="alert warning" style="margin-top:12px;"><i class="fa fa-info-circle"></i> Cuti aktif setelah 6 bulan kerja (${6-masaKerja} bulan lagi)</div>`
          : masaKerja < 12 ? `<div class="alert info" style="margin-top:12px;"><i class="fa fa-info-circle"></i> Jatah 12 hari aktif setelah 12 bulan kerja (${12-masaKerja} bulan lagi)</div>` : ''}
        <button class="btn-secondary btn-sm" onclick="navigate('pengajuan')" style="margin-top:12px;"><i class="fa fa-plus"></i> Ajukan Cuti</button>
      </div>
    `
  }

  if (role === 'admin' || role === 'super_admin') {
    const { data: jadwalHariIni } = await supabase.from('jadwal').select('*, profiles:user_id(nama_lengkap)').eq('tanggal', today)
    // FIX: pakai status_absensi bukan status_validasi
    const { data: salahAbsen } = await supabase.from('absensi').select('*').eq('tanggal', today).eq('status_absensi', 'salah absen')
    const { data: belumPulang } = await supabase.from('absensi').select('*').eq('tanggal', today).is('waktu_pulang', null)

    document.getElementById('sectionAdmin').innerHTML = `
      <div class="card fade-up-2">
        <div class="card-title"><i class="fa fa-chart-line"></i> Live Monitoring</div>
        <div class="stats-grid" style="grid-template-columns:1fr 1fr;">
          <div class="stat-card red"><div class="stat-icon"><i class="fa fa-exclamation-circle"></i></div><div class="stat-label">Salah Absen</div><div class="stat-value">${salahAbsen?.length || 0}</div></div>
          <div class="stat-card yellow"><div class="stat-icon"><i class="fa fa-door-open"></i></div><div class="stat-label">Belum Pulang</div><div class="stat-value">${belumPulang?.length || 0}</div></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
          <button class="btn-primary"   onclick="navigate('jadwal')">   <i class="fa fa-calendar"></i> Jadwal</button>
          <button class="btn-secondary" onclick="navigate('users')">    <i class="fa fa-users"></i> Users</button>
          <button class="btn-secondary" onclick="navigate('pengajuan')"><i class="fa fa-inbox"></i> Approval</button>
          <button class="btn-secondary" onclick="navigate('riwayat')">  <i class="fa fa-list"></i> Riwayat</button>
        </div>
      </div>
      <div class="card fade-up-3">
        <div class="card-title"><i class="fa fa-calendar-day"></i> Jadwal Hari Ini</div>
        ${!jadwalHariIni?.length
          ? `<div class="empty-state"><i class="fa fa-calendar"></i><p>Belum ada jadwal</p></div>`
          : jadwalHariIni.map(j => `
            <div class="absen-record">
              <div class="ar-top">
                <div class="ar-date">${j.profiles?.nama_lengkap || '-'}</div>
                <span class="badge badge-blue">${getShiftLabel(j)}</span>
              </div>
            </div>`).join('')}
      </div>
    `
    await renderCutiChartAdmin()
  }
}

async function renderCutiChartAdmin() {
  const el = document.getElementById('sectionCutiChart')
  if (!el) return
  const { data: profiles } = await supabase.from('profiles').select('id,nama_lengkap,tanggal_bergabung').eq('status_akun','Aktif').order('nama_lengkap')
  if (!profiles?.length) return
  const tahunIni = new Date().getFullYear()
  const { data: approved } = await supabase.from('pengajuan').select('user_id,jumlah_hari').eq('jenis','cuti').eq('status','approved').gte('tanggal_pengajuan',`${tahunIni}-01-01`)
  const { data: pending  } = await supabase.from('pengajuan').select('user_id,jumlah_hari').eq('jenis','cuti').eq('status','pending')
  const mA = {}; (approved||[]).forEach(c => { mA[c.user_id] = (mA[c.user_id]||0) + (parseInt(c.jumlah_hari)||0) })
  const mP = {}; (pending ||[]).forEach(c => { mP[c.user_id] = (mP[c.user_id]||0) + (parseInt(c.jumlah_hari)||0) })
  const rows = profiles.map(p => { const j=hitungJatahCuti(p.tanggal_bergabung), t=mA[p.id]||0, pend=mP[p.id]||0; return {...p,jatah:j,terpakai:t,pending:pend,sisa:j-t} })

  el.innerHTML = `
    <div class="card fade-up-2">
      <div class="card-title"><i class="fa fa-chart-bar"></i> Rekap Cuti Karyawan ${tahunIni}</div>
      <div style="display:flex;gap:14px;margin-bottom:14px;font-size:.75rem;flex-wrap:wrap;">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f59e0b;margin-right:4px;"></span>Diambil</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#3b82f6;margin-right:4px;"></span>Pending</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#22c55e;margin-right:4px;"></span>Sisa</span>
      </div>
      ${rows.map(r => {
        const total = Math.max(r.jatah, r.terpakai+r.pending)||1
        const pA = Math.min(100, r.terpakai/total*100)
        const pP = Math.min(100-pA, r.pending/total*100)
        const pS = Math.max(0, r.sisa)/total*100
        return `<div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:.82rem;">
            <span style="font-weight:700;">${r.nama_lengkap}</span>
            <span style="color:var(--text-muted);">
              ${r.terpakai}/${r.jatah}
              ${r.pending ? `· <span style="color:#3b82f6;">${r.pending}p</span>` : ''}
              · <strong style="color:${r.sisa<0?'var(--danger)':'var(--success)'};">sisa ${r.sisa}</strong>
            </span>
          </div>
          <div style="height:9px;background:var(--gray-100);border-radius:999px;overflow:hidden;display:flex;">
            <div style="width:${pA}%;background:#f59e0b;"></div>
            <div style="width:${pP}%;background:#3b82f6;opacity:.8;"></div>
            <div style="width:${pS}%;background:#22c55e;"></div>
          </div>
          ${r.jatah===0?`<div style="font-size:.7rem;color:var(--text-muted);margin-top:2px;">Belum eligible jatah cuti</div>`:''}
        </div>`
      }).join('')}
    </div>
  `
}

function infoRow(label, val, color='var(--text)') {
  return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--gray-100);font-size:.82rem;">
    <span style="color:var(--text-muted);">${label}</span><strong style="color:${color};">${val}</strong></div>`
}

function donutSVG(jatah, terpakai, sisa) {
  if (!jatah) return `<div style="font-size:.78rem;color:var(--text-muted);width:100px;text-align:center;">Belum ada jatah</div>`
  const r=40, circ=2*Math.PI*r
  const dA = Math.min(1, terpakai/jatah)*circ
  const dS = Math.max(0,sisa)/jatah*circ
  return `<svg viewBox="0 0 100 100" width="100" height="100">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--gray-100)" stroke-width="12"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="#f59e0b" stroke-width="12" stroke-dasharray="${dA} ${circ}" stroke-dashoffset="${circ*.25}" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="#22c55e" stroke-width="12" stroke-dasharray="${dS} ${circ}" stroke-dashoffset="${circ*.25-dA}" stroke-linecap="round"/>
    <text x="50" y="47" text-anchor="middle" font-size="15" font-weight="900" fill="var(--text)">${sisa}</text>
    <text x="50" y="60" text-anchor="middle" font-size="9" fill="var(--text-muted)">sisa</text>
  </svg>`
}

function getShiftLabel(j) {
  if (!j) return '-'
  if (j?.status_override==='cuti')  return '🌴 Cuti'
  if (j?.status_override==='sakit') return '🤒 Sakit'
  if (j?.status_override==='izin')  return '📋 Izin'
  if (j?.shift_code=='2') return '🌅 Pagi'
  if (j?.shift_code=='3') return '🌇 Sore'
  if (j?.shift_code=='4') return '🌙 Malam'
  if (j?.shift_code=='8') return '⚫ OFF'
  return '-'
}
