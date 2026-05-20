import { supabase } from './supabase.js'
import { getProfile } from './users.js'
import { login as doLogin, signup as doSignup, logout } from './auth.js'
import { renderDashboard } from './dashboard.js'
import { renderAbsensi } from './ui.js'
import { renderShiftManagement } from './shift.js'
import { renderJadwalManagement } from './jadwal.js'
import { renderRiwayat } from './riwayat.js'
import { renderPengajuan } from './pengajuan.js'
import { renderKalenderHR } from './kalender.js'
import { hitungMasaKerja, formatMasaKerja, getSisaCuti, hitungJatahCuti, resetCutiKaryawan } from './cuti.js'

/* ================= GLOBAL STATE ================= */
window.currentUser  = null
window.currentShift = null
window.supabase     = supabase

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark')
    const icon = document.getElementById('themeIcon')
    if (icon) icon.className = 'fa fa-sun'
  }
  checkUser()
})

/* ================= CHECK USER ================= */
async function checkUser() {
  const loginPage = document.getElementById('loginPage')
  const appPage   = document.getElementById('appPage')

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    loginPage.style.display = 'flex'
    appPage.style.display   = 'none'
    return
  }

  const profile = await getProfile(user.id)
  if (!profile) {
    loginPage.style.display = 'flex'
    appPage.style.display   = 'none'
    return
  }

  window.currentUser = profile
  loginPage.style.display = 'none'
  appPage.style.display   = 'block'

  const userNameEl = document.getElementById('userName')
  if (userNameEl) userNameEl.innerText = profile.nama_lengkap || user.email

  renderMenu(profile.role)
  renderBottomNav(profile.role)
  navigate('dashboard')
}
window.checkUser = checkUser

/* ================= LOGIN ================= */
window.login = async function () {
  const email    = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  const errEl    = document.getElementById('loginError')
  if (errEl) errEl.style.display = 'none'

  const ok = await doLogin(email, password)
  if (ok) await checkUser()
}

/* ================= SIGNUP ================= */
window.signup = async function () {
  const email    = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  await doSignup(email, password, 'staff')
}

/* ================= LOGOUT ================= */
window.logout = logout

