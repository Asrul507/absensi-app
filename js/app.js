import { supabase } from './supabase.js'
import { getProfile } from './users.js'
import { login as doLogin, signup as doSignup, logout } from './auth.js'
import { renderAbsensi } from './ui.js'
import { renderDashboard } from './dashboard.js'
import { renderShiftManagement } from './shift.js'
import { renderJadwalManagement } from './jadwal.js'
import { renderRiwayat } from './ui.js'

/* ================= GLOBAL STATE ================= */
window.currentUser = null
window.currentShift = null

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', () => {
  checkUser()
})

/* ================= CHECK USER ================= */
async function checkUser() {

  const loginPage = document.getElementById('loginPage')
  const appPage = document.getElementById('appPage')

  const { data: { user } } = await supabase.auth.getUser()

  console.log('USER:', user)

  // ❌ BELUM LOGIN
  if (!user) {
    loginPage.style.display = 'flex'
    appPage.style.display = 'none'
    return
  }

  // ✅ SUDAH LOGIN
  const profile = await getProfile(user.id)

  console.log('PROFILE:', profile)
  console.log('ROLE:', profile.role)
console.log('SIDEBAR:', document.getElementById('sidebar'))
console.log('CONTENT:', document.getElementById('content'))

  if (!profile) {
  console.log('PROFILE TIDAK ADA')
  return
}
  window.currentShift = null // nanti diisi dari shift table

  loginPage.style.display = 'none'
  appPage.style.display = 'block'

  document.getElementById('userName').innerText =
    profile?.nama_lengkap || user.email

  renderMenu(profile.role)

  navigate('dashboard')
  updateAuthUI(profile.role)
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
  const nama = "User"

  await doSignup(email, password, nama)
}

/* ================= LOGOUT ================= */
window.logout = logout

