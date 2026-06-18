/**
 * js/app.js
 * ============================================================
 * File utama aplikasi Genius HR.
 * * Sesuai file acuan awal + Pembaruan Tampilan Kategori Sidebar.
 * Semua fungsi manajemen karyawan, modal, upload foto, dan password 
 * dipertahankan 100% utuh tanpa ada yang terpotong.
 * ============================================================
 */

import { supabase } from './supabase.js'
import { getProfile } from './users.js'
import { login as doLogin, logout, updateUserPassword, createEmployeeAccount } from './auth.js'
import { renderDashboard } from './dashboard.js'
import { renderAbsensi } from './ui.js'
import { renderShiftManagement } from './shift.js'
import { renderJadwalManagement } from './jadwal.js'
import { renderRekap } from './rekap.js'
import { renderRekapInOut } from './rekap-inout.js'
import { renderDaftarAbsensi } from './daftar-absensi.js'
import { renderPerbaikanAbsen } from './perbaikan-absen.js?v=20260609-6'
import { renderPengajuan } from './pengajuan.js?v=20260609-6'
import { renderKalenderHR } from './kalender.js'
import { hitungMasaKerja, formatMasaKerja, getSisaCuti, hitungJatahCuti, resetCutiKaryawan, syncEligibleCutiTahunanForProfiles, buildKontrakPayload, canManageCutiTahunan, formatMasaKontrak, getSisaHariKontrak, getStatusKontrak, hitungKontrakBerakhir, prosesHangusCutiTahunan } from './services/leave-service.js'
import './chart-helpers.js'
import { renderPengaturanLokasi } from './admin_lokasi.js'
import { initTimezone, resetTimezoneCache, getTodayLokal, toTanggalJamLokal } from './timezone.js?v=20260609-6'
import { renderLaporanKeseluruhan } from './laporan-keseluruhan.js'
import { showToast, confirmAction } from './feedback.js'
import { logAuditEvent } from './audit-trail.js'
import { renderAttendanceApproval, canApproveAttendance } from './attendance-approval.js'
import { assertSameDepartment, canAccessAllDepartments, canManageUserByDepartment, getAccessibleProfiles, getUserDepartment, normalizeRole, isSuperAdmin, isAdminAll, isAdminHR, isAdmin, isStaff, applyTenantFilter } from './access-control.js'
import { renderSettingsApp } from './settings-app.js'

/* ================= GLOBAL VARIABLES ================= */
window.currentUser  = null
window.currentShift = null
window.supabase     = supabase
window.notifState   = { total: 0, pendingPengajuan: 0, pendingPerbaikan: 0, pendingApproval: 0 }
window.notifPoller  = null
window.notifChannel = null

/* ================= INITIALIZATION ================= */
window.addEventListener('DOMContentLoaded', async () => {
  // Apply theme permanen dari localStorage
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark')
    const icon = document.getElementById('themeIcon')
    if (icon) icon.className = 'fa fa-sun'
  }

  // Tunggu session siap (penting setelah callback redirect)
  await new Promise(resolve => setTimeout(resolve, 300))

  // Check status user login
  await checkUser()

  // Listener perubahan auth state Supabase
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && !window.currentUser) {
      await checkUser()
    }
    if (event === 'SIGNED_OUT') {
      window.currentUser = null
      stopNotificationPolling()
      showLoginPage()
    }
    if (event === 'USER_UPDATED' && session) {
      if (window.currentUser) {
        window.currentUser.email = session.user.email
      }
    }
  })
})

/* ================= CHECK USER LOGIN ================= */
async function checkUser() {
  const loginPage = document.getElementById('loginPage')
  const appPage   = document.getElementById('appPage')

  if (!loginPage || !appPage) return

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      showLoginPage()
      return
    }

    const profile = await getProfile(user.id)

    if (!profile) {
      await denyInactiveAccount('Profil akun tidak ditemukan. Hubungi HR/admin.')
      return
    }

    if (profile.status_akun !== 'Aktif') {
      await denyInactiveAccount(`Akun Anda berstatus ${profile.status_akun || 'Tidak Aktif'} dan belum dapat mengakses aplikasi. Hubungi HR/admin.`)
      return
    }

    // Set user ke scope global window
    window.currentUser = { ...profile, role: normalizeRole(profile.role) }
    showAppPage()
    // Inisialisasi timezone dari titik radius lokasi
    await initTimezone()

    const userNameEl = document.getElementById('userName')
    if (userNameEl) userNameEl.innerText = profile.nama_lengkap || user.email
    const clientNameEl = document.getElementById('activeClientName')
    if (clientNameEl) {
      const tenantContext = JSON.parse(sessionStorage.getItem('tenantContext') || '{}')
      clientNameEl.innerText = tenantContext.nama_client || profile.clients?.nama_client || profile.nama_client || (window.currentUser.role === 'super_admin' ? 'Global Admin' : 'Client')
    }

    // Sinkronisasi foto profil dari DB Supabase
    await syncAvatarFromDB(profile)

    // Render komponen navigasi sesuai hak akses
    renderMenu(window.currentUser.role)
    renderBottomNav(window.currentUser.role)
    await refreshNotificationBadge()
    startNotificationPolling()
    navigate('dashboard')

  } catch (err) {
    console.error('checkUser error:', err)
    showLoginPage()
  }
}

/* ================= SINKRONISASI AVATAR ================= */
async function syncAvatarFromDB(profile) {
  if (profile && profile.foto_url) {
    window.currentUser.foto_url = profile.foto_url
  }
  updateTopbarAvatar(window.currentUser)
}

function showLoginPage() {
  const loginPage = document.getElementById('loginPage')
  const appPage   = document.getElementById('appPage')
  if (loginPage) loginPage.style.display = 'flex'
  if (appPage)   appPage.style.display   = 'none'
}

async function denyInactiveAccount(message) {
  window.currentUser = null
  stopNotificationPolling()
  try {
    await supabase.auth.signOut()
  } catch (err) {
    console.warn('Gagal signOut akun tidak aktif:', err)
  }
  showLoginPage()
  const loginError = document.getElementById('loginError')
  if (loginError) {
    loginError.textContent = '⚠ ' + message
    loginError.style.display = 'block'
  } else {
    showToast(message, 'warning')
  }
}

function showAppPage() {
  const loginPage = document.getElementById('loginPage')
  const appPage   = document.getElementById('appPage')
  if (loginPage) loginPage.style.display = 'none'
  if (appPage)   appPage.style.display   = 'block'
}

function updateTopbarAvatar(profile) {
  const el = document.getElementById('topbarAvatar')
  if (!el) return
  if (profile && profile.foto_url) {
    el.style.backgroundImage = `url(${profile.foto_url})`
    el.style.backgroundSize  = 'cover'
    el.textContent = ''
  } else {
    el.style.backgroundImage = ''
    el.textContent = (profile?.nama_lengkap || '?')[0].toUpperCase()
  }
}

/* ================= AUTHENTICATION ACTIONS ================= */
window.login = async function () {
  const username = document.getElementById('username')?.value.trim() || document.getElementById('email')?.value.trim() || ''
  const password = document.getElementById('password').value
  const errEl    = document.getElementById('loginError')
  if (errEl) errEl.style.display = 'none'
  const clientCode = document.getElementById('clientCode')?.value.trim() || ''
  const ok = await doLogin(username, password, clientCode)
  if (ok) await checkUser()
}

window.logout = async function () {
  stopNotificationPolling()
  await logout()
}

