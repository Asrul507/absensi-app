import { supabase } from './supabase.js'
import { getProfile } from './users.js'
import { login as doLogin, logout } from './auth.js'
import { renderDashboard } from './dashboard.js'
import { renderAbsensi } from './ui.js'
import { renderShiftManagement } from './shift.js'
import { renderJadwalManagement } from './jadwal.js'
import { renderRiwayat } from './riwayat.js'
import { renderRekap } from './rekap.js'
import { renderRekapInOut } from './rekap-inout.js'
import { renderDaftarAbsensi } from './daftar-absensi.js'
import { renderPerbaikanAbsen } from './perbaikan-absen.js'
import { renderPengajuan } from './pengajuan.js'
import { renderKalenderHR } from './kalender.js'
import { hitungMasaKerja, formatMasaKerja, getSisaCuti, hitungJatahCuti, resetCutiKaryawan } from './cuti.js'
import './chart-helpers.js'

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
        { key:'daftar-absensi', name:'Daftar Absensi', icon:'fa-list-check' },
        { key:'rekap-inout', name:'Rekap In/Out', icon:'fa-clock' },
        { key:'perbaikan-absen', name:'Perbaikan Absen', icon:'fa-pencil-alt' },
        { key:'pengajuan', name:'Pengajuan',    icon:'fa-file-alt' },
        { key:'riwayat',   name:'Riwayat',      icon:'fa-list' },
        { key:'rekap',     name:'Rekap Absensi', icon:'fa-chart-bar' },
        { key:'kalender',  name:'Kalender',     icon:'fa-calendar-alt' },
        { key:'profile',   name:'Profil Saya',  icon:'fa-user' },
      ]
    : [
        { key:'dashboard', name:'Dashboard',    icon:'fa-house' },
        { key:'absensi',   name:'Absensi',      icon:'fa-clock' },
        { key:'daftar-absensi', name:'Daftar Absensi', icon:'fa-list-check' },
        { key:'rekap-inout', name:'Rekap In/Out', icon:'fa-clock' },
        { key:'perbaikan-absen', name:'Perbaikan Absen', icon:'fa-pencil-alt' },
        { key:'shift',     name:'Shift',        icon:'fa-calendar' },
        { key:'jadwal',    name:'Jadwal',       icon:'fa-calendar-days' },
        { key:'pengajuan', name:'Approval',     icon:'fa-inbox' },
        { key:'users',     name:'Karyawan',     icon:'fa-users' },
        { key:'riwayat',   name:'Riwayat',      icon:'fa-list' },
        { key:'rekap',     name:'Rekap Absensi', icon:'fa-chart-bar' },
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
    case 'daftar-absensi': renderDaftarAbsensi(window.currentUser); break
    case 'rekap-inout': renderRekapInOut(window.currentUser); break
    case 'perbaikan-absen': renderPerbaikanAbsen(window.currentUser); break
    case 'shift':     renderShiftManagement(); break
    case 'jadwal':    renderJadwalManagement(); break
    case 'pengajuan': renderPengajuan(window.currentUser); break
    case 'riwayat':   renderRiwayat(window.currentUser); break
    case 'rekap':     renderRekap(window.currentUser); break
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

/* ================= KARYAWAN / USERS PAGE (UTUH DARI FILE 2) ================= */
async function renderUsers() {
  const content  = document.getElementById('content')
  const canAdmin = window.currentUser.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-users"></i> Manajemen Karyawan</h2>
      <button class="btn-primary btn-sm" onclick="openFormTambah()">
        <i class="fa fa-plus"></i> Tambah Karyawan
      </button>
    </div>

    <!-- TAB -->
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button id="tabAktif" class="btn-primary btn-sm" onclick="switchTab('aktif')">
        <i class="fa fa-users"></i> Karyawan Aktif
      </button>
      <button id="tabPending" class="btn-secondary btn-sm" onclick="switchTab('pending')">
        <i class="fa fa-hourglass-half"></i> Menunggu Daftar
      </button>
    </div>

    <!-- SEARCH -->
    <div class="card fade-up" style="padding:14px 18px;margin-bottom:12px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="search-box" style="flex:2;min-width:180px;margin:0;">
          <i class="fa fa-search"></i>
          <input id="searchUser" placeholder="Cari nama atau email..." oninput="filterUsers()">
        </div>
        <select id="filterStatusUser" onchange="filterUsers()"
          style="flex:1;min-width:120px;padding:10px 12px;border:1.5px solid var(--border);
            border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;background:var(--white);color:var(--text);">
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

  // Load data
  const { data: users } = await supabase.from('profiles').select('*').order('nama_lengkap')
  const { data: pending } = await supabase.from('pending_profiles').select('*').eq('status','waiting').order('nama_lengkap')

  const tahunIni = new Date().getFullYear()
  const { data: cutiData } = await supabase.from('pengajuan').select('user_id, jumlah_hari')
    .eq('jenis','cuti').eq('status','approved').gte('tanggal_pengajuan',`${tahunIni}-01-01`)
  window._cutiMap  = {}
  ;(cutiData||[]).forEach(c => { window._cutiMap[c.user_id] = (window._cutiMap[c.user_id]||0) + (parseInt(c.jumlah_hari)||0) })
  window._allUsers   = users   || []
  window._pendingList= pending || []
  window._currentTab = 'aktif'

  renderUserList(window._allUsers)

  // Tab switcher
  window.switchTab = function(tab) {
    window._currentTab = tab
    document.getElementById('tabAktif').className   = tab==='aktif'   ? 'btn-primary btn-sm'   : 'btn-secondary btn-sm'
    document.getElementById('tabPending').className = tab==='pending' ? 'btn-primary btn-sm'   : 'btn-secondary btn-sm'
    if (tab === 'aktif') renderUserList(window._allUsers)
    else renderPendingList(window._pendingList)
  }

  // Filter Search
  window.filterUsers = function() {
    const q  = document.getElementById('searchUser').value.toLowerCase()
    const st = document.getElementById('filterStatusUser').value
    if (window._currentTab === 'aktif') {
      renderUserList(window._allUsers.filter(u =>
        ((u.nama_lengkap||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)) &&
        (!st || u.status_akun === st)
      ))
    } else {
      renderPendingList(window._pendingList.filter(p =>
        (p.nama_lengkap||'').toLowerCase().includes(q)
      ))
    }
  }

  // Form tambah (pending flow)
  window.openFormTambah = function() {
    showUserModal(`
      <div class="modal-header">
        <h3><i class="fa fa-user-plus" style="color:var(--primary);"></i> Tambah Data Karyawan</h3>
        <button class="modal-close" onclick="closeUserModal()"><i class="fa fa-times"></i></button>
      </div>
      <div class="alert info" style="margin-bottom:16px;">
        <i class="fa fa-info-circle"></i>
        <span>Data karyawan akan masuk daftar tunggu. Karyawan daftar sendiri di <strong>register.html</strong> dengan email & password mereka.</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field full" style="grid-column:1/-1;">
          <label>Nama Lengkap <span class="req">*</span></label>
          <input id="pNama" placeholder="Nama lengkap karyawan">
        </div>
        <div class="field"><label>Jabatan</label><input id="pJabatan" placeholder="Jabatan"></div>
        <div class="field"><label>Departemen</label><input id="pDept" placeholder="Departemen"></div>
        <div class="field"><label>No. HP</label><input id="pHp" placeholder="08xx"></div>
        <div class="field"><label>Tanggal Bergabung</label><input type="date" id="pTgl" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="field"><label>Tanggal Lahir (opsional)</label><input type="date" id="pLahir"></div>
        <div class="field"><label>Role</label>
          <select id="pRole">
            <option value="staff">Staff</option>
            ${canAdmin ? `<option value="admin">Admin</option><option value="super_admin">Super Admin</option>` : ''}
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeUserModal()">Batal</button>
        <button class="btn-primary" onclick="savePendingKaryawan()"><i class="fa fa-save"></i> Simpan Data</button>
      </div>
    `)
  }

  window.savePendingKaryawan = async function() {
    const nama = document.getElementById('pNama').value.trim()
    if (!nama) { alert('Nama wajib diisi'); return }

    const { error } = await supabase.from('pending_profiles').insert([{
      nama_lengkap:      nama,
      jabatan:           document.getElementById('pJabatan').value.trim(),
      departemen:        document.getElementById('pDept').value.trim(),
      no_hp:             document.getElementById('pHp').value.trim(),
      tanggal_bergabung: document.getElementById('pTgl').value || null,
      tanggal_lahir:     document.getElementById('pLahir').value || null,
      role:              document.getElementById('pRole').value,
      created_by:        window.currentUser.id,
    }])

    if (error) { alert('Gagal simpan: ' + error.message); return }
    closeUserModal()
    alert(`✅ Data ${nama} disimpan!\n\nMinta karyawan buka halaman register.html untuk mendaftar dengan email & password mereka.`)
    await renderUsers()
  }
}

/* ---- Render list karyawan aktif ---- */
function renderUserList(users) {
  const el = document.getElementById('userListContainer')
  if (!el) return
  if (!users.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa fa-users"></i><p>Tidak ada karyawan</p></div>`
    return
  }
  el.innerHTML = users.map(u => {
    const masaKerja = hitungMasaKerja(u.tanggal_bergabung)
    const jatah      = hitungJatahCuti(u.tanggal_bergabung)
    const terpakai  = (window._cutiMap||{})[u.id] || 0
    const sisa      = jatah - terpakai
    const isAktif   = u.status_akun !== 'Non-Aktif'

    const avatarHtml = u.foto_url
      ? `<img src="${u.foto_url}" style="width:40px;height:40px;border-radius:var(--r-md);object-fit:cover;flex-shrink:0;">`
      : `<div class="user-avatar" style="${!isAktif?'background:var(--gray-300);':''}">${(u.nama_lengkap||'?')[0].toUpperCase()}</div>`

    return `
      <div class="user-item">
        ${avatarHtml}
        <div class="ui-info">
          <div class="ui-name">${u.nama_lengkap || '-'}</div>
          <div class="ui-email">${u.email || '-'}
            <span class="badge badge-${u.role==='super_admin'?'red':u.role==='admin'?'blue':'gray'}" style="margin-left:4px;">${u.role}</span>
          </div>
          <div style="font-size:.72rem;color:var(--text-muted);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap;">
            <span>📅 ${u.tanggal_bergabung||'-'}</span>
            <span>⏳ ${formatMasaKerja(masaKerja)}</span>
            ${u.jabatan?`<span>💼 ${u.jabatan}</span>`:''}
            <span style="color:${sisa<0?'var(--danger)':sisa===0?'var(--warning)':'var(--success)'};">🌴 ${sisa}/${jatah}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge ${u.status_akun==='Aktif'?'badge-green':u.status_akun==='Menunggu Verifikasi'?'badge-yellow':'badge-red'}">
            ${u.status_akun||'Aktif'}
          </span>
          <button class="action-btn ${isAktif?'delete':''}" title="${isAktif?'Non-aktifkan':'Aktifkan'}"
            onclick="toggleStatusUser('${u.id}','${u.status_akun||'Aktif'}')">
            <i class="fa fa-${isAktif?'ban':'check'}"></i>
          </button>
        </div>
      </div>`
  }).join('')
}

/* ---- Render pending list ---- */
function renderPendingList(list) {
  const el = document.getElementById('userListContainer')
  if (!el) return
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa fa-hourglass-half"></i><p>Tidak ada karyawan dalam daftar tunggu</p></div>`
    return
  }
  el.innerHTML = `
    <div class="alert info" style="margin-bottom:12px;">
      <i class="fa fa-info-circle"></i>
      <span>Karyawan berikut belum mendaftar. Minta mereka buka <strong>register.html</strong></span>
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
            📅 ${p.tanggal_bergabung||'-'} · Role: ${p.role}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge badge-yellow"><i class="fa fa-hourglass-half"></i> Menunggu</span>
          <button class="action-btn delete" title="Hapus" onclick="deletePending('${p.id}','${p.nama_lengkap}')">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>`).join('')}
  `
}

/* ---- Delete pending ---- */
window.deletePending = async function(id, nama) {
  if (!confirm(`Hapus data karyawan "${nama}" dari daftar tunggu?`)) return
  await supabase.from('pending_profiles').delete().eq('id', id)
  window._pendingList = window._pendingList.filter(p => p.id !== id)
  renderPendingList(window._pendingList)
}

/* ---- Toggle status ---- */
window.toggleStatusUser = async function(userId, statusSekarang) {
  const statusBaru = statusSekarang === 'Aktif' ? 'Non-Aktif' : 'Aktif'
  if (!confirm(`${statusBaru==='Non-Aktif'?'Non-aktifkan':'Aktifkan kembali'} karyawan ini?`)) return
  await supabase.from('profiles').update({ status_akun: statusBaru }).eq('id', userId)
  if (statusBaru === 'Non-Aktif') {
    await resetCutiKaryawan(userId)
    alert('Karyawan di-non-aktifkan dan sisa cuti direset.')
  } else {
    alert('Karyawan berhasil diaktifkan.')
  }
  await renderUsers()
}

/* ---- Modal helper ---- */
function showUserModal(html) {
  let el = document.getElementById('userModal')
  if (el) el.remove()
  const bg = document.createElement('div')
  bg.id = 'userModal'; bg.className = 'modal-bg open'
  bg.innerHTML = `<div class="modal-box">${html}</div>`
  bg.addEventListener('click', e => { if(e.target===bg) closeUserModal() })
  document.body.appendChild(bg)
}
window.closeUserModal = () => { document.getElementById('userModal')?.remove() }

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