/* ================= MENU SIDEBAR ================= */
function renderMenu(role) {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return

  let menu = []

  if (role === 'staff') {
    menu = [
      { key: 'dashboard',  name: 'Dashboard',  icon: 'fa-house' },
      { key: 'absensi',    name: 'Absensi',    icon: 'fa-clock' },
      { key: 'pengajuan',  name: 'Pengajuan',  icon: 'fa-file-alt' },
      { key: 'riwayat',    name: 'Riwayat',    icon: 'fa-list' },
      { key: 'kalender',   name: 'Kalender',   icon: 'fa-calendar-alt' },
      { key: 'profile',    name: 'Profil Saya',icon: 'fa-user' },
    ]
  }

  if (role === 'admin') {
    menu = [
      { key: 'dashboard',  name: 'Dashboard',  icon: 'fa-house' },
      { key: 'absensi',    name: 'Absensi',    icon: 'fa-clock' },
      { key: 'shift',      name: 'Shift',      icon: 'fa-calendar' },
      { key: 'jadwal',     name: 'Jadwal',     icon: 'fa-calendar-days' },
      { key: 'pengajuan',  name: 'Approval',   icon: 'fa-inbox' },
      { key: 'users',      name: 'Karyawan',   icon: 'fa-users' },
      { key: 'riwayat',    name: 'Riwayat',    icon: 'fa-list' },
      { key: 'kalender',   name: 'Kalender',   icon: 'fa-calendar' },
    ]
  }

  if (role === 'super_admin') {
    menu = [
      { key: 'dashboard',  name: 'Dashboard',      icon: 'fa-house' },
      { key: 'absensi',    name: 'Absensi',         icon: 'fa-clock' },
      { key: 'shift',      name: 'Shift',           icon: 'fa-calendar' },
      { key: 'jadwal',     name: 'Jadwal',          icon: 'fa-calendar-days' },
      { key: 'pengajuan',  name: 'Approval',        icon: 'fa-inbox' },
      { key: 'users',      name: 'Karyawan',        icon: 'fa-users' },
      { key: 'riwayat',    name: 'Riwayat',         icon: 'fa-list' },
      { key: 'kalender',   name: 'Kalender',        icon: 'fa-calendar' },
    ]
  }

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sb-name">GENIUS HR</div>
      <div class="sb-role">${(role || '').replace('_', ' ').toUpperCase()}</div>
    </div>
    <nav class="sidebar-nav">
      ${menu.map(m => `
        <a href="#" id="menu-${m.key}" onclick="navigate('${m.key}'); closeSidebar(); return false;">
          <i class="fa ${m.icon}"></i> ${m.name}
        </a>`).join('')}
    </nav>
  `
}

/* ================= BOTTOM NAV (mobile) ================= */
function renderBottomNav(role) {
  const nav = document.getElementById('bottomNav')
  if (!nav) return

  // Staff: Dashboard, Absensi, Profil
  // Admin: Dashboard, Absensi, Approval, Karyawan
  let items = []

  if (role === 'staff') {
    items = [
      { key: 'dashboard', icon: 'fa-house',     label: 'Home' },
      { key: 'absensi',   icon: 'fa-clock',     label: 'Absen' },
      { key: 'profile',   icon: 'fa-user',      label: 'Profil' },
    ]
  } else {
    items = [
      { key: 'dashboard', icon: 'fa-house',     label: 'Home' },
      { key: 'absensi',   icon: 'fa-clock',     label: 'Absen' },
      { key: 'pengajuan', icon: 'fa-inbox',     label: 'Approval' },
      { key: 'users',     icon: 'fa-users',     label: 'Karyawan' },
    ]
  }

  nav.innerHTML = items.map(i => `
    <button class="bottom-nav-item" id="bnav-${i.key}" onclick="navigate('${i.key}')">
      <i class="fa ${i.icon}"></i>
      <span>${i.label}</span>
    </button>`).join('')
}

/* ================= NAVIGATE ================= */
window.navigate = async function (page) {
  if (!window.currentUser) { alert('Silakan login dulu'); return }

  // Highlight sidebar
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'))
  const activeLink = document.getElementById(`menu-${page}`)
  if (activeLink) activeLink.classList.add('active')

  // Highlight bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'))
  const activeBnav = document.getElementById(`bnav-${page}`)
  if (activeBnav) activeBnav.classList.add('active')

  switch (page) {
    case 'dashboard': renderDashboard(); break
    case 'absensi':   renderAbsensi(window.currentUser); break
    case 'shift':     renderShiftManagement(); break
    case 'jadwal':    renderJadwalManagement(); break
    case 'pengajuan': renderPengajuan(window.currentUser); break
    case 'riwayat':   renderRiwayat(window.currentUser); break
    case 'kalender':  renderKalenderHR(); break
    case 'profile':   renderProfile(); break
    case 'users':     await renderUsers(); break
    default:
      document.getElementById('content').innerHTML = `<div class="card"><h2>${page}</h2></div>`
  }
}

/* ================= PROFILE PAGE ================= */
function renderProfile() {
  const content = document.getElementById('content')
  const u = window.currentUser
  const masaKerja = hitungMasaKerja(u.tanggal_bergabung)

  content.innerHTML = `
    <div style="max-width:520px;margin:0 auto;">

      <div class="profile-card fade-up">
        <div class="profile-avatar">${(u.nama_lengkap||u.email||'?')[0].toUpperCase()}</div>
        <div class="profile-name">${u.nama_lengkap || '-'}</div>
        <div class="profile-role">${(u.role||'').replace('_',' ')}</div>
      </div>

      <div class="card fade-up-1">
        <div class="card-title"><i class="fa fa-id-card"></i> Informasi Pribadi</div>
        ${infoRow('Email', u.email || '-')}
        ${infoRow('Jabatan', u.jabatan || '-')}
        ${infoRow('Departemen', u.departemen || '-')}
        ${infoRow('No. HP', u.no_hp || '-')}
        ${infoRow('Status', `<span class="badge ${u.status_akun==='Aktif'?'badge-green':'badge-red'}">${u.status_akun||'Aktif'}</span>`)}
      </div>

      <div class="card fade-up-2">
        <div class="card-title"><i class="fa fa-briefcase"></i> Info Kerja</div>
        ${infoRow('Bergabung Sejak', u.tanggal_bergabung || '-')}
        ${infoRow('Masa Kerja', formatMasaKerja(masaKerja))}
        ${infoRow('Role', u.role || '-')}
      </div>

      <div class="card fade-up-3" id="cutiProfileCard">
        <div class="card-title"><i class="fa fa-umbrella-beach"></i> Info Cuti</div>
        <p style="color:var(--text-muted);font-size:.82rem;">Memuat...</p>
      </div>

      <div class="card fade-up-3">
        <div class="card-title"><i class="fa fa-lock"></i> Keamanan</div>
        <button class="btn-danger" onclick="logout()">
          <i class="fa fa-sign-out-alt"></i> Keluar dari Aplikasi
        </button>
      </div>

    </div>
  `

  // Load cuti async
  getSisaCuti(u.id, u.tanggal_bergabung).then(({ jatah, terpakai, sisa }) => {
    const el = document.getElementById('cutiProfileCard')
    if (!el) return
    el.innerHTML = `
      <div class="card-title"><i class="fa fa-umbrella-beach"></i> Info Cuti</div>
      ${infoRow('Jatah Cuti Tahunan', `${jatah} hari`)}
      ${infoRow('Cuti Terpakai', `<span style="color:var(--warning);font-weight:700;">${terpakai} hari</span>`)}
      ${infoRow('Sisa Cuti', `<span style="color:${sisa<0?'var(--danger)':'var(--success)'};font-weight:800;">${sisa} hari${sisa<0?' (minus)':''}</span>`)}
      <button class="btn-primary btn-sm" onclick="navigate('pengajuan')" style="margin-top:12px;">
        <i class="fa fa-plus"></i> Ajukan Cuti
      </button>
    `
  })
}

function infoRow(label, value) {
  return `
    <div class="info-row">
      <div class="ir-label">${label}</div>
      <div class="ir-val">${value}</div>
    </div>`
}

/* ================= USERS / KARYAWAN PAGE ================= */
async function renderUsers() {
  const content   = document.getElementById('content')
  const canAdmin  = window.currentUser.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-users"></i> Manajemen Karyawan</h2>
      <button class="btn-primary btn-sm" onclick="toggleFormTambah()">
        <i class="fa fa-plus"></i> Tambah Karyawan
      </button>
    </div>

    <!-- FORM TAMBAH (hidden by default) -->
    <div id="formTambahWrap" style="display:none;" class="card fade-up">
      <div class="card-title"><i class="fa fa-user-plus"></i> Tambah Karyawan Baru</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label>Nama Lengkap <span class="req">*</span></label>
          <input id="newNama" placeholder="Nama lengkap"></div>
        <div class="field"><label>Email <span class="req">*</span></label>
          <input id="newEmail" type="email" placeholder="email@company.com"></div>
        <div class="field"><label>Password <span class="req">*</span></label>
          <input id="newPassword" type="password" placeholder="Min. 6 karakter"></div>
        <div class="field"><label>Jabatan</label>
          <input id="newJabatan" placeholder="Jabatan / posisi"></div>
        <div class="field"><label>Departemen</label>
          <input id="newDept" placeholder="Nama departemen"></div>
        <div class="field"><label>No. HP</label>
          <input id="newHp" placeholder="08xxxxxxxxxx"></div>
        <div class="field"><label>Tanggal Bergabung <span class="req">*</span></label>
          <input id="newTgl" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="field"><label>Role</label>
          <select id="newRole">
            <option value="staff">Staff</option>
            ${canAdmin ? `<option value="admin">Admin</option><option value="super_admin">Super Admin</option>` : ''}
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-secondary" onclick="toggleFormTambah()">Batal</button>
        <button class="btn-primary" onclick="createProfile()"><i class="fa fa-save"></i> Simpan</button>
      </div>
    </div>

    <!-- SEARCH + FILTER -->
    <div class="card fade-up-1" style="padding:14px 18px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="search-box" style="flex:2;min-width:180px;margin:0;">
          <i class="fa fa-search"></i>
          <input id="searchUser" placeholder="Cari nama atau email..." oninput="filterUsers()">
        </div>
        <select id="filterStatus" onchange="filterUsers()"
          style="flex:1;min-width:120px;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;">
          <option value="">Semua Status</option>
          <option value="Aktif">Aktif</option>
          <option value="Non-Aktif">Non-Aktif</option>
        </select>
      </div>
    </div>

    <!-- LIST -->
    <div id="userListContainer" class="fade-up-2">
      <div class="card" style="text-align:center;padding:24px;">
        <i class="fa fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i>
      </div>
    </div>
  `

  // Load users
  const { data: users } = await supabase.from('profiles').select('*').order('nama_lengkap')
  window._allUsers = users || []

  // Load cuti terpakai semua user
  const tahunIni = new Date().getFullYear()
  const { data: cutiData } = await supabase.from('pengajuan').select('user_id, jumlah_hari')
    .eq('jenis', 'cuti').eq('status', 'approved').gte('tanggal_pengajuan', `${tahunIni}-01-01`)

  window._cutiMap = {}
  ;(cutiData || []).forEach(c => {
    window._cutiMap[c.user_id] = (window._cutiMap[c.user_id] || 0) + (parseInt(c.jumlah_hari) || 0)
  })

  renderUserList(window._allUsers)

  window.toggleFormTambah = function () {
    const el = document.getElementById('formTambahWrap')
    el.style.display = el.style.display === 'none' ? 'block' : 'none'
  }

  window.filterUsers = function () {
    const q      = document.getElementById('searchUser').value.toLowerCase()
    const status = document.getElementById('filterStatus').value
    const filtered = window._allUsers.filter(u =>
      (u.nama_lengkap || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    ).filter(u => !status || u.status_akun === status)
    renderUserList(filtered)
  }
}

function renderUserList(users) {
  const el = document.getElementById('userListContainer')
  if (!el) return

  if (!users.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa fa-users"></i><p>Tidak ada karyawan ditemukan</p></div>`
    return
  }

  el.innerHTML = users.map(u => {
    const masaKerja  = hitungMasaKerja(u.tanggal_bergabung)
    const jatah      = hitungJatahCuti(u.tanggal_bergabung)
    const terpakai   = (window._cutiMap || {})[u.id] || 0
    const sisa       = jatah - terpakai
    const isAktif    = u.status_akun !== 'Non-Aktif'

    return `
      <div class="user-item ${!isAktif ? 'opacity-50' : ''}">
        <div class="user-avatar" style="${!isAktif ? 'background:var(--gray-300);' : ''}">
          ${(u.nama_lengkap || u.email || '?')[0].toUpperCase()}
        </div>
        <div class="ui-info">
          <div class="ui-name">${u.nama_lengkap || '-'}</div>
          <div class="ui-email">
            ${u.email}
            <span class="badge badge-${u.role==='super_admin'?'red':u.role==='admin'?'blue':'gray'}" style="margin-left:6px;">
              ${u.role || 'staff'}
            </span>
          </div>
          <div style="font-size:.72rem;color:var(--text-muted);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap;">
            <span>📅 ${u.tanggal_bergabung || '-'}</span>
            <span>⏳ ${formatMasaKerja(masaKerja)}</span>
            ${u.jabatan ? `<span>💼 ${u.jabatan}</span>` : ''}
            <span style="color:${sisa<0?'var(--danger)':sisa===0?'var(--warning)':'var(--success)'};">
              🌴 Cuti ${sisa}/${jatah}
            </span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge ${isAktif ? 'badge-green' : 'badge-red'}">${u.status_akun || 'Aktif'}</span>
          <button class="action-btn ${isAktif ? 'delete' : ''}" title="${isAktif?'Non-aktifkan':'Aktifkan'}"
            onclick="toggleStatusUser('${u.id}','${u.status_akun || 'Aktif'}','${u.tanggal_bergabung || ''}')">
            <i class="fa fa-${isAktif ? 'ban' : 'check'}"></i>
          </button>
        </div>
      </div>`
  }).join('')
}

/* ================= CREATE PROFILE ================= */
window.createProfile = async function () {
  const email  = document.getElementById('newEmail').value.trim()
  const pass   = document.getElementById('newPassword').value
  const nama   = document.getElementById('newNama').value.trim()
  const tgl    = document.getElementById('newTgl').value
  const jabatan= document.getElementById('newJabatan').value.trim()
  const dept   = document.getElementById('newDept').value.trim()
  const hp     = document.getElementById('newHp').value.trim()
  const role   = document.getElementById('newRole').value

  if (!email || !pass || !nama) { alert('Nama, email, dan password wajib diisi'); return }
  if (window.currentUser.role === 'admin' && role !== 'staff') { alert('Admin hanya bisa membuat akun staff'); return }

  const { signup } = await import('./auth.js')
  const ok = await signup(email, pass, role, { nama_lengkap: nama, tanggal_bergabung: tgl, jabatan, departemen: dept, no_hp: hp })

  if (ok) {
    alert('✅ Akun karyawan berhasil dibuat!')
    await renderUsers()
  }
}

/* ================= TOGGLE STATUS USER ================= */
window.toggleStatusUser = async function (userId, statusSekarang, tanggalBergabung) {
  const statusBaru = statusSekarang === 'Aktif' ? 'Non-Aktif' : 'Aktif'
  if (!confirm(`${statusBaru === 'Non-Aktif' ? 'Non-aktifkan' : 'Aktifkan kembali'} karyawan ini?`)) return

  await supabase.from('profiles').update({ status_akun: statusBaru }).eq('id', userId)

  if (statusBaru === 'Non-Aktif') {
    await resetCutiKaryawan(userId)
    alert('Karyawan di-non-aktifkan dan sisa cuti direset ke 0.')
  } else {
    alert('Karyawan berhasil diaktifkan kembali.')
  }

  await renderUsers()
}

/* ================= SIDEBAR ================= */
window.toggleSidebar = () => {
  document.getElementById('sidebar').classList.toggle('open')
  document.getElementById('overlay').classList.toggle('active')
}
window.closeSidebar = () => {
  document.getElementById('sidebar').classList.remove('open')
  document.getElementById('overlay').classList.remove('active')
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar() })

/* ================= DARK MODE ================= */
window.toggleTheme = function () {
  document.documentElement.classList.toggle('dark')
  const isDark = document.documentElement.classList.contains('dark')
  const icon   = document.getElementById('themeIcon')
  if (icon) icon.className = isDark ? 'fa fa-sun' : 'fa fa-moon'
  localStorage.setItem('theme', isDark ? 'dark' : 'light')
}
