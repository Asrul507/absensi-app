import { supabase } from './supabase.js'
import { getProfile } from './users.js'
import { login as doLogin, logout } from './auth.js'
import { renderDashboard } from './dashboard.js'
import { renderAbsensi } from './ui.js'
import { renderShiftManagement } from './shift.js'
import { renderJadwalManagement } from './jadwal.js'
import { renderRiwayat } from './riwayat.js'
import { renderPengajuan } from './pengajuan.js'
import { renderKalenderHR } from './kalender.js'
import { hitungMasaKerja, formatMasaKerja, getSisaCuti, hitungJatahCuti, resetCutiKaryawan } from './cuti.js'

/* ================= GLOBAL ================= */
window.currentUser  = null
window.currentShift = null
window.supabase     = supabase

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', async () => {
  // Apply theme
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark')
    const icon = document.getElementById('themeIcon')
    if (icon) icon.className = 'fa fa-sun'
  }

  // Tunggu session siap (penting setelah callback.html redirect)
  await new Promise(resolve => setTimeout(resolve, 300))

  // Check user dan render
  await checkUser()

  // Listener untuk auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && !window.currentUser) {
      await checkUser()
    }
    if (event === 'SIGNED_OUT') {
      window.currentUser = null
      showLoginPage()
    }
    if (event === 'USER_UPDATED' && session) {
      if (window.currentUser) {
        window.currentUser.email = session.user.email
      }
    }
  })
})

/* ================= CHECK USER ================= */
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

    // Update status jika masih menunggu verifikasi
    if (profile && profile.status_akun === 'Menunggu Verifikasi') {
      await supabase.from('profiles').update({ status_akun: 'Aktif' }).eq('id', user.id)
      profile.status_akun = 'Aktif'
    }

    if (!profile) {
      showLoginPage()
      return
    }

    // Sudah login
    window.currentUser = profile
    showAppPage()

    const userNameEl = document.getElementById('userName')
    if (userNameEl) userNameEl.innerText = profile.nama_lengkap || user.email

    updateTopbarAvatar(profile)
    renderMenu(profile.role)
    renderBottomNav(profile.role)
    navigate('dashboard')

  } catch (err) {
    console.error('checkUser error:', err)
    showLoginPage()
  }
}

/* ================= SHOW LOGIN PAGE ================= */
function showLoginPage() {
  const loginPage = document.getElementById('loginPage')
  const appPage   = document.getElementById('appPage')
  if (loginPage) loginPage.style.display = 'flex'
  if (appPage)   appPage.style.display   = 'none'
}

/* ================= SHOW APP PAGE ================= */
function showAppPage() {
  const loginPage = document.getElementById('loginPage')
  const appPage   = document.getElementById('appPage')
  if (loginPage) loginPage.style.display = 'none'
  if (appPage)   appPage.style.display   = 'block'
}

/* ================= UPDATE TOPBAR AVATAR ================= */
function updateTopbarAvatar(profile) {
  const el = document.getElementById('topbarAvatar')
  if (!el) return
  if (profile.foto_url) {
    el.style.backgroundImage = `url(${profile.foto_url})`
    el.style.backgroundSize  = 'cover'
    el.textContent = ''
  } else {
    el.style.backgroundImage = ''
    el.textContent = (profile.nama_lengkap || '?')[0].toUpperCase()
  }
}

/* ================= LOGIN ================= */
window.login = async function () {
  const email    = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  const errEl    = document.getElementById('loginError')
  if (errEl) errEl.style.display = 'none'
  const ok = await doLogin(email, password)
  if (ok) await checkUser()
}

/* ================= LOGOUT ================= */
window.logout = async function () {
  await logout()
}

