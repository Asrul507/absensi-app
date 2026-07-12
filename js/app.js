/**
 * js/app.js
 * ============================================================
 * File utama aplikasi GenPro.
 * * Sesuai file acuan awal + Pembaruan Tampilan Kategori Sidebar.
 * Semua fungsi manajemen karyawan, modal, upload foto, dan password
 * dipertahankan 100% utuh tanpa ada yang terpotong.
 * ============================================================
 */

import { supabase } from './supabase.js'
import { getProfile } from './users.js'
import { login as doLogin, logout, updateUserPassword, createEmployeeAccount, lookupOfficeForUsername } from './auth.js'
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
import { ensureSuperAdminOfficeContext, getActiveOfficeContextLabel, clearSuperAdminOfficeContext } from './office-context.js'
import { initTimezone, resetTimezoneCache, getTodayLokal, toTanggalJamLokal } from './timezone.js?v=20260609-6'
import { renderLaporanKeseluruhan } from './laporan-keseluruhan.js'
import { showToast, confirmAction } from './feedback.js'
import { logAuditEvent } from './audit-trail.js'
import { renderAttendanceApproval, canApproveAttendance } from './attendance-approval.js'
import { assertSameDepartment, canAccessAllDepartments, canManageUserByDepartment, getAccessibleProfiles, getUserDepartment, normalizeRole, isSuperAdmin, isAdminAll, isAdminHR, isAdmin, isStaff, applyTenantFilter } from './access-control.js'
import { renderSettingsApp } from './settings-app.js'
import { renderPayroll, renderEmployeePayroll, canAccessPayroll, renderPayrollEmployeeFields, readPayrollEmployeePayload, validatePayrollEmployeePayload } from './payroll.js'

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
    window.updateHeaderOfficeContext?.()

    if (profile?.foto_url) window.currentUser.foto_url = profile.foto_url

    // Render komponen navigasi sesuai hak akses
    renderMenu(window.currentUser.role)
    renderBottomNav(window.currentUser.role)
    navigate('dashboard')

  } catch (err) {
    console.error('checkUser error:', err)
    showLoginPage()
  }
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

async function autoFillOfficeFromUsername() {
  const usernameEl = document.getElementById('username')
  const clientEl = document.getElementById('clientCode')
  const hintEl = document.getElementById('officeLookupHint')
  const username = usernameEl?.value?.trim() || ''
  if (!username || !clientEl || clientEl.dataset.userEdited === 'true') return
  try {
    const result = await lookupOfficeForUsername(username)
    if (result.status === 'single') {
      clientEl.value = result.code || ''
      if (hintEl) { hintEl.textContent = `Office terdeteksi: ${result.client?.nama_client || result.code}`; hintEl.style.color = 'var(--success)' }
    } else if (result.status === 'multiple') {
      if (hintEl) { hintEl.textContent = 'Username ditemukan di beberapa Office, isi kode Office.'; hintEl.style.color = 'var(--warning)' }
    } else if (result.status === 'super_admin') {
      if (hintEl) { hintEl.textContent = 'Super admin dapat login tanpa Office.'; hintEl.style.color = 'var(--text-muted)' }
    } else if (hintEl) {
      hintEl.textContent = 'Isi kode Office jika akun bukan super admin.'; hintEl.style.color = 'var(--text-muted)'
    }
  } catch (err) {
    console.warn('Lookup Office login gagal:', err)
    if (hintEl) { hintEl.textContent = 'Isi kode Office jika akun bukan super admin.'; hintEl.style.color = 'var(--text-muted)' }
  }
}

function bindLoginOfficeLookup() {
  const usernameEl = document.getElementById('username')
  const clientEl = document.getElementById('clientCode')
  if (!usernameEl || usernameEl.dataset.officeLookupBound === 'true') return
  usernameEl.dataset.officeLookupBound = 'true'
  let timer = null
  usernameEl.addEventListener('input', () => {
    if (clientEl) { clientEl.dataset.userEdited = 'false'; clientEl.value = '' }
    clearTimeout(timer)
    timer = setTimeout(autoFillOfficeFromUsername, 450)
  })
  usernameEl.addEventListener('blur', autoFillOfficeFromUsername)
  clientEl?.addEventListener('input', () => { clientEl.dataset.userEdited = 'true' })
}

bindLoginOfficeLookup()

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
function getCurrentOfficeLabel(user) {
  if (normalizeRole(user?.role) === 'super_admin') return ''
  const client = Array.isArray(user?.clients) ? user.clients[0] : user?.clients
  const name = client?.nama_client || user?.nama_client || user?.client_name || ''
  const code = client?.domain_login || client?.kode_client || ''
  if (!name && !code) return ''
  return name && code ? `${name} (${code})` : (name || code)
}

window.getCurrentOfficeLabel = getCurrentOfficeLabel

window.updateHeaderOfficeContext = function () {
  const el = document.getElementById('activeOfficeContext')
  if (!el) return
  const label = getActiveOfficeContextLabel(window.currentUser)
  if (!label) { el.style.display = 'none'; el.textContent = ''; return }
  el.textContent = `Office Aktif: ${label}`
  el.title = normalizeRole(window.currentUser?.role) === 'super_admin' ? 'Klik untuk ganti Office aktif' : 'Office akun'
  el.style.display = 'inline-flex'
}