/* ================= MENU ROLE ================= */
function renderMenu(role) {

  const sidebar = document.getElementById('sidebar')

  let menu = []

  // ================= STAFF =================
  if (role === 'staff') {

    menu = [
      { key: 'dashboard', name: 'Dashboard', icon: 'fa-house' },

      { key: 'absensi', name: 'Absensi', icon: 'fa-clock' },

      { key: 'pengajuan', name: 'Pengajuan', icon: 'fa-file' },

      { key: 'riwayat', name: 'Riwayat', icon: 'fa-list' }
    ]
  }

  // ================= ADMIN =================
  if (role === 'admin') {

    menu = [
      { key: 'dashboard', name: 'Dashboard', icon: 'fa-house' },

      { key: 'absensi', name: 'Absensi', icon: 'fa-clock' },

      // 🔥 SHIFT
      { key: 'shift', name: 'Shift', icon: 'fa-calendar' },

      { key: 'jadwal', name: 'Jadwal', icon: 'fa-calendar-days' },

      { key: 'pengajuan', name: 'Approval', icon: 'fa-inbox' },

      { key: 'users', name: 'Users', icon: 'fa-users' },

      { key: 'rekap', name: 'Rekap', icon: 'fa-chart-bar' }
    ]
  }

  // ================= SUPER ADMIN =================
  if (role === 'super_admin') {

    menu = [
      { key: 'dashboard', name: 'Dashboard', icon: 'fa-house' },

      { key: 'absensi', name: 'Absensi', icon: 'fa-clock' },

      // 🔥 SHIFT
      { key: 'shift', name: 'Shift Management', icon: 'fa-calendar' },

      { key: 'jadwal', name: 'Jadwal', icon: 'fa-calendar-days' },

      { key: 'pengajuan', name: 'Approval', icon: 'fa-inbox' },

      { key: 'users', name: 'User Management', icon: 'fa-users' },

      { key: 'rekap', name: 'Rekap Full', icon: 'fa-chart-line' },

      { key: 'settings', name: 'Settings', icon: 'fa-gear' }
    ]
  }

  // ================= RENDER =================
  sidebar.innerHTML = `

    <div class="sidebar-header">

      <div class="sb-name">
        GENIUS APP
      </div>

      <div class="sb-role">
        ${role}
      </div>

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
  

  // ================= DASHBOARD =================
  if (page === 'dashboard') {
    renderDashboard()
    return
  }

  // ================= ABSENSI =================
  if (page === 'absensi') {
    renderAbsensi(window.currentUser, window.currentShift)
    return
  }
  if (page === 'shift') {
  renderShiftManagement()
  }
  if (page === 'jadwal') {
  renderJadwalManagement()
  return
}


  // ================= USERS =================
  // ================= USERS =================
if (page === 'users') {

  const { data: users, error } = await supabase
    .from('profiles')
    .select('*')

  if (error) {
    content.innerHTML = `
      <div class="card">
        Error load users
      </div>
    `
    return
  }

  content.innerHTML = `

    <div class="card">

      <h3>Create Profile</h3>

      <input 
        id="newEmail" 
        placeholder="email"
      >

      <input 
        id="newPassword" 
        placeholder="password"
      >

      <select id="newRole">

        <option value="staff">
          Staff
        </option>

        <option value="admin">
          Admin
        </option>

        <option value="super_admin">
          Super Admin
        </option>

      </select>

      <button onclick="createProfile()">
        Create Profile
      </button>

    </div>

    <div class="card">

      <h2>User Management</h2>

      <table style="width:100%;border-collapse:collapse;margin-top:10px">

        <thead>
          <tr>
            <th>Nama</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>

        <tbody>

          ${users.map(u => `
            <tr>

              <td>${u.nama_lengkap || '-'}</td>

              <td>${u.email}</td>

              <td>

                <select onchange="updateRole('${u.id}', this.value)">

                  <option value="staff"
                    ${u.role === 'staff' ? 'selected' : ''}>
                    staff
                  </option>

                  <option value="admin"
                    ${u.role === 'admin' ? 'selected' : ''}>
                    admin
                  </option>

                  <option value="super_admin"
                    ${u.role === 'super_admin' ? 'selected' : ''}>
                    super admin
                  </option>

                </select>

              </td>

              <td>
                ${u.status_akun || 'Aktif'}
              </td>

              <td>

                <button
                  onclick="toggleStatus('${u.id}', '${u.status_akun}')">

                  Toggle

                </button>

              </td>

            </tr>
          `).join('')}

        </tbody>

      </table>

    </div>
  `

  return
}

//==================Riwayat===============
if (page === 'riwayat') {
  renderRiwayat()
  return
}

  // ================= DEFAULT =================
  content.innerHTML = `<h2>${page}</h2>`
}
window.toggleSidebar = function () {

  const sidebar = document.getElementById('sidebar')
  const overlay = document.getElementById('overlay')

  if (!sidebar || !overlay) return

  sidebar.classList.toggle('open')
  overlay.classList.toggle('active')
}

window.closeSidebar = function () {

  document.getElementById('sidebar')?.classList.remove('open')
  document.getElementById('overlay')?.classList.remove('active')

}

window.createProfile = async function () {

  const email =
    document.getElementById('newEmail').value

  const password =
    document.getElementById('newPassword').value

  const role =
    document.getElementById('newRole').value

  // ❗ admin hanya boleh buat staff
  if (
    window.currentUser.role === 'admin'
    &&
    role !== 'staff'
  ) {
    alert('Admin hanya bisa buat staff')
    return
  }

  await signup(email, password, role)

  alert('Profile berhasil dibuat')

  navigate('users')
}

function updateAuthUI(role) {

  const btnSignup = document.getElementById('btnSignup')

  if (!btnSignup) return

  if (role === 'admin' || role === 'super_admin') {
    btnSignup.style.display = 'block'
  } else {
    btnSignup.style.display = 'none'
  }
}
window.toggleStatus = async function(id, currentStatus) {

  const newStatus =
    currentStatus === 'Aktif'
      ? 'Nonaktif'
      : 'Aktif'

  const { error } = await supabase
    .from('profiles')
    .update({
      status_akun: newStatus
    })
    .eq('id', id)

  if (error) {
    alert('Gagal update status')
    return
  }

  alert('Status updated')

  navigate('users')
}