/* ================= MENU ================= */
function renderMenu(role) {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return

  const menu = role === 'staff'
    ? [
        { key:'dashboard', name:'Dashboard',    icon:'fa-house' },
        { key:'absensi',   name:'Absensi',      icon:'fa-clock' },
        { key:'pengajuan', name:'Pengajuan',    icon:'fa-file-alt' },
        { key:'riwayat',   name:'Riwayat',      icon:'fa-list' },
        { key:'kalender',  name:'Kalender',     icon:'fa-calendar-alt' },
        { key:'profile',   name:'Profil Saya',  icon:'fa-user' },
      ]
    : [
        { key:'dashboard', name:'Dashboard',    icon:'fa-house' },
        { key:'absensi',   name:'Absensi',      icon:'fa-clock' },
        { key:'shift',     name:'Shift',        icon:'fa-calendar' },
        { key:'jadwal',    name:'Jadwal',       icon:'fa-calendar-days' },
        { key:'pengajuan', name:'Approval',     icon:'fa-inbox' },
        { key:'users',     name:'Karyawan',     icon:'fa-users' },
        { key:'riwayat',   name:'Riwayat',      icon:'fa-list' },
        { key:'kalender',  name:'Kalender',     icon:'fa-calendar' },
      ]

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sb-name">GENIUS HR</div>
      <div class="sb-role">${(role||'').replace('_',' ').toUpperCase()}</div>
    </div>
    <nav class="sidebar-nav">
      ${menu.map(m => `
        <a href="#" id="menu-${m.key}"
          onclick="navigate('${m.key}'); closeSidebar(); return false;">
          <i class="fa ${m.icon}"></i> ${m.name}
        </a>`).join('')}
    </nav>
  `
}

/* ================= BOTTOM NAV ================= */
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
        { key:'pengajuan', icon:'fa-inbox',    label:'Approval' },
        { key:'users',     icon:'fa-users',    label:'Karyawan' },
      ]

  nav.innerHTML = items.map(i => `
    <button class="bottom-nav-item" id="bnav-${i.key}" onclick="navigate('${i.key}')">
      <i class="fa ${i.icon}"></i><span>${i.label}</span>
    </button>`).join('')
}

/* ================= NAVIGATE ================= */
window.navigate = async function (page) {
  if (!window.currentUser) { alert('Silakan login dulu'); return }

  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'))
  document.getElementById(`menu-${page}`)?.classList.add('active')
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'))
  document.getElementById(`bnav-${page}`)?.classList.add('active')

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

  const avatarHtml = u.foto_url
    ? `<img src="${u.foto_url}" alt="foto" style="width:76px;height:76px;border-radius:var(--r-xl);
        object-fit:cover;border:2px solid rgba(255,255,255,.28);box-shadow:0 6px 20px rgba(0,0,0,.25);">`
    : `<div class="profile-avatar">${(u.nama_lengkap||'?')[0].toUpperCase()}</div>`

  content.innerHTML = `
    <div style="max-width:520px;margin:0 auto;">

      <div class="profile-card fade-up">
        <div style="position:relative;display:inline-block;margin-bottom:14px;">
          ${avatarHtml}
          <label for="fotoUpload" title="Ganti foto"
            style="position:absolute;bottom:-4px;right:-4px;width:26px;height:26px;
              border-radius:50%;background:var(--primary);color:#fff;cursor:pointer;
              display:flex;align-items:center;justify-content:center;font-size:.7rem;
              box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff;">
            <i class="fa fa-camera"></i>
          </label>
          <input type="file" id="fotoUpload" accept="image/*" style="display:none;"
            onchange="uploadFotoProfil(this)">
        </div>
        <div id="uploadStatus" style="font-size:.75rem;color:rgba(255,255,255,.8);min-height:18px;"></div>
        <div class="profile-name">${u.nama_lengkap || '-'}</div>
        <div class="profile-role">${(u.role||'').replace('_',' ')}</div>
      </div>

      <div class="card fade-up-1">
        <div class="card-title"><i class="fa fa-id-card"></i> Informasi Pribadi</div>
        ${infoRow('Email', u.email || '-')}
        ${infoRow('Jabatan', u.jabatan || '-')}
        ${infoRow('Departemen', u.departemen || '-')}
        ${infoRow('No. HP', u.no_hp || '-')}
        ${infoRow('Status', `<span class="badge ${u.status_akun==='Aktif'?'badge-green':'badge-yellow'}">${u.status_akun||'Aktif'}</span>`)}
      </div>

      <div class="card fade-up-2">
        <div class="card-title"><i class="fa fa-briefcase"></i> Info Kerja</div>
        ${infoRow('Bergabung', u.tanggal_bergabung || '-')}
        ${infoRow('Masa Kerja', formatMasaKerja(masaKerja))}
      </div>

      <div class="card fade-up-3">
        <div class="card-title"><i class="fa fa-lock"></i> Akun</div>
        <button class="btn-danger" onclick="logout()">
          <i class="fa fa-sign-out-alt"></i> Keluar
        </button>
      </div>

    </div>
  `
}

function infoRow(label, value) {
  return `<div class="info-row"><div class="ir-label">${label}</div><div class="ir-val">${value}</div></div>`
}

/* ================= UPLOAD FOTO ================= */
window.uploadFotoProfil = async function (input) {
  const file   = input.files[0]
  const status = document.getElementById('uploadStatus')
  if (!file) return

  if (file.size > 2 * 1024 * 1024) {
    if (status) status.textContent = '⚠ Ukuran foto max 2MB'
    return
  }

  if (status) status.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mengupload...'

  const fileName = `avatar-${window.currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, { upsert: true })

  if (uploadErr) {
    if (status) status.textContent = '⚠ Upload gagal'
    return
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
  const foto_url = urlData.publicUrl

  await supabase.from('profiles').update({ foto_url }).eq('id', window.currentUser.id)
  window.currentUser.foto_url = foto_url

  if (status) status.innerHTML = '<i class="fa fa-check"></i> Foto diperbarui'
  updateTopbarAvatar(window.currentUser)
  renderProfile()
}

/* ================= USERS PAGE STUB ================= */
async function renderUsers() {
  const content = document.getElementById('content')
  content.innerHTML = `<div class="card"><h2>Users Page</h2><p>Not implemented yet</p></div>`
}

/* ================= SIDEBAR ================= */
window.toggleSidebar = () => {
  document.getElementById('sidebar')?.classList.toggle('open')
  document.getElementById('overlay')?.classList.toggle('active')
}
window.closeSidebar = () => {
  document.getElementById('sidebar')?.classList.remove('open')
  document.getElementById('overlay')?.classList.remove('active')
}
document.addEventListener('keydown', e => { if(e.key==='Escape') closeSidebar() })

/* ================= DARK MODE ================= */
window.toggleTheme = function() {
  document.documentElement.classList.toggle('dark')
  const isDark = document.documentElement.classList.contains('dark')
  const icon   = document.getElementById('themeIcon')
  if (icon) icon.className = isDark ? 'fa fa-sun' : 'fa fa-moon'
  localStorage.setItem('theme', isDark ? 'dark' : 'light')
}