/* ================= RENDER MENU SIDEBAR MODERN (FITUR KATEGORI) ================= */
function renderMenu(role) {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return

  let menuHtml = '';

  if (role === 'staff') {
    menuHtml = `
      <div class="sidebar-section-title">MENU UTAMA</div>
      <a href="#" id="menu-dashboard" onclick="navigate('dashboard'); closeSidebar(); return false;"><i class="fa fa-house"></i> Dashboard</a>
      <a href="#" id="menu-absensi" onclick="navigate('absensi'); closeSidebar(); return false;"><i class="fa fa-clock"></i> Absensi Kerja</a>
      <a href="#" id="menu-perbaikan-absen" onclick="navigate('perbaikan-absen'); closeSidebar(); return false;"><i class="fa fa-pencil-alt"></i> Perbaikan Absen</a>
      <a href="#" id="menu-pengajuan" onclick="navigate('pengajuan'); closeSidebar(); return false;"><i class="fa fa-file-alt"></i> Pengajuan Cuti/Sakit</a>
      <a href="#" id="menu-kalender" onclick="navigate('kalender'); closeSidebar(); return false;"><i class="fa fa-calendar-alt"></i> Kalender Kerja</a>

      <div class="sidebar-section-title">RIWAYAT & LAPORAN</div>
      <a href="#" id="menu-daftar-absensi" onclick="navigate('daftar-absensi'); closeSidebar(); return false;"><i class="fa fa-list-check"></i> Log Kehadiran</a>
      <a href="#" id="menu-rekap-inout" onclick="navigate('rekap-inout'); closeSidebar(); return false;"><i class="fa fa-business-time"></i> Rekap In/Out</a>
      <a href="#" id="menu-rekap" onclick="navigate('rekap'); closeSidebar(); return false;"><i class="fa fa-chart-bar"></i> Laporan Statistik</a>

      <div class="sidebar-section-title">PENGATURAN</div>
      <a href="#" id="menu-profile" onclick="navigate('profile'); closeSidebar(); return false;"><i class="fa fa-user"></i> Profil Saya</a>
    `;
  } else {
    menuHtml = `
      <div class="sidebar-section-title">DASHBOARD & ABSENSI</div>
      <a href="#" id="menu-dashboard" onclick="navigate('dashboard'); closeSidebar(); return false;"><i class="fa fa-house"></i> Dashboard Admin</a>
      <a href="#" id="menu-absensi" onclick="navigate('absensi'); closeSidebar(); return false;"><i class="fa fa-clock"></i> Menu Absen</a>
      <a href="#" id="menu-kalender" onclick="navigate('kalender'); closeSidebar(); return false;"><i class="fa fa-calendar-days"></i> Kalender HRD</a>

      <div class="sidebar-section-title">APPROVAL & MANAJEMEN</div>
      <a href="#" id="menu-pengajuan" onclick="navigate('pengajuan'); closeSidebar(); return false;"><i class="fa fa-umbrella-beach"></i> Cuti Tahunan & Pengajuan <span class="sidebar-badge-info">HR</span></a>
      <a href="#" id="menu-perbaikan-absen" onclick="navigate('perbaikan-absen'); closeSidebar(); return false;"><i class="fa fa-pencil-alt"></i> Perbaikan Absen <span class="sidebar-badge-info">Staff</span></a>
      <a href="#" id="menu-approval-absensi" onclick="navigate('approval-absensi'); closeSidebar(); return false;"><i class="fa fa-clipboard-check"></i> Approval Absensi <span class="sidebar-badge-info">OPEN</span></a>
      <a href="#" id="menu-jadwal" onclick="navigate('jadwal'); closeSidebar(); return false;"><i class="fa fa-calendar-week"></i> Atur Jadwal Kerja</a>
      <a href="#" id="menu-shift" onclick="navigate('shift'); closeSidebar(); return false;"><i class="fa fa-business-time"></i> Kelola Shift</a>

      <div class="sidebar-section-title">KARYAWAN & OPERASIONAL</div>
      <a href="#" id="menu-users" onclick="navigate('users'); closeSidebar(); return false;"><i class="fa fa-users"></i> Data Karyawan</a>
      <a href="#" id="menu-personalia" onclick="navigate('personalia'); closeSidebar(); return false;"><i class="fa fa-id-card-clip"></i> HR Personalia / Kontrak</a>
      <a href="#" id="menu-admin-lokasi" onclick="navigate('admin-lokasi'); closeSidebar(); return false;"><i class="fa fa-map-location-dot"></i> Titik Radius GPS</a>

      <div class="sidebar-section-title">LAPORAN REKAPITULASI</div>
      <a href="#" id="menu-daftar-absensi" onclick="navigate('daftar-absensi'); closeSidebar(); return false;"><i class="fa fa-list-check"></i> Log Kehadiran Ringkas</a>
      <a href="#" id="menu-rekap-inout" onclick="navigate('rekap-inout'); closeSidebar(); return false;"><i class="fa fa-clock"></i> Rekap Bulanan In/Out</a>
      <a href="#" id="menu-rekap" onclick="navigate('rekap'); closeSidebar(); return false;"><i class="fa fa-chart-bar"></i> Laporan Rekap Absensi</a>
      <a href="#" id="menu-laporan-keseluruhan" onclick="navigate('laporan-keseluruhan'); closeSidebar(); return false;"><i class="fa fa-file-lines"></i> Laporan Keseluruhan <span class="sidebar-badge-info">NEW</span></a>
      ${role === 'super_admin' ? `<div class="sidebar-section-title">SETTINGS APP</div><a href="#" id="menu-settings-app" onclick="navigate('settings-app'); closeSidebar(); return false;"><i class="fa fa-building-user"></i> Client & Department</a>` : ''}
    `;
  }

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sb-name">GENIUS HR</div>
      <div class="sb-role">${(role||'').replace('_',' ').toUpperCase()}</div>
    </div>
    <nav class="sidebar-nav">
      ${menuHtml}
    </nav>
    <div style="padding: 15px; border-top: 1px solid rgba(255,255,255,0.08);">
      <button onclick="logout()" class="btn-danger" style="width:100%; padding: 10px; font-size: 0.8rem; font-weight:700; border-radius:8px; cursor:pointer;">
        <i class="fa fa-sign-out-alt"></i> Keluar Aplikasi
      </button>
    </div>
  `;
}

/* ================= NOTIFICATION CENTER (RINGKAS) ================= */
async function refreshNotificationBadge() {
  const user = window.currentUser
  const badge = document.getElementById('notifBadge')
  if (!user || !badge) return

  let pendingPengajuan = 0
  let pendingPerbaikan = 0
  let pendingApproval = 0

  if (canApproveAttendance(user)) {
    const scopedProfiles = await getAccessibleProfiles(user, { activeOnly: false, select: 'id, nama_lengkap, departemen, role, status_akun' })
    const scopedIds = scopedProfiles.map(p => p.id).filter(Boolean)
    const scopeQuery = (query) => (!canAccessAllDepartments(user) ? (scopedIds.length ? query.in('user_id', scopedIds) : null) : query)
    const pendingQueries = [
      scopeQuery(supabase.from('pengajuan').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
      scopeQuery(supabase.from('perbaikan_absen').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
      scopeQuery(supabase.from('absensi').select('*', { count: 'exact', head: true }).eq('status_absensi', 'OPEN'))
    ]
    const [{ count: c1 }, { count: c2 }, { count: c3 }] = await Promise.all(pendingQueries.map(q => q || Promise.resolve({ count: 0 })))
    pendingPengajuan = c1 || 0
    pendingPerbaikan = c2 || 0
    pendingApproval = c3 || 0
  } else {
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      supabase.from('pengajuan').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending'),
      supabase.from('perbaikan_absen').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending')
    ])
    pendingPengajuan = c1 || 0
    pendingPerbaikan = c2 || 0
  }

  const total = pendingPengajuan + pendingPerbaikan + pendingApproval
  window.notifState = { total, pendingPengajuan, pendingPerbaikan, pendingApproval }

  badge.textContent = String(total)
  badge.style.display = total > 0 ? 'inline-block' : 'none'
}

function startNotificationPolling() {
  stopNotificationPolling()
  refreshNotificationBadge().catch(err => console.error('Notif first refresh error:', err))
  window.notifChannel = supabase.channel('notif-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pengajuan' }, () => refreshNotificationBadge())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'perbaikan_absen' }, () => refreshNotificationBadge())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'absensi' }, () => refreshNotificationBadge())
    .subscribe()
  window.notifPoller = setInterval(() => {
    refreshNotificationBadge().catch(err => console.error('Notif poll error:', err))
  }, 60000)
}

function stopNotificationPolling() {
  if (window.notifPoller) clearInterval(window.notifPoller)
  window.notifPoller = null
  if (window.notifChannel) {
    supabase.removeChannel(window.notifChannel)
    window.notifChannel = null
  }
  window.closeNotificationCenter?.()
}

async function loadNotificationItems() {
  const user = window.currentUser
  if (!user) return []

  if (canApproveAttendance(user)) {
    const scopedProfiles = await getAccessibleProfiles(user, { activeOnly: false, select: 'id, nama_lengkap, departemen, role, status_akun' })
    const scopedIds = scopedProfiles.map(p => p.id).filter(Boolean)
    const scopeQuery = (query) => (!canAccessAllDepartments(user) ? (scopedIds.length ? query.in('user_id', scopedIds) : null) : query)
    const [p1, p2, p3] = await Promise.all([
      scopeQuery(supabase.from('pengajuan').select('id,nama,jenis,status,created_at,user_id').eq('status','pending').order('created_at',{ascending:false}).limit(5)) || Promise.resolve({ data: [] }),
      scopeQuery(supabase.from('perbaikan_absen').select('id,nama,jenis,status,created_at,user_id').eq('status','pending').order('created_at',{ascending:false}).limit(5)) || Promise.resolve({ data: [] }),
      scopeQuery(supabase.from('absensi').select('id,nama,tanggal,status_absensi,created_at,user_id').eq('status_absensi','OPEN').order('tanggal',{ascending:false}).limit(5)) || Promise.resolve({ data: [] })
    ])
    const a=(p1.data||[]).map(i=>({type:'pengajuan',title:`${i.nama||'Karyawan'} mengajukan ${i.jenis||'-'}`,created_at:i.created_at,route:'pengajuan'}))
    const b=(p2.data||[]).map(i=>({type:'perbaikan',title:`${i.nama||'Karyawan'} request ${i.jenis||'-'}`,created_at:i.created_at,route:'perbaikan-absen'}))
    const c=(p3.data||[]).map(i=>({type:'approval',title:`Absensi menunggu approval: ${i.nama||'-'} (${i.tanggal||'-'})`,created_at:i.created_at || i.tanggal,route:'approval-absensi'}))
    return [...a,...b,...c].sort((x,y)=>new Date(y.created_at)-new Date(x.created_at)).slice(0,8)
  }

  const [p1, p2] = await Promise.all([
    supabase.from('pengajuan').select('id,jenis,status,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(5),
    supabase.from('perbaikan_absen').select('id,jenis,status,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(5)
  ])
  const a=(p1.data||[]).map(i=>({type:'pengajuan',title:`Pengajuan ${i.jenis||'-'} (${i.status||'-'})`,created_at:i.created_at,route:'pengajuan'}))
  const b=(p2.data||[]).map(i=>({type:'perbaikan',title:`Perbaikan absen ${i.jenis||'-'} (${i.status||'-'})`,created_at:i.created_at,route:'perbaikan-absen'}))
  return [...a,...b].sort((x,y)=>new Date(y.created_at)-new Date(x.created_at)).slice(0,8)
}

window.openNotificationCenter = async function () {
  const panel = document.getElementById('notifPanel')
  const body = document.getElementById('notifPanelBody')
  if (!panel || !body || !window.currentUser) return

  panel.style.display = panel.style.display === 'block' ? 'none' : 'block'
  if (panel.style.display !== 'block') return

  body.innerHTML = '<div style="padding:8px 0;">Memuat...</div>'
  const items = await loadNotificationItems()
  const n = window.notifState || { total: 0, pendingPengajuan: 0, pendingPerbaikan: 0 }

  if (!items.length) {
    body.innerHTML = '<div style="padding:10px 0;">Belum ada notifikasi.</div>'
    return
  }

  body.innerHTML = `
    <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px;">Pending: ${n.total} (Pengajuan: ${n.pendingPengajuan}, Perbaikan: ${n.pendingPerbaikan}, Approval Absensi: ${n.pendingApproval || 0})</div>
    ${items.map(it => `
      <button onclick="navigate('${it.route}'); closeNotificationCenter();" style="width:100%;text-align:left;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--gray-50,#f8fafc);margin-bottom:8px;cursor:pointer;">
        <div style="font-weight:700;color:var(--text);">${it.title}</div>
        <div style="font-size:.72rem;color:var(--text-muted);margin-top:4px;">${toTanggalJamLokal(it.created_at)}</div>
      </button>
    `).join('')}
  `
}

window.closeNotificationCenter = function () {
  const panel = document.getElementById('notifPanel')
  if (panel) panel.style.display = 'none'
}


document.addEventListener('click', (e) => {
  const panel = document.getElementById('notifPanel')
  const btn = document.getElementById('notifBtn')
  if (!panel || panel.style.display !== 'block') return
  if (panel.contains(e.target) || (btn && btn.contains(e.target))) return
  window.closeNotificationCenter?.()
})


/* ================= BOTTOM NAVIGATION (MOBILE DEVICE) ================= */
function renderBottomNav(role) {
  const nav = document.getElementById('bottomNav')
  if (!nav) return
  const items = role === 'staff'
    ? [
        { key:'dashboard', icon:'fa-house',    label:'Home' },
        { key:'absensi',   icon:'fa-clock',    label:'Absen' },
        { key:'profile',   icon:'fa-user',     label:'Profil' },
      ]
    : [
        { key:'dashboard', icon:'fa-house',    label:'Home' },
        { key:'absensi',   icon:'fa-clock',    label:'Absen' },
        { key:'approval-absensi', icon:'fa-clipboard-check', label:'Approval' },
        { key:'users',     icon:'fa-users',    label:'Karyawan' },
      ]

  nav.innerHTML = items.map(i => `
    <button class="bottom-nav-item" id="bnav-${i.key}" onclick="navigate('${i.key}')">
      <i class="fa ${i.icon}"></i><span>${i.label}</span>
    </button>`).join('')
}

const ADMIN_ROLES = ['super_admin', 'admin_all', 'admin_hr', 'admin']
const STAFF_PAGES = ['dashboard', 'absensi', 'perbaikan-absen', 'pengajuan', 'kalender', 'daftar-absensi', 'rekap-inout', 'rekap', 'profile']
const ADMIN_PAGES = ['dashboard', 'absensi', 'kalender', 'pengajuan', 'perbaikan-absen', 'approval-absensi', 'jadwal', 'shift', 'users', 'personalia', 'admin-lokasi', 'daftar-absensi', 'rekap-inout', 'rekap', 'laporan-keseluruhan', 'profile', 'settings-app']

function isAdminRole(role) {
  return ADMIN_ROLES.includes(normalizeRole(role))
}

function canAccessPage(user, page) {
  const role = user?.role || 'staff'
  return (isAdminRole(role) ? ADMIN_PAGES : STAFF_PAGES).includes(page)
}

/* ================= SINGLE PAGE APPLICATION NAVIGATION ================= */
window.navigate = async function (page) {
  if (!window.currentUser) { showToast('Sesi berakhir. Silakan login ulang.', 'warning'); showLoginPage(); return }
  if (!canAccessPage(window.currentUser, page)) {
    showToast('Anda tidak memiliki akses ke menu tersebut.', 'warning')
    page = 'dashboard'
  }

  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'))
  document.getElementById(`menu-${page}`)?.classList.add('active')
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'))
  document.getElementById(`bnav-${page}`)?.classList.add('active')

  switch (page) {
    case 'dashboard': renderDashboard(); break
    case 'absensi':   renderAbsensi(window.currentUser); break
    case 'daftar-absensi': renderDaftarAbsensi(window.currentUser); break
    case 'rekap-inout': renderRekapInOut(window.currentUser); break
    case 'perbaikan-absen': renderPerbaikanAbsen(window.currentUser); break
    case 'approval-absensi': renderAttendanceApproval(window.currentUser); break
    case 'shift':      renderShiftManagement(); break
    case 'jadwal':     renderJadwalManagement(); break
    case 'pengajuan': renderPengajuan(window.currentUser); break
    case 'personalia': await renderPersonalia(); break
    case 'rekap':      renderRekap(window.currentUser); break
    case 'kalender':  renderKalenderHR(); break
    case 'profile':   renderProfile(); break
    case 'users':     await renderUsers(); break
    case 'admin-lokasi': renderPengaturanLokasi(); break
    case 'laporan-keseluruhan': renderLaporanKeseluruhan(window.currentUser); break
    case 'settings-app': renderSettingsApp(window.currentUser); break
    default:
      document.getElementById('content').innerHTML = `<div class="card"><h2>${page}</h2></div>`
  }
}

/* ================= PROFILE RENDERING MANAGEMENT ================= */
function renderProfile() {
  const content = document.getElementById('content')
  const u = window.currentUser
  const masaKerja = hitungMasaKerja(u.tanggal_bergabung)

  const avatarHtml = u.foto_url
    ? `<img src="${u.foto_url}" alt="foto" style="width:76px;height:76px;border-radius:var(--r-xl); object-fit:cover;border:2px solid rgba(255,255,255,.28);box-shadow:0 6px 20px rgba(0,0,0,.25);" onclick="window.previewImageFullScreen('${u.foto_url}')">`
    : `<div class="profile-avatar">${(u.nama_lengkap||'?')[0].toUpperCase()}</div>`

  content.innerHTML = `
    <div style="max-width:520px;margin:0 auto;">
      <div class="profile-card fade-up">
        <div style="position:relative;display:inline-block;margin-bottom:14px;">
          ${avatarHtml}
          <label for="fotoUpload" title="Ganti foto"
            style="position:absolute;bottom:-4px;right:-4px;width:26px;height:26px; border-radius:50%;background:var(--primary);color:#fff;cursor:pointer; display:flex;align-items:center;justify-content:center;font-size:.7rem; box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff;">
            <i class="fa fa-camera"></i>
          </label>
          <input type="file" id="fotoUpload" accept="image/*" style="display:none;" onchange="uploadFotoProfil(this)">
        </div>
        <div id="uploadStatus" style="font-size:.75rem;color:rgba(255,255,255,.8);min-height:18px;"></div>
        <div class="profile-name">${u.nama_lengkap || '-'}</div>
        <div class="profile-role">${(u.role||'').replace('_',' ')}</div>
      </div>

      <div class="card fade-up-1">
        <div class="card-title"><i class="fa fa-id-card"></i> Informasi Pribadi</div>
        ${infoRow('Username', u.username || '-')}
        ${infoRow('Jabatan', u.jabatan || '-')}
        ${infoRow('Departemen', u.departemen || '-')}
        ${infoRow('No. HP', u.no_hp || '-')}
        ${infoRow('Plot Radius Absen', `<strong style="color:var(--primary); font-weight:800;">📍 ${u.titik_radius || 'Bebas Area (Bypass)'}</strong>`)}
        ${infoRow('Status', `<span class="badge ${u.status_akun==='Aktif'?'badge-green':'badge-yellow'}">${u.status_akun||'Aktif'}</span>`)}
      </div>

      <div class="card fade-up-2">
        <div class="card-title"><i class="fa fa-briefcase"></i> Info Kerja</div>
        ${infoRow('Bergabung', u.tanggal_bergabung || '-')}
        ${infoRow('Masa Kerja', formatMasaKerja(masaKerja))}
        ${infoRow('Jenis Kontrak', u.jenis_kontrak || '-')}
        ${infoRow('Periode Kontrak', `${u.kontrak_mulai || '-'} s/d ${u.kontrak_berakhir || '-'}`)}
        ${infoRow('Masa Kontrak', u.masa_kontrak || '-')}
        ${infoRow('Status Kontrak', `<span class="badge ${getStatusKontrak(u.kontrak_berakhir)==='berakhir'?'badge-red':getStatusKontrak(u.kontrak_berakhir)==='akan_berakhir'?'badge-yellow':'badge-green'}">${u.status_kontrak || getStatusKontrak(u.kontrak_berakhir)}</span>`)}
      </div>

      <div class="card fade-up-3">
        <div class="card-title"><i class="fa fa-user-edit"></i> Edit Keamanan</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;">
            <div style="padding:12px 14px;background:var(--gray-50,#f8fafc);border-bottom:1px solid var(--border);">
              <div style="font-size:.8rem;font-weight:700;"><i class="fa fa-lock" style="color:var(--primary);"></i> Ganti Password Akun</div>
            </div>
            <div style="padding:14px;display:flex;flex-direction:column;gap:10px;">
              <div>
                <label style="font-size:.78rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">Password Baru</label>
                <input type="password" id="profileNewPassword" placeholder="Minimal 6 karakter"
                  style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;background:var(--white);color:var(--text);box-sizing:border-box;">
              </div>
              <div>
                <label style="font-size:.78rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px;">Konfirmasi Ulang Password</label>
                <input type="password" id="profileConfirmPassword" placeholder="Ulangi password baru"
                  style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;background:var(--white);color:var(--text);box-sizing:border-box;">
              </div>
              <div id="passwordMsg" style="font-size:.75rem;min-height:18px;"></div>
              <button onclick="saveProfilePassword()" style="padding:10px 16px;background:var(--primary);color:#fff;border:none;border-radius:var(--r-md);font-size:.85rem;font-weight:700;cursor:pointer;">
                <i class="fa fa-save"></i> Simpan Perubahan Password
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function infoRow(label, value) {
  return `<div class="info-row"><div class="ir-label">${label}</div><div class="ir-val">${value}</div></div>`
}

window.saveProfilePassword = async function () {
  const newPass  = document.getElementById('profileNewPassword').value
  const confPass = document.getElementById('profileConfirmPassword').value
  const msgEl    = document.getElementById('passwordMsg')

  if (!newPass || newPass.length < 6) {
    msgEl.innerHTML = '<span style="color:var(--danger);">⚠ Password minimal 6 karakter.</span>'
    return
  }
  if (newPass !== confPass) {
    msgEl.innerHTML = '<span style="color:var(--danger);">⚠ Konfirmasi password tidak cocok.</span>'
    return
  }

  msgEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'
  const { error } = await supabase.auth.updateUser({ password: newPass })

  if (error) {
    msgEl.innerHTML = `<span style="color:var(--danger);">⚠ Gagal: ${error.message}</span>`
    return
  }

  msgEl.innerHTML = '<span style="color:var(--success);"><i class="fa fa-check"></i> Password berhasil diperbarui!</span>'
  document.getElementById('profileNewPassword').value  = ''
  document.getElementById('profileConfirmPassword').value = ''
}

window.uploadFotoProfil = async function (input) {
  const file   = input.files[0]
  const status = document.getElementById('uploadStatus')
  if (!file) return

  if (file.size > 2 * 1024 * 1024) {
    if (status) status.textContent = '⚠ Ukuran foto max 2MB'
    return
  }

  if (status) status.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mengupload...'
  const ext      = file.name.split('.').pop()
  const fileName = `avatar-${window.currentUser.id}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, { upsert: true })

  if (uploadErr) {
    if (status) status.textContent = '⚠ Upload gagal: ' + uploadErr.message
    return
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
  const foto_url = urlData.publicUrl + '?t=' + Date.now()

  const { error: dbErr } = await supabase
    .from('profiles')
    .update({ foto_url })
    .eq('id', window.currentUser.id)

  if (dbErr) {
    if (status) status.textContent = '⚠ Gagal simpan ke DB: ' + dbErr.message
    return
  }

  window.currentUser.foto_url = foto_url
  if (status) status.innerHTML = '<i class="fa fa-check"></i> Foto diperbarui!'
  updateTopbarAvatar(window.currentUser)
  renderProfile()
}

/* ================= KARYAWAN MANAGEMENT SECTION (ADMIN) ================= */
async function renderUsers() {
  const content    = document.getElementById('content')
  const viewerRole = window.currentUser.role
  const isAllDepartmentViewer = canAccessAllDepartments(window.currentUser)

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-users"></i> Manajemen Karyawan</h2>
      ${viewerRole !== 'staff' ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-secondary btn-sm" onclick="window.downloadTemplateKaryawan()" title="Download template Excel untuk upload massal">
            <i class="fa fa-file-excel" style="color:#16a34a;"></i> Template Excel
          </button>
          <button class="btn-success btn-sm" onclick="document.getElementById('inputUploadKaryawanExcel').click()" title="Upload daftar karyawan via Excel ke daftar tunggu">
            <i class="fa fa-upload"></i> Upload Excel
          </button>
          <input type="file" id="inputUploadKaryawanExcel" accept=".xlsx,.xls" style="display:none;" onchange="window.handleUploadKaryawanExcel(this)">
          <button class="btn-primary btn-sm" onclick="openFormTambah()">
            <i class="fa fa-plus"></i> Tambah Manual
          </button>
        </div>
      ` : ''}
    </div>

    ${viewerRole !== 'staff' ? `<div class="card fade-up" style="padding:12px 14px;margin-bottom:12px;color:var(--text-muted);font-size:.82rem;font-weight:700;"><i class="fa fa-building"></i> ${isAllDepartmentViewer ? 'Anda mengelola semua departemen.' : `Anda mengelola departemen: ${getUserDepartment(window.currentUser) || '-'}.`}</div>` : ''}

    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button id="tabAktif" class="btn-primary btn-sm" onclick="switchTab('aktif')">
        <i class="fa fa-users"></i> Karyawan Aktif
      </button>
      ${viewerRole !== 'staff' ? `
        <button id="tabPending" class="btn-secondary btn-sm" onclick="switchTab('pending')">
          <i class="fa fa-hourglass-half"></i> Menunggu Daftar
        </button>
      ` : ''}
    </div>

    <!-- Preview Upload Excel Karyawan -->
    <div id="previewUploadKaryawanWrap" style="display:none; margin-bottom:14px;"></div>

    <div class="card fade-up" style="padding:14px 18px;margin-bottom:12px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="search-box" style="flex:2;min-width:180px;margin:0;">
          <i class="fa fa-search"></i>
          <input id="searchUser" placeholder="Cari nama atau username..." oninput="filterUsers()">
        </div>
        <select id="filterStatusUser" onchange="filterUsers()"
          style="flex:1;min-width:120px;padding:10px 12px;border:1.5px solid var(--border); border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;background:var(--white);color:var(--text);">
          <option value="">Semua Status</option>
          <option value="Aktif">Aktif</option>
          <option value="Non-Aktif">Non-Aktif</option>
          <option value="Menunggu Verifikasi">Menunggu Verifikasi</option>
        </select>
      </div>
    </div>

    <div id="userListContainer" class="fade-up-1">
      <div class="card" style="text-align:center;padding:28px;">
        <i class="fa fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i>
      </div>
    </div>
  `

  const users = viewerRole === 'staff'
    ? await getAccessibleProfiles(window.currentUser, { activeOnly: false, select: '*' })
    : await getAccessibleProfiles(window.currentUser, { activeOnly: false, select: '*' })
  let pendingQuery = applyTenantFilter(supabase.from('pending_profiles').select('*').eq('status','waiting').order('nama_lengkap'), { user: window.currentUser, userColumn: null, legacyDepartmentColumn: 'departemen' })
  const { data: pending } = viewerRole !== 'staff' ? await pendingQuery : { data: [] }

  let cutiTahunanRows = []
  try {
    cutiTahunanRows = await syncEligibleCutiTahunanForProfiles(users || [])
  } catch (err) {
    console.error('Gagal memuat cuti tahunan karyawan:', err)
  }
  window._cutiTahunanMap = {}
  ;(cutiTahunanRows || []).forEach(c => { window._cutiTahunanMap[c.user_id] = c })

  window._allUsers    = users    || []
  window._pendingList = pending  || []
  window._currentTab  = 'aktif'

  renderUserList(window._allUsers)

  window.switchTab = function(tab) {
    window._currentTab = tab
    document.getElementById('tabAktif').className   = tab==='aktif'   ? 'btn-primary btn-sm'   : 'btn-secondary btn-sm'
    const tabPending = document.getElementById('tabPending')
    if (tabPending) tabPending.className = tab==='pending' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
    if (tab === 'aktif') renderUserList(window._allUsers)
    else renderPendingList(window._pendingList)
  }

  window.filterUsers = function() {
    const q  = document.getElementById('searchUser').value.toLowerCase()
    const st = document.getElementById('filterStatusUser').value
    if (window._currentTab === 'aktif') {
      renderUserList(window._allUsers.filter(u =>
        ((u.nama_lengkap||'').toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q)) &&
        (!st || u.status_akun === st)
      ))
    } else {
      renderPendingList(window._pendingList.filter(p =>
        (p.nama_lengkap||'').toLowerCase().includes(q)
      ))
    }
  }
}


function getKontrakFormHtml(prefix, data = {}, disabled = false) {
  const disabledAttr = disabled ? 'disabled' : ''
  const jenis = data.jenis_kontrak || 'kontrak'
  const mulai = data.kontrak_mulai || data.tanggal_bergabung || getTodayLokal()
  const durasi = data.durasi_kontrak || 12
  const satuan = data.satuan_durasi_kontrak || 'bulan'
  const berakhir = data.kontrak_berakhir || hitungKontrakBerakhir(mulai, durasi, satuan) || ''
  const masa = data.masa_kontrak || formatMasaKontrak(durasi, satuan)
  return `
    <div class="field full" style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:10px;margin-top:4px;">
      <label style="color:var(--primary);font-weight:900;"><i class="fa fa-file-contract"></i> Data Kontrak Aktif</label>
    </div>
    <div class="field">
      <label>Jenis Kontrak <span class="req">*</span></label>
      <select id="${prefix}JenisKontrak" onchange="updateKontrakPreview('${prefix}')" ${disabledAttr}>
        ${['kontrak','tetap','probation','freelance','harian'].map(v => `<option value="${v}" ${jenis === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Mulai Kontrak <span class="req">*</span></label><input type="date" id="${prefix}KontrakMulai" value="${mulai}" onchange="updateKontrakPreview('${prefix}')" ${disabledAttr}></div>
    <div class="field"><label>Durasi <span class="req">*</span></label><input type="number" min="1" id="${prefix}DurasiKontrak" value="${durasi}" oninput="updateKontrakPreview('${prefix}')" ${disabledAttr}></div>
    <div class="field">
      <label>Satuan Durasi <span class="req">*</span></label>
      <select id="${prefix}SatuanDurasiKontrak" onchange="updateKontrakPreview('${prefix}')" ${disabledAttr}>
        <option value="bulan" ${satuan !== 'tahun' ? 'selected' : ''}>bulan</option>
        <option value="tahun" ${satuan === 'tahun' ? 'selected' : ''}>tahun</option>
      </select>
    </div>
    <div class="field"><label>Kontrak Berakhir</label><input type="date" id="${prefix}KontrakBerakhir" value="${berakhir}" disabled style="background:var(--gray-100);"></div>
    <div class="field"><label>Masa Kontrak</label><input id="${prefix}MasaKontrak" value="${masa}" disabled style="background:var(--gray-100);"></div>
  `
}

function readKontrakForm(prefix) {
  return buildKontrakPayload({
    jenisKontrak: document.getElementById(`${prefix}JenisKontrak`)?.value || 'kontrak',
    kontrakMulai: document.getElementById(`${prefix}KontrakMulai`)?.value || null,
    durasiKontrak: document.getElementById(`${prefix}DurasiKontrak`)?.value || null,
    satuanDurasiKontrak: document.getElementById(`${prefix}SatuanDurasiKontrak`)?.value || 'bulan'
  })
}

window.updateKontrakPreview = function(prefix) {
  const payload = readKontrakForm(prefix)
  const akhir = document.getElementById(`${prefix}KontrakBerakhir`)
  const masa = document.getElementById(`${prefix}MasaKontrak`)
  if (akhir) akhir.value = payload.kontrak_berakhir || ''
  if (masa) masa.value = payload.masa_kontrak || ''
}

function validateKontrakPayload(payload) {
  if (!payload.jenis_kontrak || !payload.kontrak_mulai || !payload.durasi_kontrak || !payload.kontrak_berakhir) {
    showToast('Data kontrak wajib lengkap: jenis, tanggal mulai, durasi, dan satuan durasi.', 'warning')
    return false
  }
  return true
}



async function closeActiveCutiRowsForUser(userId) {
  const { data: activeRows } = await supabase
    .from('cuti_tahunan')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'AKTIF')
  for (const row of (activeRows || [])) {
    await prosesHangusCutiTahunan(row.id, window.currentUser)
  }
}

function kontrakBerubah(before, after) {
  if (!before) return false
  return (before.kontrak_mulai || null) !== (after.kontrak_mulai || null) ||
    (before.kontrak_berakhir || null) !== (after.kontrak_berakhir || null) ||
    (before.jenis_kontrak || null) !== (after.jenis_kontrak || null)
}

async function renderPersonalia() {
  const content = document.getElementById('content')
  if (!canManageCutiTahunan(window.currentUser)) {
    content.innerHTML = `<div class="card"><p class="text-danger">Akses HR Personalia hanya untuk admin/HR.</p></div>`
    return
  }

  const { data: users, error } = await applyTenantFilter(supabase.from('profiles').select('*').order('nama_lengkap'), { user: window.currentUser, userColumn: 'id', legacyDepartmentColumn: 'departemen' })
  if (error) {
    content.innerHTML = `<div class="card"><p class="text-danger">Gagal memuat data kontrak: ${error.message}</p></div>`
    return
  }

  let cutiRows = []
  try {
    cutiRows = await syncEligibleCutiTahunanForProfiles(users || [])
  } catch (err) {
    console.error('Gagal sinkron cuti tahunan personalia:', err)
  }
  const cutiMap = {}
  ;(cutiRows || []).forEach(row => { cutiMap[row.user_id] = row })

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-id-card-clip"></i> HR Personalia / Kontrak Karyawan</h2>
    </div>
    <div class="card fade-up" style="padding:14px;margin-bottom:14px;">
      <div style="font-size:.82rem;color:var(--text-muted);">Kelola kontrak aktif karyawan. Perpanjang kontrak akan membuat periode cuti baru yang tetap menunggu approval HR/admin.</div>
    </div>
    <div class="card fade-up" style="overflow:auto;padding:0;">
      <table style="width:100%;border-collapse:collapse;font-size:.8rem;min-width:980px;">
        <thead>
          <tr style="background:var(--gray-50);color:var(--text-muted);text-transform:uppercase;font-size:.7rem;">
            <th style="padding:10px;text-align:left;">Karyawan</th>
            <th style="padding:10px;text-align:left;">Jenis</th>
            <th style="padding:10px;text-align:left;">Mulai</th>
            <th style="padding:10px;text-align:left;">Berakhir</th>
            <th style="padding:10px;text-align:left;">Sisa Hari</th>
            <th style="padding:10px;text-align:left;">Status Kontrak</th>
            <th style="padding:10px;text-align:left;">Status Cuti</th>
            <th style="padding:10px;text-align:left;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${(users || []).map(u => {
            const sisaHari = getSisaHariKontrak(u.kontrak_berakhir)
            const statusKontrak = getStatusKontrak(u.kontrak_berakhir)
            const cuti = cutiMap[u.id]
            return `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:10px;"><strong>${u.nama_lengkap || '-'}</strong><div style="color:var(--text-muted);font-size:.72rem;">${u.jabatan || '-'} · ${u.departemen || '-'}</div></td>
                <td style="padding:10px;">${u.jenis_kontrak || '-'}</td>
                <td style="padding:10px;">${u.kontrak_mulai || '-'}</td>
                <td style="padding:10px;">${u.kontrak_berakhir || '-'}</td>
                <td style="padding:10px;">${sisaHari === null ? '-' : sisaHari < 0 ? 'Lewat' : `${sisaHari} hari`}</td>
                <td style="padding:10px;"><span class="badge ${statusKontrak === 'berakhir' ? 'badge-red' : statusKontrak === 'akan_berakhir' ? 'badge-yellow' : 'badge-green'}">${statusKontrak}</span></td>
                <td style="padding:10px;"><span class="badge ${cuti?.status === 'AKTIF' ? 'badge-green' : cuti?.status === 'ELIGIBLE_MENUNGGU_APPROVAL_HR' ? 'badge-yellow' : 'badge-gray'}">${cuti?.status || 'BELUM_ELIGIBLE'}</span></td>
                <td style="padding:10px;display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="btn-secondary btn-sm" onclick="openKontrakKaryawan('${u.id}', false)"><i class="fa fa-edit"></i> Edit Kontrak</button>
                  <button class="btn-primary btn-sm" onclick="openKontrakKaryawan('${u.id}', true)"><i class="fa fa-forward"></i> Perpanjang</button>
                </td>
              </tr>
            `
          }).join('') || `<tr><td colspan="8" style="padding:18px;text-align:center;color:var(--text-muted);">Belum ada karyawan.</td></tr>`}
        </tbody>
      </table>
    </div>
  `
  window._personaliaUsers = users || []
}

window.openKontrakKaryawan = function(id, isExtend = false) {
  const target = (window._personaliaUsers || window._allUsers || []).find(u => u.id === id)
  if (!target) return
  const data = isExtend ? { ...target, kontrak_mulai: getTodayLokal(), durasi_kontrak: target.durasi_kontrak || 12, satuan_durasi_kontrak: target.satuan_durasi_kontrak || 'bulan', kontrak_berakhir: '', masa_kontrak: '' } : target
  window.showUserModal(`
    <div class="modal-header">
      <h3><i class="fa fa-file-contract" style="color:var(--primary);"></i> ${isExtend ? 'Perpanjang' : 'Edit'} Kontrak: ${target.nama_lengkap}</h3>
      <button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:10px;">
      ${getKontrakFormHtml('kontrak', data, false)}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="window.closeUserModal()">Batal</button>
      <button class="btn-primary" onclick="saveKontrakKaryawan('${target.id}', ${isExtend})"><i class="fa fa-save"></i> Simpan Kontrak</button>
    </div>
  `)
  window.updateKontrakPreview('kontrak')
}

window.saveKontrakKaryawan = async function(id, isExtend = false) {
  const payload = readKontrakForm('kontrak')
  if (!validateKontrakPayload(payload)) return
  try {
    const before = (window._personaliaUsers || window._allUsers || []).find(u => u.id === id) || null
    if (isExtend || kontrakBerubah(before, payload)) {
      await closeActiveCutiRowsForUser(id)
    }

    const { error } = await applyTenantFilter(supabase.from('profiles').update(payload).eq('id', id), { user: window.currentUser, userColumn: 'id', legacyDepartmentColumn: 'departemen' })
    if (error) throw error

    await logAuditEvent({
      action: isExtend ? 'extend_contract' : 'update_contract',
      entityType: 'profiles',
      entityId: id,
      before,
      after: { ...(before || {}), ...payload }
    })

    window.closeUserModal()
    showToast(isExtend ? 'Kontrak diperpanjang. Periode cuti baru menunggu approval HR.' : 'Kontrak karyawan diperbarui.', 'success')
    await renderPersonalia()
  } catch (err) {
    console.error('saveKontrakKaryawan error:', err)
    showToast('Gagal menyimpan kontrak: ' + err.message, 'error')
  }
}


async function fetchClientOptionsForEmployeeForm() {
  if (window.currentUser?.role === 'super_admin') {
    const { data, error } = await supabase.from('clients').select('id,nama_client,kode_client,status').order('nama_client')
    if (error) throw error
    return data || []
  }
  return window.currentUser?.client_id ? [{ id: window.currentUser.client_id, nama_client: window.currentUser.clients?.nama_client || window.currentUser.nama_client || 'Client Anda', kode_client: '' }] : []
}

async function fetchDepartmentOptionsForClient(clientId) {
  if (!clientId) return []
  const { data, error } = await supabase
    .from('departments')
    .select('id,nama_department,status')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('nama_department')
  if (error) throw error
  return data || []
}

function renderDepartmentOptions(departments = [], selectedId = '') {
  return `<option value="">-- Pilih Department --</option>${departments.map(d => `<option value="${d.id}" ${String(d.id) === String(selectedId) ? 'selected' : ''}>${d.nama_department}</option>`).join('')}`
}

/* ================= OPEN FORM TAMBAH KARYAWAN ================= */
window.openFormTambah = async function() {
  const role = normalizeRole(window.currentUser?.role)
  if (role === 'admin' || role === 'staff') {
    showToast('Hanya Super Admin, Admin All, dan Admin HR yang dapat menambah karyawan.', 'warning')
    return
  }

  let opsiLokasi = ''
  let clients = []
  let departments = []
  try {
    const [lokasiResult, clientOptions] = await Promise.all([
      supabase.from('lokasi_absen').select('*'),
      fetchClientOptionsForEmployeeForm()
    ])
    if (!lokasiResult.error && lokasiResult.data) {
      opsiLokasi = lokasiResult.data.map(l => {
        const namaTitik = l.nama_titik || l.nama_lokasi || l.nama || ''
        return `<option value="${namaTitik}">${namaTitik}</option>`
      }).join('')
    }
    clients = clientOptions
    const initialClientId = role === 'super_admin' ? (clients[0]?.id || '') : window.currentUser?.client_id
    departments = await fetchDepartmentOptionsForClient(initialClientId)
  } catch (e) {
    console.error('Gagal menyiapkan form tambah karyawan:', e)
    showToast('Gagal memuat data client/department/lokasi.', 'error')
    return
  }

  const initialClientId = role === 'super_admin' ? (clients[0]?.id || '') : window.currentUser?.client_id
  const currentViewerRole = window.currentUser?.role || 'admin_hr'
  const clientField = role === 'super_admin'
    ? `<select id="pClient" onchange="window.reloadEmployeeDepartments(this.value)">${clients.map(c => `<option value="${c.id}" ${c.id === initialClientId ? 'selected' : ''}>${c.nama_client} (${c.kode_client || '-'})</option>`).join('')}</select>`
    : `<input id="pClientName" value="${clients[0]?.nama_client || window.currentUser?.clients?.nama_client || 'Client Anda'}" disabled><input type="hidden" id="pClient" value="${initialClientId || ''}">`

  window.showUserModal(`
    <div class="modal-header">
      <h3><i class="fa fa-user-plus" style="color:var(--primary);"></i> Tambah Karyawan</h3>
      <button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:10px;">
      <div class="field full" style="grid-column:1/-1;">
        <label>Nama Lengkap <span class="req">*</span></label>
        <input id="pNama" placeholder="Nama lengkap karyawan">
      </div>
      <div class="field"><label>Username Login</label><input type="text" id="pUsername" placeholder="staff01" autocapitalize="none"><label>Password Awal</label><input type="password" id="pPasswordAwal" placeholder="Password awal"></div>
      <div class="field"><label>Nama Kantor / Client <span class="req">*</span></label>${clientField}</div>
      <div class="field"><label>Department <span class="req">*</span></label><select id="pDepartment">${renderDepartmentOptions(departments)}</select></div>
      <div class="field"><label>Status Akun</label>
        <select id="pStatusAkun">
          <option value="Aktif">Aktif</option>
          <option value="Menunggu Verifikasi">Menunggu Verifikasi</option>
          <option value="Non-Aktif">Non-Aktif</option>
        </select>
      </div>
      <div class="field"><label>Jabatan</label><input id="pJabatan" placeholder="Jabatan"></div>
      <div class="field"><label>No. HP</label><input id="pHp" placeholder="08xx"></div>
      <div class="field"><label>Tanggal Bergabung</label><input type="date" id="pTgl" value="${getTodayLokal()}"></div>
      <div class="field"><label>Sisa Cuti Awal</label><input type="number" id="pSisaCuti" min="0" value="0"></div>
      <div class="field"><label>Tanggal Lahir</label><input type="date" id="pLahir"></div>
      <div class="field"><label>URL Foto (opsional)</label><input id="pFotoUrl" placeholder="https://..."></div>
      <div class="field"><label>Role Hak Akses</label>
        <select id="pRole">
          <option value="staff">Staff Karyawan</option>
          ${currentViewerRole === 'super_admin' ? `<option value="admin">Admin Department</option><option value="admin_hr">Admin HR</option><option value="admin_all">Admin All</option><option value="super_admin">Super Admin</option>` : ''}
        </select>
      </div>
      <div class="field">
        <label>Titik Area GPS</label>
        <select id="pTitikRadius" style="width:100%; padding:10px; border-radius:var(--r-md); border:1.5px solid var(--border); font-size:.85rem; font-weight:700; background:#fff; color:#000;">
          <option value="">-- Bebas Area (Bypass Radius) --</option>
          ${opsiLokasi}
        </select>
      </div>
      ${getKontrakFormHtml('p', { tanggal_bergabung: getTodayLokal() })}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="window.closeUserModal()">Batal</button>
      <button class="btn-primary" onclick="savePendingKaryawan()"><i class="fa fa-user-plus"></i> Buat Akun</button>
    </div>
  `)
}

window.reloadEmployeeDepartments = async function(clientId) {
  const select = document.getElementById('pDepartment')
  if (!select) return
  select.innerHTML = '<option value="">Memuat department...</option>'
  try {
    select.innerHTML = renderDepartmentOptions(await fetchDepartmentOptionsForClient(clientId))
  } catch (err) {
    console.error('Gagal memuat department:', err)
    select.innerHTML = '<option value="">Gagal memuat department</option>'
  }
}

window.savePendingKaryawan = async function() {
  const nama = document.getElementById('pNama').value.trim()
  const username = document.getElementById('pUsername')?.value.trim().toLowerCase() || ''
  const passwordAwal = document.getElementById('pPasswordAwal')?.value || ''
  if (!nama) { showToast('Nama wajib diisi', 'warning'); return }
  if (!username) { showToast('Username login wajib diisi', 'warning'); return }
  if (passwordAwal.length < 8) { showToast('Password awal minimal 8 karakter', 'warning'); return }
  const kontrakPayload = readKontrakForm('p')
  if (!validateKontrakPayload(kontrakPayload)) return

  const role = normalizeRole(window.currentUser?.role)
  if (!['super_admin', 'admin_hr'].includes(role)) { showToast('Hanya Super Admin dan Admin HR yang dapat membuat akun.', 'warning'); return }
  const selectedClientId = role === 'super_admin' ? document.getElementById('pClient')?.value : window.currentUser?.client_id
  const selectedDepartmentId = document.getElementById('pDepartment')?.value || null
  if (!selectedClientId) { showToast('Client wajib dipilih.', 'warning'); return }
  if (!selectedDepartmentId) { showToast('Department wajib dipilih.', 'warning'); return }
  const departments = await fetchDepartmentOptionsForClient(selectedClientId)
  const selectedDepartment = departments.find(d => String(d.id) === String(selectedDepartmentId))
  if (!selectedDepartment) { showToast('Department tidak valid untuk client yang dipilih.', 'warning'); return }

  try {
    await createEmployeeAccount({
      nama_lengkap: nama,
      username,
      password_awal: passwordAwal,
      client_id: selectedClientId,
      department_id: selectedDepartmentId,
      departemen: selectedDepartment.nama_department,
      jabatan: document.getElementById('pJabatan').value.trim(),
      no_hp: document.getElementById('pHp').value.trim(),
      tanggal_bergabung: document.getElementById('pTgl').value || null,
      tanggal_lahir: document.getElementById('pLahir').value || null,
      role: document.getElementById('pRole').value,
      sisa_cuti: Math.max(0, Number.parseInt(document.getElementById('pSisaCuti')?.value || '0', 10) || 0),
      foto_url: document.getElementById('pFotoUrl')?.value.trim() || '',
      titik_radius: document.getElementById('pTitikRadius').value || null,
      ...kontrakPayload
    })
    window.closeUserModal()
    showToast(`${nama} berhasil dibuat tanpa email verification`, 'success')
    await renderUsers()
  } catch (error) {
    showToast(error.message || 'Gagal membuat akun karyawan', 'error')
  }
}


/* ================= POPUP MODAL: DETAIL KARYAWAN ================= */
window.openDetailKaryawan = function(id) {
  const target = window._allUsers.find(u => u.id === id)
  if (!target) return

  window.showUserModal(`
    <div class="modal-header">
      <h3><i class="fa fa-id-card" style="color:var(--primary);"></i> Kartu Detail Karyawan</h3>
      <button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
    </div>
    <div style="padding: 10px 0; text-align:center; border-bottom: 1px solid var(--border); margin-bottom: 14px;">
       ${target.foto_url
         ? `<img src="${target.foto_url}" style="width:70px; height:70px; border-radius:50%; object-fit:cover;" onclick="window.previewImageFullScreen('${target.foto_url}')">`
         : `<div class="profile-avatar" style="margin:0 auto 10px;">${target.nama_lengkap[0].toUpperCase()}</div>`
       }
       <h4 style="margin:6px 0 2px; font-size:1.1rem;">${target.nama_lengkap}</h4>
       <span class="badge badge-gray">${target.role.toUpperCase()}</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px; font-size: .85rem;">
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Email login:</span><strong>${target.email || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Jabatan:</span><strong>${target.jabatan || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Departemen:</span><strong>${target.departemen || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">No. HP:</span><strong>${target.no_hp || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Tanggal Bergabung:</span><strong>${target.tanggal_bergabung || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Masa Kerja:</span><strong>${formatMasaKerja(hitungMasaKerja(target.tanggal_bergabung))}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Tanggal Lahir:</span><strong>${target.tanggal_lahir || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Plot Titik Absen:</span><strong style="color:var(--primary);">📍 ${target.titik_radius || 'Bebas Radius'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Status Akun:</span><strong>${target.status_akun || 'Aktif'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Jenis Kontrak:</span><strong>${target.jenis_kontrak || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Periode Kontrak:</span><strong>${target.kontrak_mulai || '-'} s/d ${target.kontrak_berakhir || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Masa / Status Kontrak:</span><strong>${target.masa_kontrak || '-'} · ${target.status_kontrak || getStatusKontrak(target.kontrak_berakhir)}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Status Cuti Tahunan:</span><strong>${window._cutiTahunanMap?.[target.id]?.status || 'BELUM_ELIGIBLE'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Sisa Cuti Tahunan:</span><strong>🌴 ${window._cutiTahunanMap?.[target.id]?.sisa_cuti || target.sisa_cuti || 0} Hari</strong></div>
    </div>
    <div class="modal-actions" style="margin-top:20px;">
      <button class="btn-secondary" style="width:100%;" onclick="window.closeUserModal()">Tutup Detail</button>
    </div>
  `)
}

/* ================= POPUP MODAL: EDIT KARYAWAN ================= */
window.openEditKaryawan = async function(id) {
  const target = window._allUsers.find(u => u.id === id)
  if (!target) return

  const me = window.currentUser
  try { assertSameDepartment(me, target) } catch (err) { showToast(err.message, 'error'); return }
  const isMe = me.id === target.id
  const canEditAllFields = (me.role === 'super_admin') || (['admin','admin_hr'].includes(normalizeRole(me.role)) && target.role === 'staff' && canManageUserByDepartment(me, target))

  let opsiLokasi = ''
  try {
    const { data: lokasiList, error: lokasiErr } = await supabase
      .from('lokasi_absen')
      .select('nama_titik')
      .order('nama_titik')

    if (lokasiErr) throw lokasiErr

    opsiLokasi = (lokasiList || []).map(l => {
      const namaTitik  = (l.nama_titik || '').trim()
      const isSelected = namaTitik.toLowerCase() === (target.titik_radius || '').trim().toLowerCase() ? 'selected' : ''
      return `<option value="${namaTitik}" ${isSelected}>${namaTitik}</option>`
    }).join('')
  } catch (e) {
    console.error('Gagal memuat list lokasi untuk form edit:', e)
  }

  window.showUserModal(`
    <div class="modal-header">
      <h3><i class="fa fa-user-pen" style="color:var(--warning);"></i> Edit Data: ${target.nama_lengkap}</h3>
      <button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
    </div>

    <div style="text-align:center;padding:14px 0 10px;border-bottom:1px solid var(--border);margin-bottom:14px;">
      <div style="position:relative;display:inline-block;">
        ${target.foto_url
          ? `<img src="${target.foto_url}" id="editAvatarPreview" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);" onclick="window.previewImageFullScreen('${target.foto_url}')">`
          : `<div class="profile-avatar" id="editAvatarPreview" style="width:64px;height:64px;font-size:1.4rem;display:flex;align-items:center;justify-content:center;">${target.nama_lengkap[0].toUpperCase()}</div>`
        }
        ${isMe || canEditAllFields ? `
          <label for="editFotoInput" title="Ganti foto" style="position:absolute;bottom:-2px;right:-2px;width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.6rem;box-shadow:0 2px 6px rgba(0,0,0,.25);border:2px solid #fff;">
            <i class="fa fa-camera"></i>
          </label>
          <input type="file" id="editFotoInput" accept="image/*" style="display:none;" onchange="uploadFotoEditModal(this,'${target.id}')">
        ` : ''}
      </div>
      <div id="editFotoStatus" style="font-size:.72rem;color:var(--text-muted);margin-top:6px;min-height:16px;"></div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; padding-top:4px;">
      <div class="field full" style="grid-column:1/-1;">
        <label>Nama Lengkap</label>
        <input id="editNama" value="${target.nama_lengkap}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Email Login</label>
        <input type="email" id="editEmail" value="${target.email || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Jabatan</label>
        <input id="editJabatan" value="${target.jabatan || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Departemen</label>
        <input id="editDept" value="${target.departemen || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>No. HP</label>
        <input id="editHp" value="${target.no_hp || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Tanggal Lahir</label>
        <input type="date" id="editLahir" value="${target.tanggal_lahir || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Tanggal Bergabung</label>
        <input type="date" id="editTgl" value="${target.tanggal_bergabung || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Status Akun</label>
        <select id="editStatusAkun" ${canEditAllFields ? '' : 'disabled'}>
          <option value="Aktif"${(target.status_akun || 'Aktif') === 'Aktif' ? ' selected' : ''}>Aktif</option>
          <option value="Menunggu Verifikasi"${target.status_akun === 'Menunggu Verifikasi' ? ' selected' : ''}>Menunggu Verifikasi</option>
          <option value="Non-Aktif"${target.status_akun === 'Non-Aktif' ? ' selected' : ''}>Non-Aktif</option>
        </select>
      </div>
      <div class="field">
        <label>Sisa Cuti</label>
        <input type="number" id="editSisaCuti" min="0" value="${target.sisa_cuti || 0}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field full" style="grid-column:1/-1;">
        <label>URL Foto</label>
        <input id="editFotoUrl" value="${target.foto_url || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>

      <div class="field">
        <label>Atur Titik Lokasi GPS</label>
        <select id="editTitikRadius" ${canEditAllFields ? '' : 'disabled'}
          style="width:100%; padding:10px; border-radius:var(--r-md); border:1.5px solid var(--border); font-size:.85rem; font-weight:700; background:#fff; color:#000;">
          <option value=""${!(target.titik_radius) ? ' selected' : ''}>-- Bebas Area (Bypass Radius) --</option>
          ${opsiLokasi}
        </select>
      </div>

      ${getKontrakFormHtml('edit', target, !canEditAllFields)}

      <div class="field full" style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:10px; margin-top:5px;">
        <label style="color:var(--primary); font-weight:800;"><i class="fa fa-key"></i> ${isMe ? 'Ganti Password Anda' : 'Reset Password Karyawan'}</label>
        <input type="password" id="editPassword" placeholder="Masukkan password baru jika ingin diubah">
        <small style="font-size:.65rem; color:var(--text-muted);">Biarkan kosong jika tidak ingin mengganti password.</small>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="window.closeUserModal()">Batal</button>
      <button class="btn-primary" onclick="window.saveEditKaryawan('${target.id}', ${canEditAllFields}, ${isMe})">
        <i class="fa fa-save"></i> Perbarui Data
      </button>
    </div>
  `)
}

/* ================= SIMPAN HASIL MODAL EDIT KARYAWAN ================= */
window.saveEditKaryawan = async function(id, canEditAll, isMe) {
  const newPassword = document.getElementById('editPassword')?.value.trim() || ''
  const selectEl       = document.getElementById('editTitikRadius')
  const titikRadiusBaru = selectEl ? (selectEl.value || null) : null

  try {
    const targetProfile = (window._allUsers || []).find(u => u.id === id) || null
    assertSameDepartment(window.currentUser, targetProfile)
    if (canEditAll) {
      const kontrakPayload = readKontrakForm('edit')
      if (!validateKontrakPayload(kontrakPayload)) return
      const updatePayload = {
        nama_lengkap:  document.getElementById('editNama')?.value.trim()    || '',
        email:         document.getElementById('editEmail')?.value.trim()   || null,
        jabatan:       document.getElementById('editJabatan')?.value.trim() || '',
        departemen:    document.getElementById('editDept')?.value.trim()    || '',
        no_hp:         document.getElementById('editHp')?.value.trim()      || '',
        tanggal_lahir: document.getElementById('editLahir')?.value          || null,
        tanggal_bergabung: document.getElementById('editTgl')?.value       || null,
        status_akun:   document.getElementById('editStatusAkun')?.value    || 'Aktif',
        sisa_cuti:     Math.max(0, Number.parseInt(document.getElementById('editSisaCuti')?.value || '0', 10) || 0),
        foto_url:      document.getElementById('editFotoUrl')?.value.trim() || '',
        titik_radius:  titikRadiusBaru,
        ...kontrakPayload
      }

      const beforeProfile = (window._allUsers || []).find(u => u.id === id) || null
      if (kontrakBerubah(beforeProfile, kontrakPayload)) {
        await closeActiveCutiRowsForUser(id)
      }

      const { error: profileErr } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', id)

      if (profileErr) throw profileErr
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        showToast('Password minimal 6 karakter', 'warning')
        return
      }
      if (isMe) {
        const { error: passErr } = await supabase.auth.updateUser({ password: newPassword })
        if (passErr) throw passErr
      } else {
        showToast('Reset password karyawan memerlukan Supabase Service Role.', 'info');
      }
    }

    // Update data cache lokal window agar UI sinkron instan
    const userIndex = (window._allUsers || []).findIndex(u => u.id === id)
    if (userIndex !== -1 && canEditAll) {
      window._allUsers[userIndex].nama_lengkap  = document.getElementById('editNama')?.value.trim()    || ''
      window._allUsers[userIndex].jabatan       = document.getElementById('editJabatan')?.value.trim() || ''
      window._allUsers[userIndex].departemen    = document.getElementById('editDept')?.value.trim()    || ''
      window._allUsers[userIndex].no_hp         = document.getElementById('editHp')?.value.trim()      || ''
      window._allUsers[userIndex].tanggal_lahir = document.getElementById('editLahir')?.value          || null
      window._allUsers[userIndex].tanggal_bergabung = document.getElementById('editTgl')?.value       || null
      window._allUsers[userIndex].titik_radius  = titikRadiusBaru
      Object.assign(window._allUsers[userIndex], readKontrakForm('edit'))
    }

    if (isMe && window.currentUser) {
      if (canEditAll) {
        window.currentUser.nama_lengkap  = document.getElementById('editNama')?.value.trim()    || ''
        window.currentUser.jabatan       = document.getElementById('editJabatan')?.value.trim() || ''
        window.currentUser.departemen    = document.getElementById('editDept')?.value.trim()    || ''
        window.currentUser.no_hp         = document.getElementById('editHp')?.value.trim()      || ''
        window.currentUser.tanggal_lahir = document.getElementById('editLahir')?.value          || null
        window.currentUser.tanggal_bergabung = document.getElementById('editTgl')?.value       || null
        Object.assign(window.currentUser, readKontrakForm('edit'))
      }
      window.currentUser.titik_radius = titikRadiusBaru
    }

    window.closeUserModal()
    showToast('Seluruh perubahan data karyawan berhasil disimpan', 'success')
    await renderUsers()

  } catch (err) {
    console.error('saveEditKaryawan error:', err)
    showToast('Gagal memperbarui data: ' + err.message, 'error')
  }
}

/* ================= UPLOAD FOTO DI MODAL EDIT ================= */
window.uploadFotoEditModal = async function(input, targetUserId) {
  const file     = input.files[0]
  const statusEl = document.getElementById('editFotoStatus')
  if (!file) return

  if (file.size > 2 * 1024 * 1024) {
    if (statusEl) statusEl.textContent = '⚠ Ukuran foto max 2MB'
    return
  }

  if (statusEl) statusEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mengupload...'
  const ext      = file.name.split('.').pop()
  const fileName = `avatar-${targetUserId}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, { upsert: true })

  if (uploadErr) {
    if (statusEl) statusEl.textContent = '⚠ Upload gagal: ' + uploadErr.message
    return
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
  const foto_url = urlData.publicUrl + '?t=' + Date.now()

  const { error: dbErr } = await supabase
    .from('profiles')
    .update({ foto_url })
    .eq('id', targetUserId)

  if (dbErr) {
    if (statusEl) statusEl.textContent = '⚠ Gagal simpan ke DB: ' + dbErr.message
    return
  }

  const preview = document.getElementById('editAvatarPreview')
  if (preview) {
    if (preview.tagName === 'IMG') preview.src = foto_url
    else preview.style.backgroundImage = `url(${foto_url})`
  }

  if (targetUserId === window.currentUser.id) {
    window.currentUser.foto_url = foto_url
    updateTopbarAvatar(window.currentUser)
  }

  const idx = (window._allUsers || []).findIndex(u => u.id === targetUserId)
  if (idx !== -1) window._allUsers[idx].foto_url = foto_url

  if (statusEl) statusEl.innerHTML = '<i class="fa fa-check" style="color:var(--success);"></i> Foto diperbarui!'
}

/* ================= RENDER LIST DAFTAR TUNGGU (PENDING LIST) ================= */
function renderPendingList(list) {
  const el = document.getElementById('userListContainer')
  if (!el) return
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa fa-hourglass-half"></i><p>Tidak ada data di daftar tunggu</p></div>`
    return
  }
  el.innerHTML = `
    <div class="alert info" style="margin-bottom:12px;">
      <i class="fa fa-info-circle"></i>
      <span>Karyawan di bawah ini belum mendaftarkan emailnya. Instruksikan staff untuk registrasi mandiri di tautan <strong>register</strong></span>
    </div>
    ${list.map(p => `
      <div class="user-item">
        <div class="user-avatar" style="background:linear-gradient(135deg,#64748b,#475569);">
          ${(p.nama_lengkap||'?')[0].toUpperCase()}
        </div>
        <div class="ui-info">
          <div class="ui-name">${p.nama_lengkap}</div>
          <div class="ui-email">${p.jabatan||'-'} ${p.departemen?'· '+p.departemen:''}</div>
          <div style="font-size:.72rem;color:var(--text-muted);margin-top:3px;">
            📅 Input: ${p.tanggal_bergabung||'-'} · Kontrak: ${p.kontrak_mulai || '-'} s/d ${p.kontrak_berakhir || '-'} · Akses Target: ${p.role}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge badge-yellow"><i class="fa fa-hourglass-half"></i> Waiting</span>
          <button class="action-btn delete" title="Hapus" onclick="deletePending('${p.id}','${p.nama_lengkap}')">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>`).join('')}
  `
}

window.deletePending = async function(id, nama) {
  const pendingTarget = (window._pendingList || []).find(p => p.id === id) || null
  try { assertSameDepartment(window.currentUser, pendingTarget) } catch (err) { showToast(err.message, 'error'); return }
  if (!(await confirmAction(`Hapus data "${nama}" dari daftar tunggu pendaftaran?`, 'Ya, hapus'))) return
  await supabase.from('pending_profiles').delete().eq('id', id)
  window._pendingList = window._pendingList.filter(p => p.id !== id)
  renderPendingList(window._pendingList)
}

/* ===============================================================
   UPLOAD KARYAWAN MASSAL VIA EXCEL
   Kolom wajib: Nama | Email (opsional: Jabatan, Departemen, No HP,
   Tgl Bergabung, Tgl Lahir, Role, Titik Radius)
   → Data masuk ke pending_profiles (status: waiting)
   → Karyawan tinggal registrasi di register.html untuk verif email
=============================================================== */

window.downloadTemplateKaryawan = function() {
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum siap. Coba lagi sebentar.', 'warning'); return }
  const ws = XLSX.utils.aoa_to_sheet([
    ['Nama Lengkap','Jabatan','Departemen','No HP','Tanggal Bergabung','Tanggal Lahir','Role','Titik Radius','Jenis Kontrak','Kontrak Mulai','Durasi Kontrak','Satuan Durasi Kontrak'],
    ['Budi Santoso','Staff','IT','081234567890','2025-01-01','1995-06-15','staff','','kontrak','2026-01-01','12','bulan'],
    ['Siti Rahayu','Supervisor','HR','081298765432','2025-01-01','1990-03-20','staff','','probation','2026-01-01','3','bulan'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template Karyawan')
  XLSX.writeFile(wb, 'template_upload_karyawan.xlsx')
}

window.handleUploadKaryawanExcel = function(input) {
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum siap.', 'warning'); return }
  const file = input.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result)
      const wb   = XLSX.read(data, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!rows.length) { showToast('File Excel kosong atau format tidak sesuai.', 'warning'); return }

      // Normalisasi kolom (case-insensitive)
      const parsed = rows.map((row, i) => {
        const get = (...keys) => {
          for (const k of keys) {
            const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase())
            if (found && row[found] !== '') return String(row[found]).trim()
          }
          return ''
        }
        const nama = get('Nama Lengkap', 'Nama', 'nama_lengkap', 'name')
        const kontrakPayload = buildKontrakPayload({
          jenisKontrak: get('Jenis Kontrak', 'jenis_kontrak') || 'kontrak',
          kontrakMulai: get('Kontrak Mulai', 'kontrak_mulai', 'Tanggal Mulai Kontrak') || get('Tanggal Bergabung', 'tanggal_bergabung') || null,
          durasiKontrak: get('Durasi Kontrak', 'durasi_kontrak') || 12,
          satuanDurasiKontrak: get('Satuan Durasi Kontrak', 'satuan_durasi_kontrak') || 'bulan'
        })
        const dept = get('Departemen', 'departemen', 'dept')
        const deptAllowed = canAccessAllDepartments(window.currentUser) || String(dept || '').trim().toLowerCase() === getUserDepartment(window.currentUser).toLowerCase()
        const valid = !!nama && !!kontrakPayload.kontrak_mulai && !!kontrakPayload.durasi_kontrak && deptAllowed
        return {
          _index: i + 2, // baris Excel (header = 1)
          nama_lengkap:      nama,
          jabatan:           get('Jabatan', 'jabatan', 'position'),
          departemen:        canAccessAllDepartments(window.currentUser) ? dept : getUserDepartment(window.currentUser),
          no_hp:             get('No HP', 'no_hp', 'hp', 'phone'),
          tanggal_bergabung: get('Tanggal Bergabung', 'tanggal_bergabung') || null,
          tanggal_lahir:     get('Tanggal Lahir', 'tanggal_lahir') || null,
          role:              ['staff','admin','admin_hr','admin_all','super_admin'].includes(normalizeRole(get('Role','role')))
                               ? normalizeRole(get('Role','role')) : 'staff',
          titik_radius:      get('Titik Radius', 'titik_radius') || null,
          ...kontrakPayload,
          valid,
          errMsg: !nama ? 'Kolom "Nama Lengkap" kosong' : !deptAllowed ? 'Departemen berbeda' : !kontrakPayload.kontrak_mulai ? 'Kontrak Mulai wajib diisi' : !kontrakPayload.durasi_kontrak ? 'Durasi Kontrak wajib diisi' : ''
        }
      })

      window._uploadKaryawanParsed = parsed
      renderPreviewUploadKaryawan(parsed)
    } catch(err) {
      showToast('Gagal membaca file Excel: ' + err.message, 'error')
    }
  }
  reader.readAsArrayBuffer(file)
  input.value = '' // reset agar bisa upload file yang sama lagi
}