window.changeActiveOfficeContext = async function () {
  if (normalizeRole(window.currentUser?.role) === 'super_admin') {
    await clearSuperAdminOfficeContext(window.currentPage || 'dashboard')
  }
}

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
      ${canAccessPayroll(window.currentUser) ? `<a href="#" id="menu-payroll" onclick="navigate('payroll'); closeSidebar(); return false;"><i class="fa fa-money-check-dollar"></i> Payroll</a>` : ''}

      <div class="sidebar-section-title">LAPORAN REKAPITULASI</div>
      <a href="#" id="menu-daftar-absensi" onclick="navigate('daftar-absensi'); closeSidebar(); return false;"><i class="fa fa-list-check"></i> Log Kehadiran Ringkas</a>
      <a href="#" id="menu-rekap-inout" onclick="navigate('rekap-inout'); closeSidebar(); return false;"><i class="fa fa-clock"></i> Rekap Bulanan In/Out</a>
      <a href="#" id="menu-rekap" onclick="navigate('rekap'); closeSidebar(); return false;"><i class="fa fa-chart-bar"></i> Laporan Rekap Absensi</a>
      <a href="#" id="menu-laporan-keseluruhan" onclick="navigate('laporan-keseluruhan'); closeSidebar(); return false;"><i class="fa fa-file-lines"></i> Laporan Keseluruhan <span class="sidebar-badge-info">NEW</span></a>
      ${role === 'super_admin' ? `<div class="sidebar-section-title">SETTINGS APP</div><a href="#" id="menu-settings-app" onclick="navigate('settings-app'); closeSidebar(); return false;"><i class="fa fa-building-user"></i> Office & Department</a>` : ''}
    `;
  }

  const officeLabel = getCurrentOfficeLabel(window.currentUser)
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sb-name">GenPro</div>
      ${officeLabel ? `<div class="sb-office">${officeLabel}</div>` : ''}
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
const ADMIN_PAGES = ['dashboard', 'absensi', 'kalender', 'pengajuan', 'perbaikan-absen', 'approval-absensi', 'jadwal', 'shift', 'users', 'personalia', 'admin-lokasi', 'payroll', 'daftar-absensi', 'rekap-inout', 'rekap', 'laporan-keseluruhan', 'profile', 'settings-app']

function isAdminRole(role) {
  return ADMIN_ROLES.includes(normalizeRole(role))
}

function canAccessPage(user, page) {
  if (page === 'payroll') return canAccessPayroll(user)
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

  window.currentPage = page

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
    case 'payroll': await renderPayroll(); break
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
  renderProfile()
}

/* ================= KARYAWAN MANAGEMENT SECTION (ADMIN) ================= */
async function renderUsers() {
  if (!(await ensureSuperAdminOfficeContext('users', 'Pilih Office untuk Data Karyawan'))) return
  const content    = document.getElementById('content')
  const viewerRole = window.currentUser.role
  const isAllDepartmentViewer = canAccessAllDepartments(window.currentUser)
  const canCreateEmployeeAccounts = ['super_admin', 'admin_hr'].includes(normalizeRole(viewerRole))
  window._allUsers = Array.isArray(window._allUsers) ? window._allUsers : []
  window.filterUsers = function() {
    const q  = (document.getElementById('searchUser')?.value || '').toLowerCase()
    const st = document.getElementById('filterStatusUser')?.value || ''
    const users = Array.isArray(window._allUsers) ? window._allUsers : []
    const filtered = users.filter(u =>
      ((u.nama_lengkap||'').toLowerCase().includes(q) ||
        (u.username||'').toLowerCase().includes(q) ||
        (u.email_internal||'').toLowerCase().includes(q) ||
        (u.email||'').toLowerCase().includes(q)) &&
      (!st || normalizeAccountStatus(u.status_akun) === st)
    )
    window._filteredUsers = filtered
    renderUserList(filtered)
  }

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-users"></i> Manajemen Karyawan</h2>
      ${canCreateEmployeeAccounts ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-secondary btn-sm" onclick="window.downloadTemplateKaryawan()" title="Download template Excel untuk upload massal">
            <i class="fa fa-file-excel" style="color:#16a34a;"></i> Template Excel
          </button>
          <button class="btn-success btn-sm" onclick="document.getElementById('inputUploadKaryawanExcel').click()" title="Upload daftar karyawan via Excel untuk dibuatkan akun login">
            <i class="fa fa-upload"></i> Upload Excel
          </button>
          <input type="file" id="inputUploadKaryawanExcel" accept=".xlsx,.xls" style="display:none;" onchange="window.handleUploadKaryawanExcel(this)">
          <button type="button" class="btn-primary btn-sm" onclick="openFormTambah()">
            <i class="fa fa-plus"></i> Tambah Manual
          </button>
        </div>
      ` : ''}
    </div>

    ${viewerRole !== 'staff' ? `<div class="card fade-up" style="padding:12px 14px;margin-bottom:12px;color:var(--text-muted);font-size:.82rem;font-weight:700;"><i class="fa fa-building"></i> ${isAllDepartmentViewer ? 'Anda mengelola semua departemen.' : `Anda mengelola departemen: ${getUserDepartment(window.currentUser) || '-'}.`}</div>` : ''}

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

        </select>
      </div>
    </div>

    <div id="userListContainer" class="fade-up-1">
      <div class="card" style="text-align:center;padding:28px;">
        <i class="fa fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i>
      </div>
    </div>
  `

  try {
    const employeeSelect = '*,clients:client_id(id,nama_client,kode_client,domain_login,status),departments:department_id(id,nama_department,status)'
    let users = []
    try {
      users = viewerRole === 'staff'
        ? await getAccessibleProfiles(window.currentUser, { activeOnly: false, select: employeeSelect })
        : await getAccessibleProfiles(window.currentUser, { activeOnly: false, select: employeeSelect })
    } catch (joinErr) {
      console.error('Gagal memuat join client/department, mencoba fallback profiles saja:', joinErr)
      users = viewerRole === 'staff'
        ? await getAccessibleProfiles(window.currentUser, { activeOnly: false, select: '*' })
        : await getAccessibleProfiles(window.currentUser, { activeOnly: false, select: '*' })
    }
    let cutiTahunanRows = []
    try {
      cutiTahunanRows = await syncEligibleCutiTahunanForProfiles(users || [])
    } catch (err) {
      console.error('Gagal memuat cuti tahunan karyawan:', err)
    }
    window._cutiTahunanMap = {}
    ;(cutiTahunanRows || []).forEach(c => { window._cutiTahunanMap[c.user_id] = c })

    window._allUsers = users || []

    window._filteredUsers = window._allUsers
    renderUserList(window._allUsers)
  } catch (err) {
    console.error('Gagal memuat data karyawan:', err)
    const container = document.getElementById('userListContainer')
    if (container) {
      container.innerHTML = `
        <div class="card" style="padding:18px;border-left:4px solid var(--danger);">
          <div style="font-weight:900;color:var(--danger);margin-bottom:6px;"><i class="fa fa-triangle-exclamation"></i> Gagal memuat data karyawan</div>
          <div style="color:var(--text-muted);font-size:.85rem;">${err?.message || 'Terjadi kesalahan saat mengambil data profiles.'}</div>
        </div>
      `
    }
    showToast('Gagal memuat data karyawan', 'error')
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
  if (!(await ensureSuperAdminOfficeContext('personalia', 'Pilih Office untuk HR Personalia'))) return
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
      <button type="button" class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
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


async function fetchOfficeOptionsForEmployeeForm() {
  if (window.currentUser?.role === 'super_admin') {
    const { data, error } = await supabase.from('clients').select('id,nama_client,kode_client,status').in('status', ['active', 'aktif']).order('nama_client')
    if (error) throw error
    return data || []
  }
  return window.currentUser?.client_id ? [{ id: window.currentUser.client_id, nama_client: window.currentUser.clients?.nama_client || window.currentUser.nama_client || 'Office Anda', kode_client: '' }] : []
}

async function fetchDepartmentOptionsForOffice(clientId) {
  if (!clientId) return []
  const { data, error } = await supabase
    .from('departments')
    .select('id,nama_department,status')
    .eq('client_id', clientId)
    .in('status', ['active', 'aktif'])
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
    showToast('Hanya Super Admin dan Admin HR yang dapat menambah karyawan.', 'warning')
    return
  }
  if (!['super_admin', 'admin_hr'].includes(role)) {
    showToast('Role Anda tidak diizinkan membuat akun karyawan.', 'warning')
    return
  }

  let opsiLokasi = ''
  let clients = []
  let departments = []
  try {
    const [lokasiResult, clientOptions] = await Promise.all([
      supabase.from('lokasi_absen').select('*'),
      fetchOfficeOptionsForEmployeeForm()
    ])
    if (!lokasiResult.error && lokasiResult.data) {
      opsiLokasi = lokasiResult.data.map(l => {
        const namaTitik = l.nama_titik || l.nama_lokasi || l.nama || ''
        return `<option value="${namaTitik}">${namaTitik}</option>`
      }).join('')
    }
    clients = clientOptions
    const initialOfficeId = role === 'super_admin' ? (clients[0]?.id || '') : window.currentUser?.client_id
    departments = await fetchDepartmentOptionsForOffice(initialOfficeId)
  } catch (e) {
    console.error('Gagal menyiapkan form tambah karyawan:', e)
    showToast('Gagal memuat data Office/Department/lokasi.', 'error')
    return
  }

  const initialOfficeId = role === 'super_admin' ? (clients[0]?.id || '') : window.currentUser?.client_id
  const currentViewerRole = normalizeRole(window.currentUser?.role)
  const roleOptions = currentViewerRole === 'super_admin'
    ? `<option value="staff">Staff Karyawan</option>
       <option value="admin">Admin Department</option>
       <option value="admin_hr">Admin HR</option>
       <option value="admin_all">Admin All</option>`
    : `<option value="staff">Staff Karyawan</option>
       <option value="admin">Admin Department</option>`
  const clientField = role === 'super_admin'
    ? `<select id="pOffice" onchange="window.reloadEmployeeDepartments(this.value); window.reloadPayrollTemplatesForEmployeeForm?.('p', this.value)">${clients.map(c => `<option value="${c.id}" ${c.id === initialOfficeId ? 'selected' : ''}>${c.nama_client} (${c.kode_client || '-'})</option>`).join('')}</select>`
    : `<input id="pOfficeName" value="${clients[0]?.nama_client || window.currentUser?.clients?.nama_client || 'Office Anda'}" disabled><input type="hidden" id="pOffice" value="${initialOfficeId || ''}">`
  const payrollFields = await renderPayrollEmployeeFields('p', { nama_lengkap: '' }, initialOfficeId)

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
      <div class="field"><label>Office <span class="req">*</span></label>${clientField}</div>
      <div class="field"><label>Department <span class="req">*</span></label><select id="pDepartment">${renderDepartmentOptions(departments)}</select></div>
      <div class="field"><label>Status Akun</label>
        <select id="pStatusAkun">
          <option value="Aktif">Aktif</option>

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
          ${roleOptions}
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
      ${payrollFields}
    </div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" onclick="window.closeUserModal()">Batal</button>
      <button type="button" class="btn-primary" onclick="window.savePendingKaryawan()"><i class="fa fa-user-plus"></i> Buat Akun</button>
    </div>
  `)
}

