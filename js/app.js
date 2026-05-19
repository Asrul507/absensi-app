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
window.currentUser = null
window.currentShift = null
window.supabase = supabase

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', () => { checkUser() })

/* ================= CHECK USER ================= */
async function checkUser() {
  const loginPage = document.getElementById('loginPage')
  const appPage = document.getElementById('appPage')

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    loginPage.style.display = 'flex'
    appPage.style.display = 'none'
    return
  }

  const profile = await getProfile(user.id)
  if (!profile) {
    loginPage.style.display = 'flex'
    appPage.style.display = 'none'
    return
  }

  window.currentUser = profile
  loginPage.style.display = 'none'
  appPage.style.display = 'block'
  document.getElementById('userName').innerText = profile.nama_lengkap || user.email

  renderMenu(profile.role)
  navigate('dashboard')
}
window.checkUser = checkUser

/* ================= LOGIN ================= */
window.login = async function() {
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  const ok = await doLogin(email, password)
  if (ok) await checkUser()
}

/* ================= SIGNUP ================= */
window.signup = async function() {
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  await doSignup(email, password, 'staff')
}

/* ================= LOGOUT ================= */
window.logout = logout

/* ================= MENU ================= */
function renderMenu(role) {
  const sidebar = document.getElementById('sidebar')
  let menu = []

  if (role === 'staff') {
    menu = [
      { key: 'dashboard', name: 'Dashboard', icon: 'fa-house' },
      { key: 'absensi', name: 'Absensi', icon: 'fa-clock' },
      { key: 'pengajuan', name: 'Pengajuan', icon: 'fa-file-alt' },
      { key: 'riwayat', name: 'Riwayat', icon: 'fa-list' },
      { key: 'kalender', name: 'Kalender', icon: 'fa-calendar-alt' },
    ]
  }

  if (role === 'admin') {
    menu = [
      { key: 'dashboard', name: 'Dashboard', icon: 'fa-house' },
      { key: 'absensi', name: 'Absensi', icon: 'fa-clock' },
      { key: 'shift', name: 'Shift', icon: 'fa-calendar' },
      { key: 'jadwal', name: 'Jadwal', icon: 'fa-calendar-days' },
      { key: 'pengajuan', name: 'Approval', icon: 'fa-inbox' },
      { key: 'users', name: 'Users', icon: 'fa-users' },
      { key: 'riwayat', name: 'Riwayat', icon: 'fa-list' },
      { key: 'kalender', name: 'Kalender', icon: 'fa-calendar' },
    ]
  }

  if (role === 'super_admin') {
    menu = [
      { key: 'dashboard', name: 'Dashboard', icon: 'fa-house' },
      { key: 'absensi', name: 'Absensi', icon: 'fa-clock' },
      { key: 'shift', name: 'Shift', icon: 'fa-calendar' },
      { key: 'jadwal', name: 'Jadwal', icon: 'fa-calendar-days' },
      { key: 'pengajuan', name: 'Approval', icon: 'fa-inbox' },
      { key: 'users', name: 'User Management', icon: 'fa-users' },
      { key: 'riwayat', name: 'Riwayat', icon: 'fa-list' },
      { key: 'kalender', name: 'Kalender', icon: 'fa-calendar' },
    ]
  }

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sb-name">GENIUS HR</div>
      <div class="sb-role">${role?.replace('_', ' ').toUpperCase()}</div>
    </div>
    <nav class="sidebar-nav">
      ${menu.map(m => `
        <a href="#" onclick="navigate('${m.key}'); closeSidebar(); return false;">
          <i class="fa ${m.icon}"></i> ${m.name}
        </a>
      `).join('')}
    </nav>
  `
}

/* ================= NAVIGATE ================= */
window.navigate = async function(page) {
  if (!window.currentUser) { alert('Silakan login dulu'); return }

  // Highlight active menu
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'))
  const activeLink = document.querySelector(`.sidebar-nav a[onclick*="'${page}'"]`)
  if (activeLink) activeLink.classList.add('active')

  switch (page) {
    case 'dashboard': renderDashboard(); return
    case 'absensi': renderAbsensi(window.currentUser, window.currentShift); return
    case 'shift': renderShiftManagement(); return
    case 'jadwal': renderJadwalManagement(); return
    case 'pengajuan': renderPengajuan(window.currentUser); return
    case 'riwayat': renderRiwayat(window.currentUser); return
    case 'kalender': renderKalenderHR(); return
    case 'users': await renderUsers(); return
    default: document.getElementById('content').innerHTML = `<h2>${page}</h2>`
  }
}

/* ================= USERS PAGE ================= */
async function renderUsers() {
  const content = document.getElementById('content')
  content.innerHTML = `<div class="card"><p>Loading users...</p></div>`

  const { data: users, error } = await supabase
    .from('profiles')
    .select('*')
    .order('nama_lengkap')

  if (error) {
    content.innerHTML = `<div class="card"><p class="text-danger">Gagal load users</p></div>`
    return
  }

  const canCreateAdmin = window.currentUser.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-users"></i> User Management</h2>
    </div>

    <!-- FORM BUAT USER -->
    <div class="card fade-up">
      <div class="card-title"><i class="fa fa-user-plus"></i> Tambah Karyawan</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field">
          <label>Nama Lengkap <span class="req">*</span></label>
          <input id="newNama" placeholder="Nama lengkap karyawan">
        </div>
        <div class="field">
          <label>Email <span class="req">*</span></label>
          <input id="newEmail" type="email" placeholder="email@perusahaan.com">
        </div>
        <div class="field">
          <label>Password <span class="req">*</span></label>
          <input id="newPassword" type="password" placeholder="Min. 6 karakter">
        </div>
        <div class="field">
          <label>Jabatan</label>
          <input id="newJabatan" placeholder="Jabatan / posisi">
        </div>
        <div class="field">
          <label>Departemen</label>
          <input id="newDept" placeholder="Nama departemen">
        </div>
        <div class="field">
          <label>No. HP</label>
          <input id="newHp" placeholder="08xxxxxxxxxx">
        </div>
        <div class="field">
          <label>Tanggal Bergabung <span class="req">*</span></label>
          <input id="newTglBergabung" type="date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="field">
          <label>Role</label>
          <select id="newRole">
            <option value="staff">Staff</option>
            ${canCreateAdmin ? `<option value="admin">Admin</option><option value="super_admin">Super Admin</option>` : ''}
          </select>
        </div>
      </div>

      <button class="btn-primary" onclick="createProfile()" style="margin-top:4px;">
        <i class="fa fa-user-plus"></i> Buat Akun Karyawan
      </button>
    </div>

    <!-- LIST USER -->
    <div class="card fade-up-1">
      <div class="card-title"><i class="fa fa-list"></i> Daftar Karyawan (${users.length})</div>

      <div class="search-box" style="margin-bottom:12px;">
        <i class="fa fa-search"></i>
        <input id="searchUser" placeholder="Cari nama atau email..." oninput="filterUsers()">
      </div>

      <div id="userListContainer">
        ${await renderUserList(users)}
      </div>
    </div>
  `

  window._allUsers = users

  window.filterUsers = function() {
    const q = document.getElementById('searchUser').value.toLowerCase()
    const filtered = window._allUsers.filter(u =>
      (u.nama_lengkap || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    )
    document.getElementById('userListContainer').innerHTML = renderUserListSync(filtered)
  }
}

async function renderUserList(users) {
  // Ambil semua cuti terpakai sekaligus
  const tahunIni = new Date().getFullYear()
  const { data: cutiData } = await supabase
    .from('pengajuan')
    .select('user_id, jumlah_hari')
    .eq('jenis', 'cuti')
    .eq('status', 'approved')
    .gte('tanggal_pengajuan', `${tahunIni}-01-01`)

  const cutiMap = {}
  ;(cutiData || []).forEach(c => {
    if (!cutiMap[c.user_id]) cutiMap[c.user_id] = 0
    cutiMap[c.user_id] += parseInt(c.jumlah_hari) || 0
  })

  return users.map(u => {
    const masaKerja = hitungMasaKerja(u.tanggal_bergabung)
    const jatah = hitungJatahCuti(u.tanggal_bergabung)
    const terpakai = cutiMap[u.id] || 0
    const sisa = jatah - terpakai

    return `
      <div class="user-item" id="user-${u.id}">
        <div class="user-avatar">${(u.nama_lengkap || u.email || '?')[0].toUpperCase()}</div>
        <div class="ui-info">
          <div class="ui-name">${u.nama_lengkap || '-'}</div>
          <div class="ui-email">${u.email} · <span class="badge badge-${u.role === 'super_admin' ? 'red' : u.role === 'admin' ? 'blue' : 'gray'}">${u.role}</span></div>
          <div style="font-size:.72rem;color:var(--text-muted);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">
            <span>📅 Bergabung: ${u.tanggal_bergabung || '-'}</span>
            <span>⏳ ${formatMasaKerja(masaKerja)}</span>
            ${u.jabatan ? `<span>💼 ${u.jabatan}</span>` : ''}
            <span style="color:${sisa < 0 ? 'var(--danger)' : 'var(--success)'};">🌴 Cuti: ${sisa}/${jatah}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="badge ${u.status_akun === 'Aktif' ? 'badge-green' : 'badge-red'}">${u.status_akun || 'Aktif'}</span>
          <button class="action-btn" onclick="toggleStatusUser('${u.id}','${u.status_akun || 'Aktif'}','${u.tanggal_bergabung || ''}')">
            <i class="fa fa-${u.status_akun === 'Aktif' ? 'ban' : 'check'}"></i>
          </button>
        </div>
      </div>
    `
  }).join('')
}

function renderUserListSync(users) {
  return users.map(u => {
    const masaKerja = hitungMasaKerja(u.tanggal_bergabung)
    const jatah = hitungJatahCuti(u.tanggal_bergabung)
    return `
      <div class="user-item">
        <div class="user-avatar">${(u.nama_lengkap || u.email || '?')[0].toUpperCase()}</div>
        <div class="ui-info">
          <div class="ui-name">${u.nama_lengkap || '-'}</div>
          <div class="ui-email">${u.email} · <span class="badge badge-gray">${u.role}</span></div>
          <div style="font-size:.72rem;color:var(--text-muted);margin-top:4px;">
            📅 ${u.tanggal_bergabung || '-'} · ⏳ ${formatMasaKerja(masaKerja)}
            ${u.jabatan ? ` · 💼 ${u.jabatan}` : ''}
          </div>
        </div>
        <span class="badge ${u.status_akun === 'Aktif' ? 'badge-green' : 'badge-red'}">${u.status_akun || 'Aktif'}</span>
      </div>
    `
  }).join('')
}

/* ================= CREATE PROFILE ================= */
window.createProfile = async function() {
  const email = document.getElementById('newEmail').value.trim()
  const password = document.getElementById('newPassword').value
  const role = document.getElementById('newRole').value
  const nama = document.getElementById('newNama').value.trim()
  const tglBergabung = document.getElementById('newTglBergabung').value
  const jabatan = document.getElementById('newJabatan').value.trim()
  const dept = document.getElementById('newDept').value.trim()
  const hp = document.getElementById('newHp').value.trim()

  if (!email || !password || !nama) {
    alert('Nama, email, dan password wajib diisi')
    return
  }
  if (window.currentUser.role === 'admin' && role !== 'staff') {
    alert('Admin hanya bisa membuat akun staff')
    return
  }

  const ok = await doSignup(email, password, role, {
    nama_lengkap: nama,
    tanggal_bergabung: tglBergabung,
    jabatan,
    departemen: dept,
    no_hp: hp
  })

  if (ok) {
    alert('✅ Akun karyawan berhasil dibuat!')
    navigate('users')
  }
}

/* ================= TOGGLE STATUS USER ================= */
window.toggleStatusUser = async function(userId, statusSekarang, tanggalBergabung) {
  const statusBaru = statusSekarang === 'Aktif' ? 'Non-Aktif' : 'Aktif'
  if (!confirm(`${statusBaru === 'Non-Aktif' ? 'Non-aktifkan' : 'Aktifkan kembali'} karyawan ini?`)) return

  await supabase.from('profiles').update({ status_akun: statusBaru }).eq('id', userId)

  // Reset cuti jika di-non-aktifkan
  if (statusBaru === 'Non-Aktif') {
    await resetCutiKaryawan(userId)
    alert('Karyawan di-non-aktifkan dan sisa cuti direset.')
  } else {
    alert('Karyawan diaktifkan kembali.')
  }

  navigate('users')
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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSidebar()
})

/* ================= DARK MODE ================= */
window.toggleTheme = function() {
  document.documentElement.classList.toggle('dark')
  const icon = document.getElementById('themeIcon')
  if (icon) icon.className = document.documentElement.classList.contains('dark') ? 'fa fa-sun' : 'fa fa-moon'
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light')
}

// Apply saved theme
if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark')
}
