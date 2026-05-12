import { supabase } from './supabase.js'
import { getProfile } from './users.js'
import { login as doLogin, signup as doSignup, logout } from './auth.js'

import { renderDashboard } from './dashboard.js'
import { renderAbsensi } from './ui.js'
import { renderShiftManagement } from './shift.js'
import { renderJadwalManagement } from './jadwal.js'
import { renderRiwayat } from './ui.js'
import { renderPengajuan } from './pengajuan.js'

/* ================= GLOBAL STATE ================= */
window.currentUser = null
window.currentShift = null

// 🔥 penting: biar semua file bisa akses supabase
window.supabase = supabase

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', () => {
  checkUser()
})

/* ================= CHECK USER ================= */
async function checkUser() {

  const loginPage = document.getElementById('loginPage')
  const appPage = document.getElementById('appPage')

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    window.currentUser = null
    loginPage.style.display = 'flex'
    appPage.style.display = 'none'
    return
  }

  const profile = await getProfile(user.id)

  if (!profile) {
    window.currentUser = null
    loginPage.style.display = 'flex'
    appPage.style.display = 'none'
    return
  }

  window.currentUser = profile
  window.currentShift = null

  loginPage.style.display = 'none'
  appPage.style.display = 'block'

  document.getElementById('userName').innerText =
    profile.nama_lengkap || user.email

  renderMenu(profile.role)

  navigate('dashboard')
}

window.checkUser = checkUser

/* ================= LOGIN ================= */
window.login = async function () {

  const email = document.getElementById('email').value
  const password = document.getElementById('password').value

  await doLogin(email, password)

  await checkUser()
}

/* ================= SIGNUP ================= */
window.signup = async function () {

  const email = document.getElementById('email').value
  const password = document.getElementById('password').value

  await doSignup(email, password, "User")
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
      { key: 'pengajuan', name: 'Pengajuan', icon: 'fa-file' },
      { key: 'riwayat', name: 'Riwayat', icon: 'fa-list' }
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
      { key: 'rekap', name: 'Rekap', icon: 'fa-chart-bar' }
    ]
  }

  if (role === 'super_admin') {
    menu = [
      { key: 'dashboard', name: 'Dashboard', icon: 'fa-house' },
      { key: 'absensi', name: 'Absensi', icon: 'fa-clock' },
      { key: 'shift', name: 'Shift Management', icon: 'fa-calendar' },
      { key: 'jadwal', name: 'Jadwal', icon: 'fa-calendar-days' },
      { key: 'pengajuan', name: 'Approval', icon: 'fa-inbox' },
      { key: 'users', name: 'User Management', icon: 'fa-users' },
      { key: 'rekap', name: 'Rekap', icon: 'fa-chart-line' },
      { key: 'settings', name: 'Settings', icon: 'fa-gear' }
    ]
  }

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sb-name">GENIUS APP</div>
      <div class="sb-role">${role}</div>
    </div>

    <div class="sidebar-nav">
      ${menu.map(m => `
        <a href="#" onclick="navigate('${m.key}')">
          <i class="fa ${m.icon}"></i>
          ${m.name}
        </a>
      `).join('')}
    </div>
  `
}

/* ================= NAVIGATE ================= */
window.navigate = async function(page) {

  const content = document.getElementById('content')

  if (!window.currentUser) {
    alert("Silakan login dulu")
    return
  }

  switch (page) {

    case 'dashboard':
      renderDashboard()
      return

    case 'absensi':
      renderAbsensi(window.currentUser, window.currentShift)
      return

    case 'shift':
      renderShiftManagement()
      return

    case 'jadwal':
      renderJadwalManagement()
      return

    case 'pengajuan':
      renderPengajuan(window.currentUser)
      return

    case 'riwayat':
      renderRiwayat()
      return

    case 'users': {

      const { data: users, error } = await window.supabase
        .from('profiles')
        .select('*')

      if (error) {
        content.innerHTML = `<div class="card">Error load users</div>`
        return
      }

      content.innerHTML = `
        <div class="card">
          <h3>Create Profile</h3>

          <input id="newEmail" placeholder="email">
          <input id="newPassword" placeholder="password">

          <select id="newRole">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>

          <button onclick="createProfile()">Create</button>
        </div>

        <div class="card">
          <h3>User List</h3>

          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              ${users.map(u => `
                <tr>
                  <td>${u.nama_lengkap || '-'}</td>
                  <td>${u.email}</td>
                  <td>${u.role}</td>
                  <td>${u.status_akun || 'Aktif'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      return
    }

    default:
      content.innerHTML = `<h2>${page}</h2>`
  }
}

/* ================= PROFILE ================= */
window.createProfile = async function () {

  const email = document.getElementById('newEmail').value
  const password = document.getElementById('newPassword').value
  const role = document.getElementById('newRole').value

  if (window.currentUser.role === 'admin' && role !== 'staff') {
    alert('Admin hanya bisa buat staff')
    return
  }

  await doSignup(email, password, role)

  alert('Profile dibuat')

  navigate('users')
}

/* ================= SIDEBAR ================= */
window.toggleSidebar = function () {
  document.getElementById('sidebar').classList.toggle('open')
  document.getElementById('overlay').classList.toggle('active')
}

window.closeSidebar = function () {
  document.getElementById('sidebar')?.classList.remove('open')
  document.getElementById('overlay')?.classList.remove('active')
}