window.reloadEmployeeDepartments = async function(clientId) {
  const select = document.getElementById('pDepartment')
  if (!select) return
  select.innerHTML = '<option value="">Memuat department...</option>'
  try {
    select.innerHTML = renderDepartmentOptions(await fetchDepartmentOptionsForOffice(clientId))
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
  if (passwordAwal.length < 8) {
    showToast('Password awal minimal 8 karakter', 'warning')
    document.getElementById('pPasswordAwal')?.focus()
    return
  }
  const jabatanValue = document.getElementById('pJabatan')?.value.trim() || ''
  const roleValue = document.getElementById('pRole')?.value || ''
  if (!jabatanValue) { showToast('Jabatan wajib diisi', 'warning'); return }
  if (!roleValue) { showToast('Role wajib dipilih', 'warning'); return }
  const kontrakPayload = readKontrakForm('p')
  if (!validateKontrakPayload(kontrakPayload)) return

  const role = normalizeRole(window.currentUser?.role)
  if (!['super_admin', 'admin_hr'].includes(role)) { showToast('Hanya Super Admin dan Admin HR yang dapat membuat akun.', 'warning'); return }
  const selectedOfficeId = role === 'super_admin' ? document.getElementById('pOffice')?.value : window.currentUser?.client_id
  const selectedDepartmentId = document.getElementById('pDepartment')?.value || null
  if (!selectedOfficeId) { showToast('Office wajib dipilih.', 'warning'); return }
  if (!selectedDepartmentId) { showToast('Department wajib dipilih.', 'warning'); return }
    const payrollPayload = readPayrollEmployeePayload('p')
  console.log('DEBUG payrollPayload (tambah):', payrollPayload)
  showToast('DEBUG: ' + JSON.stringify(payrollPayload), 'warning')

  if (!(await validatePayrollEmployeePayload(payrollPayload, selectedOfficeId))) return
  const departments = await fetchDepartmentOptionsForOffice(selectedOfficeId)
  const selectedDepartment = departments.find(d => String(d.id) === String(selectedDepartmentId))
  if (!selectedDepartment) { showToast('Department tidak valid untuk Office yang dipilih.', 'warning'); return }

  try {
    await createEmployeeAccount({
      nama_lengkap: nama,
      username,
      password_awal: passwordAwal,
      client_id: selectedOfficeId,
      department_id: selectedDepartmentId,
      departemen: selectedDepartment.nama_department,
      jabatan: jabatanValue,
      no_hp: document.getElementById('pHp').value.trim(),
      tanggal_bergabung: document.getElementById('pTgl').value || null,
      tanggal_lahir: document.getElementById('pLahir').value || null,
      role: roleValue,
      sisa_cuti: Math.max(0, Number.parseInt(document.getElementById('pSisaCuti')?.value || '0', 10) || 0),
      foto_url: document.getElementById('pFotoUrl')?.value.trim() || '',
      titik_radius: document.getElementById('pTitikRadius').value || null,
      ...kontrakPayload,
      ...payrollPayload
    })
    window.closeUserModal()
    showToast(`${nama} berhasil dibuat dengan username dan password awal`, 'success')
    await renderUsers()
  } catch (error) {
    console.error('savePendingKaryawan error:', error)
    showToast(error.message || 'Gagal membuat akun karyawan', 'error')
  }
}

function safeText(value, fallback = '-') {
  const text = value === null || value === undefined || value === '' ? fallback : String(value)
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeAccountStatus(status) {
  const v = String(status || 'Aktif').trim().toLowerCase()
  if (v === 'aktif' || v === 'active') return 'Aktif'
  if (v === 'non-aktif' || v === 'nonaktif' || v === 'inactive' || v === 'disabled') return 'Non-Aktif'
  if (v === 'menunggu verifikasi' || v === 'waiting' || v === 'pending') return 'Non-Aktif'
  return 'Aktif'
}

function legacyLoginValue(value) {
  return value || '(legacy belum diset)'
}

function getClientObject(user) {
  return Array.isArray(user?.clients) ? user.clients[0] : user?.clients
}

function getOfficeLabel(user) {
  const client = getClientObject(user)
  return client?.nama_client || user?.nama_client || user?.client_name || user?.client_id || '-'
}

function getOfficeDomainLabel(user) {
  const client = getClientObject(user)
  return client?.domain_login || client?.kode_client || user?.domain_login || user?.kode_client || '-'
}

function getOfficeFullLabel(user) {
  const office = getOfficeLabel(user)
  const domain = getOfficeDomainLabel(user)
  return domain && domain !== '-' ? `${office} (${domain})` : office
}

function getDepartmentObject(user) {
  return Array.isArray(user?.departments) ? user.departments[0] : user?.departments
}

function getDepartmentLabel(user) {
  const department = getDepartmentObject(user)
  return department?.nama_department || user?.nama_department || user?.departemen || user?.department_id || '-'
}

function canEditOffice(user) {
  return normalizeRole(user?.role) === 'super_admin'
}

function canEditDepartmentForEmployee(user) {
  const role = normalizeRole(user?.role)
  return ['super_admin', 'admin_all', 'admin_hr'].includes(role)
}

function renderDepartmentOptionsForEdit(departments = [], selectedId = '') {
  const options = departments.map(d => `<option value="${safeText(d.id)}" ${String(d.id) === String(selectedId) ? 'selected' : ''}>${safeText(d.nama_department)}</option>`).join('')
  return `<option value="">-- Pilih Department --</option>${options}`
}


function getCheckedValues(selector) {
  return Array.from(document.querySelectorAll(selector)).filter(el => el.checked).map(el => el.value).filter(Boolean)
}

async function runSuperAdminDataAction({ action, menuKey, ids, label, confirmText = 'HAPUS' }) {
  if (normalizeRole(window.currentUser?.role) !== 'super_admin') { showToast('Aksi ini khusus Super Admin.', 'warning'); return null }
  const uniqueIds = Array.from(new Set(ids || [])).filter(Boolean)
  if (!uniqueIds.length) { showToast('Pilih minimal 1 data terlebih dahulu.', 'warning'); return null }
  const firstConfirm = await confirmAction(`${label}: ${uniqueIds.length} data akan diproses. Lanjutkan?`, 'Lanjutkan')
  if (!firstConfirm) return null
  const typed = window.prompt(`Ketik ${confirmText} untuk konfirmasi ${label} (${uniqueIds.length} data).`)
  if (String(typed || '').trim().toUpperCase() !== confirmText) { showToast('Konfirmasi dibatalkan.', 'warning'); return null }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sesi login tidak valid.')
  const res = await fetch('/.netlify/functions/super-admin-data-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, menu_key: menuKey, ids: uniqueIds, confirm_text: confirmText })
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok || !result.success) throw new Error(result.error || 'Aksi data gagal.')
  showToast(`${label} selesai: ${result.affected_count || 0} data.`, 'success')
  return result
}

function renderSuperAdminBulkToolbar({ menuKey, filteredRows = [], selectedSelector, selectedLabel = 'Hapus Item Terpilih', filteredLabel = 'Hapus Semua Sesuai Filter', resetAvailable = false }) {
  if (normalizeRole(window.currentUser?.role) !== 'super_admin') return ''
  const count = Array.isArray(filteredRows) ? filteredRows.length : 0
  return `
    <div class="card" style="padding:12px 14px;margin-bottom:12px;border:1px solid #fecaca;background:#fff7f7;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;">
        <div><strong style="color:#991b1b;"><i class="fa fa-shield-halved"></i> Super Admin Bulk Action</strong><div style="font-size:.75rem;color:var(--text-muted);">Data sesuai tampilan/filter saat ini: ${count}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn-danger btn-sm" onclick="window.superAdminRunSelectedAction('${menuKey}','${selectedSelector}','${selectedLabel}')"><i class="fa fa-trash"></i> ${selectedLabel}</button>
          <button type="button" class="btn-danger btn-sm" onclick="window.superAdminRunFilteredAction('${menuKey}','${filteredLabel}')"><i class="fa fa-layer-group"></i> ${filteredLabel}</button>
          <button type="button" class="btn-secondary btn-sm" ${resetAvailable ? '' : 'disabled title="Reset menu ini belum tersedia."'}><i class="fa fa-rotate-left"></i> Reset Data Sesuai Filter</button>
        </div>
      </div>
    </div>`
}

window.superAdminRunSelectedAction = async function(menuKey, selector, label) {
  try {
    const action = menuKey === 'employees' ? 'deactivate_selected' : 'delete_selected'
    await runSuperAdminDataAction({ action, menuKey, ids: getCheckedValues(selector), label })
    await renderUsers()
  } catch (err) { console.error('superAdminRunSelectedAction error:', err); showToast(err.message || 'Aksi gagal.', 'error') }
}

window.superAdminRunFilteredAction = async function(menuKey, label) {
  try {
    const rows = menuKey === 'employees' ? (window._filteredUsers || []) : []
    const action = menuKey === 'employees' ? 'delete_filtered' : 'delete_filtered'
    await runSuperAdminDataAction({ action, menuKey, ids: rows.map(r => r.id), label })
    await renderUsers()
  } catch (err) { console.error('superAdminRunFilteredAction error:', err); showToast(err.message || 'Aksi gagal.', 'error') }
}

function renderUserList(list) {
  const el = document.getElementById('userListContainer')
  if (!el) return
  const users = Array.isArray(list) ? list : []
  if (!users.length) {
    el.innerHTML = `${renderSuperAdminBulkToolbar({ menuKey: 'employees', filteredRows: users, selectedSelector: '.employee-select-checkbox', selectedLabel: 'Non-Aktifkan Terpilih', filteredLabel: 'Non-Aktifkan Semua Sesuai Filter' })}<div class="empty-state"><i class="fa fa-users"></i><p>Belum ada karyawan</p></div>`
    return
  }

  el.innerHTML = renderSuperAdminBulkToolbar({ menuKey: 'employees', filteredRows: users, selectedSelector: '.employee-select-checkbox', selectedLabel: 'Non-Aktifkan Terpilih', filteredLabel: 'Non-Aktifkan Semua Sesuai Filter' }) + users.map(u => {
    const statusAkun = normalizeAccountStatus(u.status_akun)
    const statusKontrak = u.status_kontrak || getStatusKontrak(u.kontrak_berakhir) || '-'
    const cutiTahunan = window._cutiTahunanMap?.[u.id]?.sisa_cuti
    const sisaCuti = cutiTahunan ?? u.sisa_cuti ?? 0
    const loginId = u.username || u.email_internal || u.email || '-'
    const badgeClass = statusAkun === 'Aktif' ? 'badge-green' : 'badge-red'
    const kontrakBadgeClass = statusKontrak === 'berakhir' ? 'badge-red' : statusKontrak === 'akan_berakhir' ? 'badge-yellow' : 'badge-green'
    return `
      <div class="user-item">
        ${normalizeRole(window.currentUser?.role) === 'super_admin' ? `<label style="display:flex;align-items:center;padding-right:4px;"><input type="checkbox" class="employee-select-checkbox" value="${safeText(u.id)}"></label>` : ''}
        <div class="user-avatar" style="background:linear-gradient(135deg,var(--primary),#7c3aed);">
          ${safeText((u.nama_lengkap || '?')[0] || '?')}
        </div>
        <div class="ui-info">
          <div class="ui-name">${safeText(u.nama_lengkap)}</div>
          <div class="ui-email">${safeText(loginId)}</div>
          <div style="font-size:.72rem;color:var(--text-muted);margin-top:3px;display:flex;gap:6px;flex-wrap:wrap;">
            <span><i class="fa fa-briefcase"></i> ${safeText(u.jabatan)}</span>
            <span>· <i class="fa fa-building-user"></i> ${safeText(getDepartmentLabel(u))}</span>
            <span>· <i class="fa fa-building"></i> ${safeText(getOfficeFullLabel(u))}</span>
          </div>
          <div style="font-size:.72rem;color:var(--text-muted);margin-top:3px;display:flex;gap:6px;flex-wrap:wrap;">
            <span>Role: <strong>${safeText(normalizeRole(u.role || 'staff'))}</strong></span>
            <span>· Kontrak: <strong>${safeText(u.jenis_kontrak || '-')}</strong> (${safeText(statusKontrak)})</span>
            <span>· Sisa cuti: <strong>${safeText(sisaCuti)} hari</strong></span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge ${badgeClass}">${safeText(statusAkun)}</span>
          <span class="badge ${kontrakBadgeClass}">${safeText(statusKontrak)}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button type="button" class="action-btn view" title="Detail" onclick="window.openDetailKaryawan('${safeText(u.id)}')">
              <i class="fa fa-eye"></i> Detail
            </button>
            <button type="button" class="action-btn edit" title="Edit" onclick="window.openEditKaryawan('${safeText(u.id)}')">
              <i class="fa fa-pen"></i> Edit
            </button>
          </div>
        </div>
      </div>
    `
  }).join('')
}


/* ================= POPUP MODAL: DETAIL KARYAWAN ================= */
window.openDetailKaryawan = async function(id, activeTab = 'personal') {
  const target = (window._allUsers || []).find(u => u.id === id)
  if (!target) return
  const avatarLetter = safeText((target.nama_lengkap || '?')[0] || '?')
  const roleLabel = safeText(normalizeRole(target.role || 'staff').toUpperCase())
  window._currentDetailEmployeeId = id
  const payrollAllowed = canAccessPayroll(window.currentUser)
  if (activeTab === 'payroll' && !payrollAllowed) activeTab = 'personal'
  const payrollHtml = activeTab === 'payroll' ? await renderEmployeePayroll(target) : ''
  const tabs = ['personal','employment','schedule', ...(payrollAllowed ? ['payroll'] : []), 'documents','history']
  const tabLabels = { personal:'Personal', employment:'Employment', schedule:'Schedule', payroll:'Payroll', documents:'Documents', history:'History' }
  const tabNav = `<div style="display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:12px;">${tabs.map(t => `<button class="${t === activeTab ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="window.openDetailKaryawan('${safeText(id)}','${t}')">${tabLabels[t]}</button>`).join('')}</div>`

  window.showUserModal(`
    <div class="modal-header">
      <h3><i class="fa fa-id-card" style="color:var(--primary);"></i> Kartu Detail Karyawan</h3>
      <button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
    </div>
    <div style="padding: 10px 0; text-align:center; border-bottom: 1px solid var(--border); margin-bottom: 14px;">
       ${target.foto_url
         ? `<img src="${safeText(target.foto_url)}" style="width:70px; height:70px; border-radius:50%; object-fit:cover;" onclick="window.previewImageFullScreen('${safeText(target.foto_url)}')">`
         : `<div class="profile-avatar" style="margin:0 auto 10px;">${avatarLetter.toUpperCase()}</div>`
       }
       <h4 style="margin:6px 0 2px; font-size:1.1rem;">${safeText(target.nama_lengkap)}</h4>
       <span class="badge badge-gray">${roleLabel}</span>
    </div>
    ${tabNav}
    ${activeTab !== 'payroll' ? `<div style="display: flex; flex-direction: column; gap: 10px; font-size: .85rem;">` : `<div>${payrollHtml}</div><div style="display:none;">`}
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Username:</span><strong>${safeText(legacyLoginValue(target.username))}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Email Internal:</span><strong>${safeText(legacyLoginValue(target.email_internal))}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Office:</span><strong>${safeText(getOfficeLabel(target))}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Domain Office:</span><strong>${safeText(getOfficeDomainLabel(target))}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Department:</span><strong>${safeText(getDepartmentLabel(target))}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Email Kontak:</span><strong>${safeText(target.email)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Jabatan:</span><strong>${safeText(target.jabatan)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">No. HP:</span><strong>${safeText(target.no_hp)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Tanggal Bergabung:</span><strong>${safeText(target.tanggal_bergabung)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Masa Kerja:</span><strong>${safeText(formatMasaKerja(hitungMasaKerja(target.tanggal_bergabung)))}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Tanggal Lahir:</span><strong>${safeText(target.tanggal_lahir)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Plot Titik Absen:</span><strong style="color:var(--primary);">📍 ${safeText(target.titik_radius || 'Bebas Radius')}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Status Akun:</span><strong>${safeText(normalizeAccountStatus(target.status_akun))}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Jenis Kontrak:</span><strong>${safeText(target.jenis_kontrak)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Periode Kontrak:</span><strong>${safeText(target.kontrak_mulai)} s/d ${safeText(target.kontrak_berakhir)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Masa / Status Kontrak:</span><strong>${safeText(target.masa_kontrak)} · ${safeText(target.status_kontrak || getStatusKontrak(target.kontrak_berakhir))}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Status Cuti Tahunan:</span><strong>${safeText(window._cutiTahunanMap?.[target.id]?.status || 'BELUM_ELIGIBLE')}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:16px;"><span style="color:var(--text-muted);">Sisa Cuti Tahunan:</span><strong>🌴 ${safeText(window._cutiTahunanMap?.[target.id]?.sisa_cuti || target.sisa_cuti || 0)} Hari</strong></div>
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
  const viewerRole = normalizeRole(me.role)
  const targetMissingOfficeDepartment = !target.client_id || !target.department_id
  const targetMissingLogin = !target.username || !target.email_internal
  const baseCanEditAllFields = (viewerRole === 'super_admin') || (['admin_all','admin_hr','admin'].includes(viewerRole) && normalizeRole(target.role) === 'staff' && canManageUserByDepartment(me, target))
  const canEditAllFields = baseCanEditAllFields && (viewerRole === 'super_admin' || !targetMissingOfficeDepartment)
  const officeEditable = canEditOffice(me) && canEditAllFields
  const departmentEditable = canEditAllFields && canEditDepartmentForEmployee(me)

  let opsiLokasi = ''
  let officeOptions = []
  let departmentOptions = []
  try {
    const lokasiPromise = supabase.from('lokasi_absen').select('nama_titik').order('nama_titik')
    const officePromise = officeEditable
      ? supabase.from('clients').select('id,nama_client,kode_client,domain_login,status').order('nama_client')
      : Promise.resolve({ data: [], error: null })
    const departmentOfficeId = officeEditable ? target.client_id : me.client_id
    const departmentPromise = departmentEditable
      ? fetchDepartmentOptionsForOffice(departmentOfficeId)
        .then(data => ({ data, error: null }))
        .catch(error => ({ data: [], error }))
      : Promise.resolve({ data: [], error: null })

    const [lokasiResult, officeResult, departmentResult] = await Promise.all([lokasiPromise, officePromise, departmentPromise])
    if (lokasiResult.error) throw lokasiResult.error
    if (officeResult.error) throw officeResult.error
    if (departmentResult.error) throw departmentResult.error

    officeOptions = (officeResult.data || []).filter(c => ['active','aktif'].includes(String(c.status || '').toLowerCase()))
    departmentOptions = departmentResult.data || []
    opsiLokasi = (lokasiResult.data || []).map(l => {
      const namaTitik  = (l.nama_titik || '').trim()
      const isSelected = namaTitik.toLowerCase() === (target.titik_radius || '').trim().toLowerCase() ? 'selected' : ''
      return `<option value="${safeText(namaTitik)}" ${isSelected}>${safeText(namaTitik)}</option>`
    }).join('')
  } catch (e) {
    console.error('Gagal memuat opsi form edit karyawan:', e)
    showToast('Sebagian opsi edit karyawan gagal dimuat.', 'warning')
  }

  window._editEmployeeOfficeOptions = officeOptions
  const officeField = officeEditable
    ? `<select id="editOffice" onchange="window.reloadEditEmployeeDepartments(this.value); window.updateEditEmailInternalPreview()"><option value="">-- Pilih Office --</option>${officeOptions.map(c => `<option value="${safeText(c.id)}" ${String(c.id) === String(target.client_id) ? 'selected' : ''}>${safeText(c.nama_client)} (${safeText(c.domain_login || c.kode_client)})</option>`).join('')}</select>`
    : `<input id="editOfficeReadonly" value="${safeText(getOfficeFullLabel(target))}" disabled>`
  const departmentField = departmentEditable
    ? `<select id="editDepartment">${renderDepartmentOptionsForEdit(departmentOptions, target.department_id)}</select>`
    : `<input id="editDepartmentReadonly" value="${safeText(getDepartmentLabel(target))}" disabled>`
  const payrollFields = await renderPayrollEmployeeFields('edit', target, target.client_id)

  window.showUserModal(`
    <div class="modal-header">
      <h3><i class="fa fa-user-pen" style="color:var(--warning);"></i> Edit Data: ${safeText(target.nama_lengkap)}</h3>
      <button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
    </div>

    ${targetMissingOfficeDepartment ? `
      <div class="alert warning" style="margin-bottom:12px;">
        <i class="fa fa-triangle-exclamation"></i>
        ${viewerRole === 'super_admin'
          ? 'Akun lama belum terhubung ke Office/Department. Lengkapi Office dan Department sebelum menyimpan perubahan penting.'
          : 'Akun lama ini harus dilengkapi Office/Department oleh Super Admin terlebih dahulu.'}
      </div>
    ` : ''}
    ${targetMissingLogin ? `
      <div class="alert warning" style="margin-bottom:12px;">
        <i class="fa fa-key"></i> Username/email internal legacy belum diset. Buatkan/rapikan melalui fitur migrasi akun.
      </div>
    ` : ''}

    <div style="text-align:center;padding:14px 0 10px;border-bottom:1px solid var(--border);margin-bottom:14px;">
      <div style="position:relative;display:inline-block;">
        ${target.foto_url
          ? `<img src="${safeText(target.foto_url)}" id="editAvatarPreview" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);" onclick="window.previewImageFullScreen('${safeText(target.foto_url)}')">`
          : `<div class="profile-avatar" id="editAvatarPreview" style="width:64px;height:64px;font-size:1.4rem;display:flex;align-items:center;justify-content:center;">${safeText((target.nama_lengkap || '?')[0] || '?').toUpperCase()}</div>`
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
        <input id="editNama" value="${safeText(target.nama_lengkap)}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Username</label>
        <input id="editUsername" value="${safeText(legacyLoginValue(target.username))}" ${viewerRole === 'super_admin' && canEditAllFields ? 'oninput="window.updateEditEmailInternalPreview()"' : 'disabled'}>
        <small style="font-size:.65rem;color:var(--text-muted);">${viewerRole === 'super_admin' ? 'Mengubah username/Office akan memperbarui email Auth lewat Netlify Function.' : 'Username login hanya dapat diubah oleh Super Admin.'}</small>
      </div>
      <div class="field">
        <label>Email Internal</label>
        <input id="editEmailInternal" value="${safeText(legacyLoginValue(target.email_internal))}" disabled>
        <small id="editEmailInternalPreview" style="font-size:.65rem;color:var(--text-muted);">Preview otomatis mengikuti username + Office.</small>
      </div>
      <div class="field">
        <label>Office</label>
        ${officeField}
      </div>
      <div class="field">
        <label>Domain Office</label>
        <input id="editOfficeDomain" value="${safeText(getOfficeDomainLabel(target))}" disabled>
      </div>
      <div class="field">
        <label>Department</label>
        ${departmentField}
      </div>
      <div class="field">
        <label>Email Kontak</label>
        <input type="email" id="editEmail" value="${safeText(target.email)}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Jabatan</label>
        <input id="editJabatan" value="${safeText(target.jabatan)}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>No. HP</label>
        <input id="editHp" value="${safeText(target.no_hp)}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Tanggal Lahir</label>
        <input type="date" id="editLahir" value="${safeText(target.tanggal_lahir, '')}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Tanggal Bergabung</label>
        <input type="date" id="editTgl" value="${safeText(target.tanggal_bergabung, '')}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Status Akun</label>
        <select id="editStatusAkun" ${canEditAllFields ? '' : 'disabled'}>
          <option value="Aktif"${normalizeAccountStatus(target.status_akun) === 'Aktif' ? ' selected' : ''}>Aktif</option>
          <option value="Non-Aktif"${normalizeAccountStatus(target.status_akun) === 'Non-Aktif' ? ' selected' : ''}>Non-Aktif</option>
        </select>
      </div>
      <div class="field">
        <label>Sisa Cuti</label>
        <input type="number" id="editSisaCuti" min="0" value="${target.sisa_cuti || 0}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field full" style="grid-column:1/-1;">
        <label>URL Foto</label>
        <input id="editFotoUrl" value="${safeText(target.foto_url)}" ${canEditAllFields ? '' : 'disabled'}>
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

      ${payrollFields}

      <div class="field full" style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:10px; margin-top:5px;">
        <label style="color:var(--primary); font-weight:800;"><i class="fa fa-key"></i> Keamanan Akun</label>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:220px;"><input type="password" id="editPassword" placeholder="Password baru minimal 8 karakter" oninput="window.toggleEmployeeResetPasswordButton()"></div>
          <button type="button" id="btnResetPasswordEmployee" class="btn-warning" style="display:none;" onclick="window.resetPasswordFromEmployeeModal('${target.id}', ${isMe})"><i class="fa fa-key"></i> Reset Password</button>
        </div>
        <small style="font-size:.65rem; color:var(--text-muted);">Simpan Data tidak akan mengubah password. Klik Reset Password hanya jika ingin mengganti password.</small>
      </div>
    </div>

    <div class="modal-actions">
      <button type="button" class="btn-secondary" onclick="window.closeUserModal()">Batal</button>
      <button type="button" class="btn-primary" onclick="window.saveEditKaryawan('${target.id}', ${canEditAllFields}, ${isMe})">
        <i class="fa fa-save"></i> Simpan Data
      </button>
    </div>
  `)
  window.updateEditEmailInternalPreview()
  window.toggleEmployeeResetPasswordButton()
}

window.reloadEditEmployeeDepartments = async function(clientId) {
  const departmentSelect = document.getElementById('editDepartment')
  const domainInput = document.getElementById('editOfficeDomain')
  const office = (window._editEmployeeOfficeOptions || []).find(c => String(c.id) === String(clientId))
  if (domainInput) domainInput.value = office?.domain_login || office?.kode_client || '-'
  if (!departmentSelect) return
  departmentSelect.innerHTML = '<option value="">Memuat Department...</option>'
  try {
    const departments = await fetchDepartmentOptionsForOffice(clientId)
    departmentSelect.innerHTML = renderDepartmentOptionsForEdit(departments, '')
    if (!departments.length) showToast('Belum ada Department aktif untuk Office ini.', 'warning')
  } catch (err) {
    console.error('Gagal reload Department edit karyawan:', err)
    departmentSelect.innerHTML = '<option value="">Gagal memuat Department</option>'
    showToast('Gagal memuat Department untuk Office terpilih.', 'error')
  }
}

async function resetEmployeePassword(targetUserId, newPassword) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sesi login tidak valid. Silakan login ulang.')
  const res = await fetch('/.netlify/functions/reset-employee-password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ user_id: targetUserId, new_password: newPassword })
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok || !result.success) throw new Error(result.error || 'Reset password gagal.')
  return result
}


window.toggleEmployeeResetPasswordButton = function() {
  const input = document.getElementById('editPassword')
  const btn = document.getElementById('btnResetPasswordEmployee')
  if (!btn) return
  btn.style.display = input?.value ? 'inline-flex' : 'none'
}

function normalizeOfficeCodeForPreview(code) {
  return String(code || '').trim().toLowerCase().replace(/^@/, '')
}

window.updateEditEmailInternalPreview = function() {
  const username = (document.getElementById('editUsername')?.value || '').trim().toLowerCase()
  const officeId = document.getElementById('editOffice')?.value
  const office = (window._editEmployeeOfficeOptions || []).find(c => String(c.id) === String(officeId))
  const code = normalizeOfficeCodeForPreview(office?.kode_client || office?.domain_login || document.getElementById('editOfficeDomain')?.value)
  const preview = username && code ? `${username}+${code}@gpro.my.id` : (document.getElementById('editEmailInternal')?.value || '-')
  const input = document.getElementById('editEmailInternal')
  const hint = document.getElementById('editEmailInternalPreview')
  if (input && username && code) input.value = preview
  if (hint) hint.textContent = `Preview: ${preview}`
}

async function updateEmployeeLoginIdentity(userId, username, clientId, departmentId = '') {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sesi login tidak valid. Silakan login ulang.')
  const res = await fetch('/.netlify/functions/update-employee-login-identity', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ user_id: userId, username, client_id: clientId, department_id: departmentId })
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok || !result.success) throw new Error(result.error || 'Gagal memperbarui username/Office login.')
  return result
}

window.resetPasswordFromEmployeeModal = async function(id, isMe) {
  const passwordInput = document.getElementById('editPassword')
  const newPassword = passwordInput?.value || ''
  if (newPassword.length < 8) {
    showToast('Password minimal 8 karakter', 'warning')
    passwordInput?.focus()
    return
  }
  const btn = document.getElementById('btnResetPasswordEmployee')
  const oldHtml = btn?.innerHTML
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...' }
  try {
    if (isMe) {
      const { error: passErr } = await supabase.auth.updateUser({ password: newPassword })
      if (passErr) throw passErr
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) await supabase.from('profiles').update({ must_change_password: false, password_changed_at: new Date().toISOString() }).eq('id', user.id)
    } else {
      await resetEmployeePassword(id, newPassword)
    }
    passwordInput.value = ''
    window.toggleEmployeeResetPasswordButton()
    showToast('Password berhasil diperbarui.', 'success')
  } catch (err) {
    console.error('resetPasswordFromEmployeeModal error:', err)
    showToast('Gagal reset password: ' + (err.message || err), 'error')
    passwordInput?.focus()
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldHtml || '<i class="fa fa-key"></i> Reset Password' }
  }
}

/* ================= SIMPAN HASIL MODAL EDIT KARYAWAN ================= */
window.saveEditKaryawan = async function(id, canEditAll, isMe) {
  const selectEl       = document.getElementById('editTitikRadius')
  const titikRadiusBaru = selectEl ? (selectEl.value || null) : null

  try {
    const targetProfile = (window._allUsers || []).find(u => u.id === id) || null
    assertSameDepartment(window.currentUser, targetProfile)
    if (canEditAll) {
      const kontrakPayload = readKontrakForm('edit')
      if (!validateKontrakPayload(kontrakPayload)) return
      const role = normalizeRole(window.currentUser?.role)
      const selectedOfficeId = role === 'super_admin' ? document.getElementById('editOffice')?.value || null : targetProfile?.client_id || null
      const selectedDepartmentId = canEditDepartmentForEmployee(window.currentUser) ? document.getElementById('editDepartment')?.value || null : targetProfile?.department_id || null
            const payrollPayload = readPayrollEmployeePayload('edit')
      console.log('DEBUG payrollPayload (edit):', payrollPayload)
      showToast('DEBUG: ' + JSON.stringify(payrollPayload), 'warning')

      const updatePayload = {
        nama_lengkap:  document.getElementById('editNama')?.value.trim()    || '',
        email:         document.getElementById('editEmail')?.value.trim()   || null,
        jabatan:       document.getElementById('editJabatan')?.value.trim() || '',
        no_hp:         document.getElementById('editHp')?.value.trim()      || '',
        tanggal_lahir: document.getElementById('editLahir')?.value          || null,
        tanggal_bergabung: document.getElementById('editTgl')?.value       || null,
        status_akun:   normalizeAccountStatus(document.getElementById('editStatusAkun')?.value),
        sisa_cuti:     Math.max(0, Number.parseInt(document.getElementById('editSisaCuti')?.value || '0', 10) || 0),
        foto_url:      document.getElementById('editFotoUrl')?.value.trim() || '',
        titik_radius:  titikRadiusBaru,
        ...kontrakPayload,
        ...payrollPayload
      }

      if (role === 'super_admin') {
        if (!selectedOfficeId) { showToast('Office wajib dipilih.', 'warning'); return }
        const { data: office, error: officeErr } = await supabase.from('clients').select('id,nama_client,kode_client,domain_login,status').eq('id', selectedOfficeId).maybeSingle()
        if (officeErr) throw officeErr
        if (!office || !['active','aktif'].includes(String(office.status || '').toLowerCase())) { showToast('Office tidak valid atau nonaktif.', 'warning'); return }
        const nextUsername = document.getElementById('editUsername')?.value.trim().toLowerCase() || ''
        const identityChanged = nextUsername !== String(targetProfile?.username || '').toLowerCase() || String(office.id) !== String(targetProfile?.client_id || '')
        if (identityChanged) {
          const identity = await updateEmployeeLoginIdentity(id, nextUsername, office.id, selectedDepartmentId)
          updatePayload.username = identity.username
          updatePayload.email_internal = identity.email_internal
        }
        updatePayload.client_id = office.id
      }

      if (canEditDepartmentForEmployee(window.currentUser)) {
        if (!selectedDepartmentId) { showToast('Department wajib dipilih.', 'warning'); return }
        const departmentOfficeId = role === 'super_admin' ? selectedOfficeId : window.currentUser?.client_id
        const { data: selectedDepartment, error: deptErr } = await supabase
          .from('departments')
          .select('id,nama_department,client_id,status')
          .eq('id', selectedDepartmentId)
          .eq('client_id', departmentOfficeId)
          .maybeSingle()
        if (deptErr) throw deptErr
        if (!selectedDepartment || !['active','aktif'].includes(String(selectedDepartment.status || '').toLowerCase())) { showToast('Department tidak valid untuk Office yang dipilih.', 'warning'); return }
        if (!(await validatePayrollEmployeePayload(payrollPayload, selectedDepartment.client_id))) return
        updatePayload.department_id = selectedDepartment.id
        updatePayload.departemen = selectedDepartment.nama_department
      } else {
        if (!(await validatePayrollEmployeePayload(payrollPayload, targetProfile?.client_id))) return
        updatePayload.departemen = targetProfile?.departemen || getDepartmentLabel(targetProfile)
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

    // Update data cache lokal window agar UI sinkron instan
    const userIndex = (window._allUsers || []).findIndex(u => u.id === id)
    if (userIndex !== -1 && canEditAll) {
      window._allUsers[userIndex].nama_lengkap  = document.getElementById('editNama')?.value.trim()    || ''
      window._allUsers[userIndex].jabatan       = document.getElementById('editJabatan')?.value.trim() || ''
      window._allUsers[userIndex].no_hp         = document.getElementById('editHp')?.value.trim()      || ''
      window._allUsers[userIndex].tanggal_lahir = document.getElementById('editLahir')?.value          || null
      window._allUsers[userIndex].tanggal_bergabung = document.getElementById('editTgl')?.value       || null
      window._allUsers[userIndex].titik_radius  = titikRadiusBaru
      Object.assign(window._allUsers[userIndex], readKontrakForm('edit'))
      Object.assign(window._allUsers[userIndex], readPayrollEmployeePayload('edit'))
    }

    if (isMe && window.currentUser) {
      if (canEditAll) {
        window.currentUser.nama_lengkap  = document.getElementById('editNama')?.value.trim()    || ''
        window.currentUser.jabatan       = document.getElementById('editJabatan')?.value.trim() || ''
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
  }

  const idx = (window._allUsers || []).findIndex(u => u.id === targetUserId)
  if (idx !== -1) window._allUsers[idx].foto_url = foto_url

  if (statusEl) statusEl.innerHTML = '<i class="fa fa-check" style="color:var(--success);"></i> Foto diperbarui!'
}

/* ===============================================================
   UPLOAD KARYAWAN MASSAL VIA EXCEL
   Akun dibuat server-side via Netlify Function menggunakan username dan password awal.
=============================================================== */
const EMPLOYEE_UPLOAD_REQUIRED_COLUMNS = ['Nama Lengkap','Username','Password Awal','Office','Kode Office','Department','Jabatan','Role','Tanggal Bergabung','Jenis Kontrak','Kontrak Mulai','Durasi Kontrak','Satuan Durasi Kontrak']
const EMPLOYEE_UPLOAD_OPTIONAL_COLUMNS = ['No HP','Tanggal Lahir','Titik Radius','Sisa Cuti Awal','Foto URL']
const EMPLOYEE_UPLOAD_ROLES = ['admin_all','admin_hr','admin','staff']
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/

window.downloadTemplateKaryawan = function() {
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum siap. Coba lagi sebentar.', 'warning'); return }
  const header = [...EMPLOYEE_UPLOAD_REQUIRED_COLUMNS, ...EMPLOYEE_UPLOAD_OPTIONAL_COLUMNS]
  const ws = XLSX.utils.aoa_to_sheet([
    header,
    ['Budi Santoso','budi01','Demo12345!','Office A','kantora','Housekeeping','Staff HK','staff','2026-06-20','kontrak','2026-06-20','12','bulan','081234567890','1995-06-15','','12',''],
    ['Siti Aminah','siti01','Demo12345!','Office A','kantora','HRD','Admin HR','admin_hr','2026-06-20','tetap','2026-06-20','12','bulan','','','','0','']
  ])
  ws['!cols'] = header.map(h => ({ wch: Math.max(14, h.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template Karyawan')
  XLSX.writeFile(wb, 'template_upload_karyawan_office.xlsx')
}

function getRowValueCaseInsensitive(row, ...keys) {
  const entries = Object.entries(row || {})
  for (const key of keys) {
    const found = entries.find(([k]) => String(k).trim().toLowerCase() === String(key).trim().toLowerCase())
    if (found && found[1] !== undefined && found[1] !== null) return String(found[1]).trim()
  }
  return ''
}
function isValidDateString(v) { if (!v) return false; const d = new Date(v); return !Number.isNaN(d.getTime()) }
function normalizeOfficeCode(v) { return String(v || '').trim().toLowerCase().replace(/^@/, '') }
function buildInternalEmail(username, officeCode) { return `${username}+${normalizeOfficeCode(officeCode)}@gpro.my.id` }

async function loadEmployeeUploadLookups() {
  const [clientsRes, departmentsRes, profilesRes] = await Promise.all([
    supabase.from('clients').select('id,nama_client,kode_client,domain_login,status').eq('status', 'active'),
    supabase.from('departments').select('id,client_id,nama_department,status').eq('status', 'active'),
    supabase.from('profiles').select('id,username,email_internal,client_id')
  ])
  if (clientsRes.error) throw clientsRes.error
  if (departmentsRes.error) throw departmentsRes.error
  if (profilesRes.error) throw profilesRes.error
  return { clients: clientsRes.data || [], departments: departmentsRes.data || [], profiles: profilesRes.data || [] }
}

window.handleUploadKaryawanExcel = function(input) {
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum siap.', 'warning'); return }
  const role = normalizeRole(window.currentUser?.role)
  if (!['super_admin','admin_hr'].includes(role)) { showToast('Upload karyawan hanya untuk Super Admin dan Admin HR.', 'warning'); input.value = ''; return }
  const file = input.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async function(e) {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (!rows.length) { showToast('File Excel kosong atau format tidak sesuai.', 'warning'); return }
      const lookups = await loadEmployeeUploadLookups()
      const clientByCode = new Map()
      lookups.clients.forEach(c => { clientByCode.set(normalizeOfficeCode(c.kode_client), c); clientByCode.set(normalizeOfficeCode(c.domain_login), c) })
      const existingUsernames = new Set((lookups.profiles || []).map(p => `${p.client_id}|${String(p.username || '').toLowerCase()}`))
      const existingEmails = new Set((lookups.profiles || []).map(p => String(p.email_internal || '').toLowerCase()).filter(Boolean))
      const seen = new Set()
      const parsed = rows.map((row, i) => {
        const errors = []
        const nama = getRowValueCaseInsensitive(row, 'Nama Lengkap', 'Nama')
        const username = getRowValueCaseInsensitive(row, 'Username', 'Username Login').toLowerCase()
        const passwordAwal = getRowValueCaseInsensitive(row, 'Password Awal', 'Password')
        const kodeOfficeRaw = getRowValueCaseInsensitive(row, 'Kode Office', 'Kode Kantor', 'Kode Client')
        const deptName = getRowValueCaseInsensitive(row, 'Department', 'Departemen')
        const jabatan = getRowValueCaseInsensitive(row, 'Jabatan')
        const targetRole = normalizeRole(getRowValueCaseInsensitive(row, 'Role'))
        const tanggalBergabung = getRowValueCaseInsensitive(row, 'Tanggal Bergabung')
        const jenisKontrak = getRowValueCaseInsensitive(row, 'Jenis Kontrak')
        const kontrakMulai = getRowValueCaseInsensitive(row, 'Kontrak Mulai')
        const durasiKontrak = getRowValueCaseInsensitive(row, 'Durasi Kontrak')
        const satuan = getRowValueCaseInsensitive(row, 'Satuan Durasi Kontrak').toLowerCase() || 'bulan'
        if (!nama) errors.push('Nama Lengkap wajib')
        if (!USERNAME_RE.test(username)) errors.push('Username wajib 3-40 karakter huruf kecil/angka/titik/underscore/strip')
        if (passwordAwal.length < 8) errors.push('Password Awal minimal 8 karakter')
        if (!EMPLOYEE_UPLOAD_ROLES.includes(targetRole)) errors.push(targetRole === 'super_admin' ? 'Role super_admin ditolak' : 'Role tidak valid')
        if (!jabatan) errors.push('Jabatan wajib')
        if (!tanggalBergabung || !isValidDateString(tanggalBergabung)) errors.push('Tanggal Bergabung tidak valid')
        if (!jenisKontrak) errors.push('Jenis Kontrak wajib')
        if (!kontrakMulai || !isValidDateString(kontrakMulai)) errors.push('Kontrak Mulai tidak valid')
        if (!durasiKontrak || Number.isNaN(Number(durasiKontrak))) errors.push('Durasi Kontrak harus angka')
        if (!['bulan','tahun'].includes(satuan)) errors.push('Satuan Durasi Kontrak hanya bulan/tahun')
        let client = null
        if (role === 'admin_hr') {
          client = lookups.clients.find(c => String(c.id) === String(window.currentUser?.client_id)) || null
          if (kodeOfficeRaw && client && ![client.kode_client, client.domain_login].map(normalizeOfficeCode).includes(normalizeOfficeCode(kodeOfficeRaw))) errors.push('Admin HR tidak boleh upload ke Office lain')
          if (!['admin','staff'].includes(targetRole)) errors.push('Admin HR hanya boleh membuat role admin atau staff')
        } else {
          if (!kodeOfficeRaw) errors.push('Kode Office wajib untuk Super Admin')
          client = clientByCode.get(normalizeOfficeCode(kodeOfficeRaw)) || null
        }
        if (!client) errors.push('Office/Kode Office tidak valid')
        const department = client ? lookups.departments.find(d => String(d.client_id) === String(client.id) && String(d.nama_department || '').trim().toLowerCase() === deptName.toLowerCase()) : null
        if (!department) errors.push('Department tidak valid dalam Office')
        const emailInternal = client ? buildInternalEmail(username, client.kode_client) : ''
        const uniqueKey = `${client?.id}|${username}`
        if (client && existingUsernames.has(uniqueKey)) errors.push('Username sudah dipakai di Office ini')
        if (emailInternal && existingEmails.has(emailInternal.toLowerCase())) errors.push('Email internal sudah dipakai')
        if (seen.has(uniqueKey)) errors.push('Username duplikat di file untuk Office yang sama')
        seen.add(uniqueKey)
        const kontrakPayload = buildKontrakPayload({ jenisKontrak, kontrakMulai, durasiKontrak, satuanDurasiKontrak: satuan })
        return { _index: i + 2, nama_lengkap: nama, username, password_awal: passwordAwal, office: client?.nama_client || getRowValueCaseInsensitive(row, 'Office'), kode_office: client?.kode_client || kodeOfficeRaw, client_id: client?.id || null, department_id: department?.id || null, departemen: department?.nama_department || deptName, jabatan, role: targetRole, tanggal_bergabung: tanggalBergabung, no_hp: getRowValueCaseInsensitive(row, 'No HP'), tanggal_lahir: getRowValueCaseInsensitive(row, 'Tanggal Lahir') || null, titik_radius: getRowValueCaseInsensitive(row, 'Titik Radius') || null, sisa_cuti: Number(getRowValueCaseInsensitive(row, 'Sisa Cuti Awal') || 0) || 0, foto_url: getRowValueCaseInsensitive(row, 'Foto URL') || '', ...kontrakPayload, valid: errors.length === 0, errMsg: errors.join('; ') }
      })
      window._uploadKaryawanParsed = parsed
      renderPreviewUploadKaryawan(parsed)
    } catch(err) {
      console.error('handleUploadKaryawanExcel error:', err)
      showToast('Gagal membaca/validasi Excel: ' + err.message, 'error')
    } finally { input.value = '' }
  }
  reader.readAsArrayBuffer(file)
}

function renderPreviewUploadKaryawan(rows) {
  const wrap = document.getElementById('previewUploadKaryawanWrap')
  if (!wrap) return
  const valid = rows.filter(r => r.valid), invalid = rows.filter(r => !r.valid)
  wrap.style.display = 'block'
  wrap.innerHTML = `<div class="card fade-up" style="border:1.5px solid var(--primary); padding:16px;"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;"><div><h3 style="font-size:.9rem;font-weight:800;color:var(--primary);margin:0 0 4px;"><i class="fa fa-table"></i> Preview Upload Excel Karyawan</h3><p style="font-size:.78rem;color:var(--text-muted);margin:0;">${valid.length} valid ${invalid.length ? `· <span style="color:var(--danger);">${invalid.length} baris bermasalah</span>` : ''} · Karyawan akan dibuatkan akun login oleh sistem menggunakan username dan password awal.</p></div><div style="display:flex;gap:8px;"><button class="btn-secondary btn-sm" onclick="window.batalUploadKaryawan()"><i class="fa fa-times"></i> Batal</button>${valid.length ? `<button class="btn-success btn-sm" onclick="window.konfirmasiUploadKaryawan()" ${invalid.length ? 'disabled title="Perbaiki baris invalid terlebih dahulu"' : ''}><i class="fa fa-check"></i> Buat ${valid.length} Akun</button>` : ''}</div></div><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.78rem;"><thead><tr style="background:var(--gray-50);"><th>Baris</th><th>Nama</th><th>Username</th><th>Office</th><th>Department</th><th>Role</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr style="border-bottom:1px solid var(--border);${!r.valid ? 'background:#fff5f5;' : ''}"><td style="padding:7px 10px;">${r._index}</td><td style="padding:7px 10px;font-weight:700;">${safeText(r.nama_lengkap)}</td><td style="padding:7px 10px;">${safeText(r.username)}</td><td style="padding:7px 10px;">${safeText(r.office)} (${safeText(r.kode_office)})</td><td style="padding:7px 10px;">${safeText(r.departemen)}</td><td style="padding:7px 10px;"><span class="badge badge-gray">${safeText(r.role)}</span></td><td style="padding:7px 10px;">${r.valid ? '<span class="badge badge-green"><i class="fa fa-check"></i> Valid</span>' : `<span class="badge badge-red"><i class="fa fa-times"></i> ${safeText(r.errMsg)}</span>`}</td></tr>`).join('')}</tbody></table></div></div>`
}

window.batalUploadKaryawan = function() { const wrap = document.getElementById('previewUploadKaryawanWrap'); if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = '' }; window._uploadKaryawanParsed = null }

window.konfirmasiUploadKaryawan = async function() {
  const rows = window._uploadKaryawanParsed || []
  if (!rows.length) return
  const invalid = rows.filter(r => !r.valid)
  if (invalid.length) { showToast('Masih ada baris invalid. Tidak ada akun yang dibuat.', 'warning'); return }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/.netlify/functions/bulk-create-employee-accounts', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ employees: rows }) })
    const result = await res.json().catch(() => ({}))
    if (!res.ok || !result.success) throw new Error(result.error || 'Bulk create gagal')
    window.batalUploadKaryawan()
    showToast(`${result.created_count || rows.length} akun karyawan berhasil dibuat`, 'success')
    await renderUsers()
  } catch (err) {
    console.error('konfirmasiUploadKaryawan error:', err)
    showToast('Gagal membuat akun massal: ' + err.message, 'error')
  }
}

/* ================= TOGGLE AKTIF / NON-AKTIF KARYAWAN ================= */
window.toggleStatusUser = async function(userId, statusSekarang) {
  const targetProfile = (window._allUsers || []).find(u => u.id === userId) || null
  try { assertSameDepartment(window.currentUser, targetProfile) } catch (err) { showToast(err.message, 'error'); return }
  const statusBaru = normalizeAccountStatus(statusSekarang) === 'Aktif' ? 'Non-Aktif' : 'Aktif'
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