function renderPreviewUploadKaryawan(rows) {
  const wrap = document.getElementById('previewUploadKaryawanWrap')
  if (!wrap) return

  const valid   = rows.filter(r => r.valid)
  const invalid = rows.filter(r => !r.valid)

  wrap.style.display = 'block'
  wrap.innerHTML = `
    <div class="card fade-up" style="border:1.5px solid var(--primary); padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
        <div>
          <h3 style="font-size:.9rem; font-weight:800; color:var(--primary); margin:0 0 4px;">
            <i class="fa fa-table"></i> Preview Upload Excel Karyawan
          </h3>
          <p style="font-size:.78rem; color:var(--text-muted); margin:0;">
            ${valid.length} valid
            ${invalid.length ? `· <span style="color:var(--danger);">${invalid.length} baris bermasalah</span>` : ''}
            · Setelah disimpan, karyawan masuk <strong>Daftar Tunggu</strong> dan bisa registrasi di <code>register.html</code>
          </p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary btn-sm" onclick="window.batalUploadKaryawan()">
            <i class="fa fa-times"></i> Batal
          </button>
          ${valid.length ? `
            <button class="btn-success btn-sm" onclick="window.konfirmasiUploadKaryawan()">
              <i class="fa fa-check"></i> Simpan ${valid.length} ke Daftar Tunggu
            </button>` : ''}
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:.78rem;">
          <thead>
            <tr style="background:var(--gray-50);">
              <th style="padding:8px 10px; text-align:left; border-bottom:1.5px solid var(--border); color:var(--text-muted);">Baris</th>
              <th style="padding:8px 10px; text-align:left; border-bottom:1.5px solid var(--border); color:var(--text-muted);">Nama Lengkap</th>
              <th style="padding:8px 10px; text-align:left; border-bottom:1.5px solid var(--border); color:var(--text-muted);">Jabatan</th>
              <th style="padding:8px 10px; text-align:left; border-bottom:1.5px solid var(--border); color:var(--text-muted);">Departemen</th>
              <th style="padding:8px 10px; text-align:left; border-bottom:1.5px solid var(--border); color:var(--text-muted);">Role</th>
              <th style="padding:8px 10px; text-align:left; border-bottom:1.5px solid var(--border); color:var(--text-muted);">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr style="border-bottom:1px solid var(--border); ${!r.valid ? 'background:#fff5f5;' : ''}">
                <td style="padding:7px 10px; color:var(--text-muted); font-size:.75rem;">${r._index}</td>
                <td style="padding:7px 10px; font-weight:700;">${r.nama_lengkap || '<em style="color:var(--danger);">—</em>'}</td>
                <td style="padding:7px 10px;">${r.jabatan || '-'}</td>
                <td style="padding:7px 10px;">${r.departemen || '-'}</td>
                <td style="padding:7px 10px;"><span class="badge badge-gray">${r.role}</span></td>
                <td style="padding:7px 10px;">
                  ${r.valid
                    ? `<span class="badge badge-green"><i class="fa fa-check"></i> Valid</span>`
                    : `<span class="badge badge-red"><i class="fa fa-times"></i> ${r.errMsg}</span>`}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
}

window.batalUploadKaryawan = function() {
  const wrap = document.getElementById('previewUploadKaryawanWrap')
  if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = '' }
  window._uploadKaryawanParsed = null
}

window.konfirmasiUploadKaryawan = async function() {
  const tenantContext = JSON.parse(sessionStorage.getItem('tenantContext') || '{}')
  const uploadClientId = window.currentUser?.role === 'super_admin' ? tenantContext.client_id : window.currentUser?.client_id
  const uploadDepartmentId = window.currentUser?.role === 'super_admin' ? null : window.currentUser?.department_id
  if (!uploadClientId) { showToast('Pilih konteks client terlebih dahulu sebelum upload massal.', 'warning'); return }
  const rows = (window._uploadKaryawanParsed || []).filter(r => r.valid && (canAccessAllDepartments(window.currentUser) || String(r.departemen || '').trim().toLowerCase() === getUserDepartment(window.currentUser).toLowerCase()))
  if (!rows.length) return

  const payload = rows.map(r => ({
    nama_lengkap:      r.nama_lengkap,
    jabatan:           r.jabatan || '',
    departemen:        r.departemen || '',
    no_hp:             r.no_hp || '',
    tanggal_bergabung: r.tanggal_bergabung || null,
    tanggal_lahir:     r.tanggal_lahir || null,
    role:              r.role || 'staff',
    titik_radius:      r.titik_radius || null,
    jenis_kontrak:     r.jenis_kontrak || null,
    kontrak_mulai:     r.kontrak_mulai || null,
    durasi_kontrak:    r.durasi_kontrak || null,
    satuan_durasi_kontrak: r.satuan_durasi_kontrak || 'bulan',
    masa_kontrak:      r.masa_kontrak || null,
    kontrak_berakhir:  r.kontrak_berakhir || null,
    status_kontrak:    r.status_kontrak || 'aktif',
    status:            'waiting',
    client_id:         uploadClientId,
    department_id:     uploadDepartmentId,
    created_by:        window.currentUser?.id || null
  }))

  const { error } = await supabase.from('pending_profiles').insert(payload)
  if (error) { showToast('Gagal menyimpan: ' + error.message, 'error'); return }

  window.batalUploadKaryawan()
  showToast(`${payload.length} karyawan berhasil dimasukkan ke daftar tunggu`, 'success')
  await renderUsers()
  // Otomatis pindah ke tab pending
  if (window.switchTab) window.switchTab('pending')
}

/* ================= TOGGLE AKTIF / NON-AKTIF KARYAWAN ================= */
window.toggleStatusUser = async function(userId, statusSekarang) {
  const targetProfile = (window._allUsers || []).find(u => u.id === userId) || null
  try { assertSameDepartment(window.currentUser, targetProfile) } catch (err) { showToast(err.message, 'error'); return }
  const statusBaru = statusSekarang === 'Aktif' ? 'Non-Aktif' : 'Aktif'
  if (!(await confirmAction(`Ubah status karyawan menjadi ${statusBaru}?`, 'Ya, ubah'))) return
  
  await supabase.from('profiles').update({ status_akun: statusBaru }).eq('id', userId)
  if (statusBaru === 'Non-Aktif') {
    await resetCutiKaryawan(userId)
    showToast('Karyawan berhasil dinonaktifkan dan kuota cuti disinkronkan', 'success')
  } else {
    showToast('Karyawan berhasil diaktifkan kembali', 'success')
  }
  await renderUsers()
}

/* ================= COMPONENT HELPER MODAL PROFILE ================= */
window.showUserModal = function(html) {
  let el = document.getElementById('userModal')
  if (el) el.remove()

  const bg = document.createElement('div')
  bg.id        = 'userModal'
  bg.className = 'modal-bg open'
  bg.innerHTML = `<div class="modal-box">${html}</div>`

  bg.addEventListener('click', e => {
    if (e.target === bg) window.closeUserModal()
  })

  document.body.appendChild(bg)
}

window.closeUserModal = function() {
  const modal = document.getElementById('userModal')
  if (modal) modal.remove()
}

/* ================= GLOBAL NAVIGATION OVERLAY CONTROL ================= */
window.toggleSidebar = () => {
  document.getElementById('sidebar')?.classList.toggle('open')
  document.getElementById('overlay')?.classList.toggle('active')
}
// Reset cache timezone saat admin mengubah titik lokasi
window.resetTimezoneCache = resetTimezoneCache

window.closeSidebar = () => {
  document.getElementById('sidebar')?.classList.remove('open')
  document.getElementById('overlay')?.classList.remove('active')
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar() })

/* ================= INTERACTIVE THEME TOGGLE (DARK MODE) ================= */
window.toggleTheme = function() {
  document.documentElement.classList.toggle('dark')
  const isDark = document.documentElement.classList.contains('dark')
  const icon   = document.getElementById('themeIcon')
  if (icon) icon.className = isDark ? 'fa fa-sun' : 'fa fa-moon'
  localStorage.setItem('theme', isDark ? 'dark' : 'light')
}

/* ================= FULL SCREEN AVATAR PREVIEW ================= */
window.previewImageFullScreen = function(urlSrc) {
  if (!urlSrc) return

  let existingOverlay = document.getElementById('imagePreviewOverlay')
  if (existingOverlay) existingOverlay.remove()

  const overlay = document.createElement('div')
  overlay.id = 'imagePreviewOverlay'
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; 
    justify-content: center; z-index: 10000; cursor: zoom-out; opacity: 0; transition: opacity 0.25s ease;
  `

  const img = document.createElement('img')
  img.src = urlSrc
  img.style.cssText = `
    max-width: 90%; max-height: 85vh; border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5); transform: scale(0.9); transition: transform 0.25s ease;
  `

  overlay.appendChild(img)
  document.body.appendChild(overlay)

  setTimeout(() => {
    overlay.style.opacity = '1'
    img.style.transform = 'scale(1)'
  }, 10)

  const closeHandler = () => {
    overlay.style.opacity = '0'
    img.style.transform = 'scale(0.9)'
    setTimeout(() => overlay.remove(), 250)
  }

  overlay.onclick = closeHandler
  document.addEventListener('keydown', function escClose(e) {
    if (e.key === 'Escape') {
      closeHandler()
      document.removeEventListener('keydown', escClose)
    }
  })
}
