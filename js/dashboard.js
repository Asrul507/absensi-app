import { supabase } from './supabase.js'
import { getTodayLokal } from './timezone.js'
import { getServerTimeIso, startServerDigitalClock } from './server-time.js'
import { getSisaCuti } from './services/leave-service.js'
import { applyTenantFilter, isSuperAdmin } from './access-control.js'

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

  // Date range — hanya dipakai untuk grid menu, tidak lagi fetch chart data di sini

  // ===== MENU GRID NAVIGASI BERDASARKAN ROLE =====
  const buildGridMenuItems = (role) => {
    const isAdminRoleVal = ['super_admin', 'admin_all', 'admin_hr', 'admin'].includes(role)
    if (!isAdminRoleVal) {
      // Staff menu
      return [
        { nav: 'absensi',          icon: 'fa-clock',              label: 'Absensi Kerja',     color: '#2563eb', color2: '#60a5fa', cat: 'utama' },
        { nav: 'pengajuan',        icon: 'fa-file-alt',           label: 'Pengajuan',         color: '#7c3aed', color2: '#a78bfa', cat: 'utama' },
        { nav: 'perbaikan-absen',  icon: 'fa-pencil-alt',         label: 'Perbaikan Absen',   color: '#dc2626', color2: '#f87171', cat: 'utama' },
        { nav: 'kalender',         icon: 'fa-calendar-alt',       label: 'Kalender Kerja',    color: '#0891b2', color2: '#67e8f9', cat: 'utama' },
        { nav: 'daftar-absensi',   icon: 'fa-list-check',         label: 'Log Kehadiran',     color: '#059669', color2: '#6ee7b7', cat: 'laporan' },
        { nav: 'rekap-inout',      icon: 'fa-business-time',      label: 'Rekap In/Out',      color: '#d97706', color2: '#fcd34d', cat: 'laporan' },
        { nav: 'rekap-absensi',    icon: 'fa-chart-pie',          label: 'Statistik Absensi', color: '#7c3aed', color2: '#c4b5fd', cat: 'laporan' },
        { nav: 'rekap',            icon: 'fa-chart-bar',          label: 'Laporan Statistik', color: '#0284c7', color2: '#7dd3fc', cat: 'laporan' },
        { nav: 'slip-gaji',        icon: 'fa-file-invoice-dollar',label: 'Slip Gaji',         color: '#15803d', color2: '#4ade80', cat: 'laporan' },
      ]
    }
    // Admin menu
    const items = [
      { nav: 'absensi',            icon: 'fa-clock',              label: 'Menu Absen',        color: '#2563eb', color2: '#60a5fa', cat: 'absensi' },
      { nav: 'kalender',           icon: 'fa-calendar-days',      label: 'Kalender HRD',      color: '#0891b2', color2: '#67e8f9', cat: 'absensi' },
      { nav: 'pengajuan',          icon: 'fa-umbrella-beach',     label: 'Cuti & Pengajuan',  color: '#7c3aed', color2: '#a78bfa', cat: 'approval' },
      { nav: 'perbaikan-absen',    icon: 'fa-pencil-alt',         label: 'Perbaikan Absen',   color: '#dc2626', color2: '#f87171', cat: 'approval' },
      { nav: 'approval-absensi',   icon: 'fa-clipboard-check',    label: 'Approval Absensi',  color: '#b45309', color2: '#fbbf24', cat: 'approval' },
      { nav: 'jadwal',             icon: 'fa-calendar-week',      label: 'Atur Jadwal',       color: '#0369a1', color2: '#38bdf8', cat: 'approval' },
      { nav: 'shift',              icon: 'fa-business-time',      label: 'Kelola Shift',      color: '#4338ca', color2: '#818cf8', cat: 'approval' },
      { nav: 'users',              icon: 'fa-users',              label: 'Data Karyawan',     color: '#0f766e', color2: '#2dd4bf', cat: 'karyawan' },
      { nav: 'admin-lokasi',       icon: 'fa-map-location-dot',   label: 'Titik Radius GPS',  color: '#b91c1c', color2: '#f87171', cat: 'karyawan' },
      { nav: 'daftar-absensi',     icon: 'fa-list-check',         label: 'Log Kehadiran',     color: '#059669', color2: '#6ee7b7', cat: 'laporan' },
      { nav: 'rekap-inout',        icon: 'fa-clock',              label: 'Rekap In/Out',      color: '#d97706', color2: '#fcd34d', cat: 'laporan' },
      { nav: 'rekap-absensi',      icon: 'fa-chart-pie',          label: 'Statistik Absensi', color: '#7c3aed', color2: '#c4b5fd', cat: 'laporan' },
      { nav: 'rekap',              icon: 'fa-chart-bar',          label: 'Laporan Rekap',     color: '#0284c7', color2: '#7dd3fc', cat: 'laporan' },
      { nav: 'laporan-keseluruhan',icon: 'fa-file-lines',         label: 'Lap. Keseluruhan',  color: '#15803d', color2: '#4ade80', cat: 'laporan' },
      { nav: 'slip-gaji',          icon: 'fa-file-invoice-dollar',label: 'Slip Gaji',         color: '#1d4ed8', color2: '#93c5fd', cat: 'laporan' },
    ]
    if (['super_admin', 'admin_all', 'admin_hr'].includes(role)) {
      items.push(
        { nav: 'personalia',       icon: 'fa-id-card-clip',       label: 'HR Personalia',     color: '#7c3aed', color2: '#c4b5fd', cat: 'karyawan' },
        { nav: 'payroll-config',   icon: 'fa-cogs',               label: 'Payroll Config',    color: '#92400e', color2: '#fbbf24', cat: 'payroll' },
        { nav: 'payroll-mapping',  icon: 'fa-users-cog',          label: 'Input Payroll',     color: '#1e40af', color2: '#93c5fd', cat: 'payroll' },
        { nav: 'generate-payroll', icon: 'fa-calculator',         label: 'Generate Payroll',  color: '#166534', color2: '#86efac', cat: 'payroll' },
      )
    }
    if (role === 'super_admin') {
      items.push(
        { nav: 'settings-app',     icon: 'fa-building-user',      label: 'Office & Dept',     color: '#334155', color2: '#94a3b8', cat: 'settings' }
      )
    }
    return items
  }

  const gridMenuItems = buildGridMenuItems(user.role || 'staff')
  const menuHtml = `
    <div class="home-grid-menu">
      ${gridMenuItems.map(m => `
        <button class="home-grid-btn" onclick="window.navigate('${m.nav}')" style="--btn-color:${m.color};--btn-color2:${m.color2};">
          <span class="home-grid-icon"><i class="fa ${m.icon}"></i></span>
          <span class="home-grid-label">${m.label}</span>
        </button>
      `).join('')}
    </div>
  `

  // ===== DASHBOARD PERSONAL STAFF — data dihapus dari sini, pindah ke halaman Statistik Absensi =====

  content.innerHTML = `
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

    <div class="card fade-up" style="padding:16px;margin-bottom:20px;">
      <div style="font-size:.72rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;"><i class="fa fa-th" style="color:var(--primary);margin-right:6px;"></i>Menu Navigasi</div>
      ${menuHtml}
    </div>

    <style>
      .home-grid-btn:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.18) !important; }
      .home-grid-btn:active { transform: translateY(-1px); }
    </style>
  `

  startServerDigitalClock({ key: 'dashboard', timeElementId: 'dashboardLiveClock', dateElementId: 'dashboardLiveDate', serverIso: dashboardServerIso || new Date().toISOString() })
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



