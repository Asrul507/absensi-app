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
window.currentUser = null
window.currentShift = null
window.supabase = supabase

/* ================= INIT ================= */
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark')
    const icon = document.getElementById('themeIcon')
    if (icon) icon.className = 'fa fa-sun'
  }

  // =====================================================
  // Tangkap token verifikasi dari URL hash
  // Supabase kirim link: https://app.com/#access_token=...&type=signup
  // =====================================================
  const hash = window.location.hash
  const params = new URLSearchParams(hash.replace('#', ''))
  const type = params.get('type')
  const token = params.get('access_token')
  const refresh = params.get('refresh_token') || ''

  if (token && (type === 'signup' || type === 'email_change' || type === 'recovery')) {
    // Bersihkan URL agar token tidak tampil di address bar
    history.replaceState(null, '', window.location.pathname)

    // Set session dari token lalu masuk
    supabase.auth.setSession({ access_token: token, refresh_token: refresh })
      .then(({ error }) => {
        if (error) {
          console.error('setSession error:', error)
          // Fallback: coba getSession
          supabase.auth.getSession().then(() => checkUser())
        } else {
          checkUser()
        }
      })
  } else {
    checkUser()
  }

  // Listener perubahan auth state
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && !window.currentUser) {
      checkUser()
    }
    if (event === 'SIGNED_OUT') {
      window.currentUser = null
    }
    if (event === 'USER_UPDATED' && session) {
      // Email berhasil diubah — sync ke tabel profiles
      if (window.currentUser) {
        window.currentUser.email = session.user.email
        supabase.from('profiles')
          .update({ email: session.user.email })
          .eq('id', session.user.id)
          .then(() => {
            // Refresh halaman profile kalau sedang dibuka
            const emailEl = document.getElementById('profileEmailDisplay')
            if (emailEl) emailEl.textContent = session.user.email
          })
      }
    }
  })
})

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

  // Jika profile ada tapi masih "Menunggu Verifikasi" → update ke Aktif
  if (profile && profile.status_akun === 'Menunggu Verifikasi') {
    await supabase.from('profiles').update({ status_akun: 'Aktif' }).eq('id', user.id)
    profile.status_akun = 'Aktif'
  }

  if (!profile) {
    loginPage.style.display = 'flex'
    appPage.style.display = 'none'
    return
  }

  window.currentUser = profile
  loginPage.style.display = 'none'
  appPage.style.display = 'block'

  const userNameEl = document.getElementById('userName')
  if (userNameEl) userNameEl.innerText = profile.nama_lengkap || user.email

  // Avatar di topbar
  updateTopbarAvatar(profile)

  renderMenu(profile.role)
  renderBottomNav(profile.role)
  navigate('dashboard')
}
window.checkUser = checkUser

/* ---- Update avatar topbar ---- */
function updateTopbarAvatar(profile) {
  const el = document.getElementById('topbarAvatar')
  if (!el) return
  if (profile.foto_url) {
    el.style.backgroundImage = `url(${profile.foto_url})`
    el.style.backgroundSize = 'cover'
    el.textContent = ''
  } else {
    el.style.backgroundImage = ''
    el.textContent = (profile.nama_lengkap || '?')[0].toUpperCase()
  }
}

/* ================= LOGIN ================= */
window.login = async function () {
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  const errEl = document.getElementById('loginError')
  if (errEl) errEl.style.display = 'none'
  const ok = await doLogin(email, password)
  if (ok) await checkUser()
}

/* ================= LOGOUT ================= */
window.logout = logout

/* ================= MENU ================= */
function renderMenu(role) {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return

  const adminMenu = [
    { key:'dashboard', name:'Dashboard', icon:'fa-house' },
    { key:'absensi', name:'Absensi', icon:'fa-clock' },
    { key:'shift', name:'Shift', icon:'fa-calendar' },
    { key:'jadwal', name:'Jadwal', icon:'fa-calendar-days' },
    { key:'pengajuan', name:'Approval', icon:'fa-inbox' },
    { key:'users', name:'Karyawan', icon:'fa-users' },
    { key:'riwayat', name:'Riwayat', icon:'fa-list' },
    { key:'kalender', name:'Kalender', icon:'fa-calendar' },
  ]

  const staffMenu = [
    { key:'dashboard', name:'Dashboard', icon:'fa-house' },
    { key:'absensi', name:'Absensi', icon:'fa-clock' },
    { key:'pengajuan', name:'Pengajuan', icon:'fa-file-alt' },
    { key:'riwayat', name:'Riwayat', icon:'fa-list' },
    { key:'kalender', name:'Kalender', icon:'fa-calendar-alt' },
    { key:'profile', name:'Profil Saya', icon:'fa-user' },
  ]

  const menu = (role === 'staff') ? staffMenu : adminMenu

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
        { key:'dashboard', icon:'fa-house', label:'Home' },
        { key:'absensi', icon:'fa-clock', label:'Absen' },
        { key:'profile', icon:'fa-user', label:'Profil' },
      ]
    : [
        { key:'dashboard', icon:'fa-house', label:'Home' },
        { key:'absensi', icon:'fa-clock', label:'Absen' },
        { key:'pengajuan', icon:'fa-inbox', label:'Approval' },
        { key:'users', icon:'fa-users', label:'Karyawan' },
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
    case 'absensi': renderAbsensi(window.currentUser); break
    case 'shift': renderShiftManagement(); break
    case 'jadwal': renderJadwalManagement(); break
    case 'pengajuan': renderPengajuan(window.currentUser); break
    case 'riwayat': renderRiwayat(window.currentUser); break
    case 'kalender': renderKalenderHR(); break
    case 'profile': renderProfile(); break
    case 'users': await renderUsers(); break
    default:
      document.getElementById('content').innerHTML = `<div class="card"><h2>${page}</h2></div>`
  }
}

/* ================================================================
   PROFILE PAGE — dengan upload foto
================================================================ */
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
        ${infoRow('Tgl Lahir', u.tanggal_lahir || '-')}
        ${infoRow('Status', `<span class="badge ${u.status_akun==='Aktif'?'badge-green':'badge-yellow'}">${u.status_akun||'Aktif'}</span>`)}
      </div>

      <div class="card fade-up-2">
        <div class="card-title"><i class="fa fa-briefcase"></i> Info Kerja</div>
        ${infoRow('Bergabung', u.tanggal_bergabung || '-')}
        ${infoRow('Masa Kerja', formatMasaKerja(masaKerja))}
        ${infoRow('Role', u.role || '-')}
      </div>

      <div class="card fade-up-3" id="cutiCard">
        <div class="card-title"><i class="fa fa-umbrella-beach"></i> Info Cuti</div>
        <p style="color:var(--text-muted);font-size:.82rem;">Memuat...</p>
      </div>

      <div class="card fade-up-3">
        <div class="card-title"><i class="fa fa-lock"></i> Pengaturan Akun</div>

        <div style="background:var(--gray-50);border-radius:var(--r-md);padding:12px 14px;margin-bottom:14px;">
          <div style="font-size:.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;font-weight:700;margin-bottom:3px;">Email Aktif</div>
          <div style="font-weight:700;font-size:.9rem;word-break:break-all;">${u.email || '-'}</div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
          <button class="btn-secondary btn-sm" onclick="openGantiEmail()">
            <i class="fa fa-envelope"></i> Ganti Email
          </button>
          <button class="btn-secondary btn-sm" onclick="openGantiPassword()">
            <i class="fa fa-key"></i> Ganti Password
          </button>
        </div>

        <div style="height:1px;background:var(--gray-100);margin-bottom:14px;"></div>

        <button class="btn-danger btn-sm" onclick="logout()">
          <i class="fa fa-sign-out-alt"></i> Keluar dari Aplikasi
        </button>
      </div>

    </div>
  `

  // Load cuti
  getSisaCuti(u.id, u.tanggal_bergabung).then(({ jatah, terpakai, sisa }) => {
    const el = document.getElementById('cutiCard')
    if (!el) return
    el.innerHTML = `
      <div class="card-title"><i class="fa fa-umbrella-beach"></i> Info Cuti</div>
      ${infoRow('Jatah Tahunan', jatah + ' hari')}
      ${infoRow('Terpakai', `<span style="color:var(--warning);font-weight:700;">${terpakai} hari</span>`)}
      ${infoRow('Sisa', `<span style="color:${sisa<0?'var(--danger)':'var(--success)'};font-weight:800;">${sisa} hari${sisa<0?' (minus)':''}</span>`)}
      <button class="btn-primary btn-sm" onclick="navigate('pengajuan')" style="margin-top:12px;">
        <i class="fa fa-plus"></i> Ajukan Cuti
      </button>
    `
  })
}

/* ---- Upload foto profil ---- */
window.uploadFotoProfil = async function (input) {
  const file = input.files[0]
  const status = document.getElementById('uploadStatus')
  if (!file) return

  // Validasi ukuran (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    if (status) status.textContent = '⚠ Ukuran foto max 2MB'
    return
  }

  if (status) status.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mengupload...'

  const ext = file.name.split('.').pop()
  const fileName = `avatar-${window.currentUser.id}-${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, { upsert: true })

  if (uploadErr) {
    if (status) status.textContent = '⚠ Upload gagal: ' + uploadErr.message
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

/* ================================================================
   GANTI EMAIL
================================================================ */
window.openGantiEmail = function () {
  showProfileModal(`
    <div class="modal-header">
      <h3><i class="fa fa-envelope" style="color:var(--primary);"></i> Ganti Email</h3>
      <button class="modal-close" onclick="closeProfileModal()"><i class="fa fa-times"></i></button>
    </div>

    <div class="alert info" style="margin-bottom:16px;">
      <i class="fa fa-info-circle"></i>
      <span>Link konfirmasi akan dikirim ke <strong>email baru</strong>. Email akan berganti setelah kamu klik link tersebut.</span>
    </div>

    <div class="field">
      <label>Email Baru <span class="req">*</span></label>
      <input type="email" id="inputEmailBaru" placeholder="emailbaru@contoh.com" autocomplete="email"/>
    </div>

    <div class="field">
      <label>Konfirmasi Email Baru <span class="req">*</span></label>
      <input type="email" id="inputEmailKonfirm" placeholder="Ulangi email baru"/>
    </div>

    <p id="gantiEmailError" style="display:none;font-size:.8rem;color:var(--danger);
      padding:8px 12px;background:var(--danger-light);border:1px solid var(--danger-mid);
      border-radius:var(--r-md);margin-top:4px;"></p>

    <p id="gantiEmailSuccess" style="display:none;font-size:.8rem;color:var(--success);
      padding:8px 12px;background:var(--success-light);border:1px solid var(--success-mid);
      border-radius:var(--r-md);margin-top:4px;"></p>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeProfileModal()">Batal</button>
      <button class="btn-primary" id="btnKirimEmail" onclick="submitGantiEmail()">
        <i class="fa fa-paper-plane"></i> Kirim Konfirmasi
      </button>
    </div>
  `)
}

window.submitGantiEmail = async function () {
  const emailBaru = document.getElementById('inputEmailBaru').value.trim()
  const emailKonfirm = document.getElementById('inputEmailKonfirm').value.trim()
  const errEl = document.getElementById('gantiEmailError')
  const okEl = document.getElementById('gantiEmailSuccess')
  const btn = document.getElementById('btnKirimEmail')

  errEl.style.display = 'none'
  okEl.style.display = 'none'

  // Validasi
  if (!emailBaru) {
    errEl.textContent = '⚠ Email baru wajib diisi'
    errEl.style.display = 'block'
    return
  }
  if (!emailBaru.includes('@') || !emailBaru.includes('.')) {
    errEl.textContent = '⚠ Format email tidak valid'
    errEl.style.display = 'block'
    return
  }
  if (emailBaru !== emailKonfirm) {
    errEl.textContent = '⚠ Email dan konfirmasi tidak cocok'
    errEl.style.display = 'block'
    return
  }
  if (emailBaru === window.currentUser.email) {
    errEl.textContent = '⚠ Email baru sama dengan email sekarang'
    errEl.style.display = 'block'
    return
  }

  btn.disabled = true
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mengirim...'

  // Update email via Supabase Auth
  const { error } = await supabase.auth.updateUser({ email: emailBaru })

  btn.disabled = false
  btn.innerHTML = '<i class="fa fa-paper-plane"></i> Kirim Konfirmasi'

  if (error) {
    errEl.textContent = '⚠ ' + (
      error.message.includes('already registered')
        ? 'Email ini sudah digunakan akun lain'
        : error.message
    )
    errEl.style.display = 'block'
    return
  }

  // Tampilkan sukses
  okEl.innerHTML = `
    <i class="fa fa-circle-check"></i>
    Link konfirmasi dikirim ke <strong>${emailBaru}</strong>.<br>
    Cek inbox dan klik link untuk menyelesaikan perubahan email.
  `
  okEl.style.display = 'block'

  // Disable form setelah berhasil
  document.getElementById('inputEmailBaru').disabled = true
  document.getElementById('inputEmailKonfirm').disabled = true
  btn.style.display = 'none'
}

/* ================================================================
   GANTI PASSWORD
================================================================ */
window.openGantiPassword = function () {
  showProfileModal(`
    <div class="modal-header">
      <h3><i class="fa fa-key" style="color:var(--primary);"></i> Ganti Password</h3>
      <button class="modal-close" onclick="closeProfileModal()"><i class="fa fa-times"></i></button>
    </div>

    <div class="field">
      <label>Password Baru <span class="req">*</span></label>
      <div style="position:relative;">
        <input type="password" id="inputPassBaru" placeholder="Min. 8 karakter"
          autocomplete="new-password" oninput="cekKekuatanPass(this.value)"
          style="padding-right:42px;"/>
        <button onclick="togglePassVis('inputPassBaru', this)"
          style="position:absolute;right:10px;top:50%;transform:translateY(-50%);
            background:none;border:none;cursor:pointer;color:var(--gray-400);padding:4px;
            min-height:unset!important;width:auto!important;margin:0!important;">
          <i class="fa fa-eye"></i>
        </button>
      </div>
      <div style="height:4px;border-radius:999px;background:var(--gray-100);margin-top:6px;overflow:hidden;">
        <div id="passStrengthBar" style="height:100%;border-radius:999px;width:0;transition:.3s;"></div>
      </div>
      <div id="passStrengthLabel" style="font-size:.68rem;margin-top:3px;color:var(--text-muted);"></div>
    </div>

    <div class="field">
      <label>Konfirmasi Password Baru <span class="req">*</span></label>
      <div style="position:relative;">
        <input type="password" id="inputPassKonfirm" placeholder="Ulangi password baru"
          autocomplete="new-password" oninput="cekKonfirmPass()"
          style="padding-right:42px;"/>
        <button onclick="togglePassVis('inputPassKonfirm', this)"
          style="position:absolute;right:10px;top:50%;transform:translateY(-50%);
            background:none;border:none;cursor:pointer;color:var(--gray-400);padding:4px;
            min-height:unset!important;width:auto!important;margin:0!important;">
          <i class="fa fa-eye"></i>
        </button>
      </div>
      <div id="passKonfirmMsg" style="font-size:.72rem;margin-top:4px;min-height:16px;"></div>
    </div>

    <p id="gantiPassError" style="display:none;font-size:.8rem;color:var(--danger);
      padding:8px 12px;background:var(--danger-light);border:1px solid var(--danger-mid);
      border-radius:var(--r-md);margin-top:4px;"></p>

    <p id="gantiPassSuccess" style="display:none;font-size:.8rem;color:var(--success);
      padding:8px 12px;background:var(--success-light);border:1px solid var(--success-mid);
      border-radius:var(--r-md);margin-top:4px;"></p>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeProfileModal()">Batal</button>
      <button class="btn-primary" id="btnSimpanPass" onclick="submitGantiPassword()">
        <i class="fa fa-save"></i> Simpan Password
      </button>
    </div>
  `)
}

window.cekKekuatanPass = function (val) {
  const bar = document.getElementById('passStrengthBar')
  const label = document.getElementById('passStrengthLabel')
  if (!bar) return
  let score = 0
  if (val.length >= 8) score++
  if (val.length >= 12) score++
  if (/[A-Z]/.test(val)) score++
  if (/[0-9]/.test(val)) score++
  if (/[^A-Za-z0-9]/.test(val)) score++
  const levels = [
    { w:'0%', bg:'', txt:'' },
    { w:'25%', bg:'#ef4444', txt:'Lemah' },
    { w:'50%', bg:'#f59e0b', txt:'Cukup' },
    { w:'75%', bg:'#3b82f6', txt:'Kuat' },
    { w:'100%', bg:'#22c55e', txt:'Sangat Kuat' },
  ]
  const lv = levels[Math.min(score, 4)]
  bar.style.width = lv.w
  bar.style.background = lv.bg
  label.textContent = lv.txt
  label.style.color = lv.bg
}

window.cekKonfirmPass = function () {
  const pass = document.getElementById('inputPassBaru')?.value
  const konf = document.getElementById('inputPassKonfirm')?.value
  const msg = document.getElementById('passKonfirmMsg')
  if (!msg || !konf) return
  msg.innerHTML = pass === konf
    ? '<span style="color:#16a34a;"><i class="fa fa-check"></i> Password cocok</span>'
    : '<span style="color:#dc2626;"><i class="fa fa-times"></i> Password tidak cocok</span>'
}

window.togglePassVis = function (inputId, btn) {
  const input = document.getElementById(inputId)
  if (!input) return
  const isPass = input.type === 'password'
  input.type = isPass ? 'text' : 'password'
  btn.querySelector('i').className = isPass ? 'fa fa-eye-slash' : 'fa fa-eye'
}

window.submitGantiPassword = async function () {
  const passBaru = document.getElementById('inputPassBaru').value
  const konfirm = document.getElementById('inputPassKonfirm').value
  const errEl = document.getElementById('gantiPassError')
  const okEl = document.getElementById('gantiPassSuccess')
  const btn = document.getElementById('btnSimpanPass')

  errEl.style.display = 'none'
  okEl.style.display = 'none'

  if (!passBaru) {
    errEl.textContent = '⚠ Password baru wajib diisi'
    errEl.style.display = 'block'
    return
  }
  if (passBaru.length < 8) {
    errEl.textContent = '⚠ Password minimal 8 karakter'
    errEl.style.display = 'block'
    return
  }
  if (passBaru !== konfirm) {
    errEl.textContent = '⚠ Password dan konfirmasi tidak cocok'
    errEl.style.display = 'block'
    return
  }

  btn.disabled = true
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Menyimpan...'

  const { error } = await supabase.auth.updateUser({ password: passBaru })

  btn.disabled = false
  btn.innerHTML = '<i class="fa fa-save"></i> Simpan Password'

  if (error) {
    errEl.textContent = '⚠ ' + error.message
    errEl.style.display = 'block'
    return
  }

  okEl.innerHTML = '<i class="fa fa-circle-check"></i> Password berhasil diperbarui!'
  okEl.style.display = 'block'

  // Tutup modal otomatis setelah 2 detik
  setTimeout(() => closeProfileModal(), 2000)
}

/* ---- Modal helper untuk profile ---- */
function showProfileModal(html) {
  let el = document.getElementById('profileModal')
  if (el) el.remove()
  const bg = document.createElement('div')
  bg.id = 'profileModal'; bg.className = 'modal-bg open'
  bg.innerHTML = `<div class="modal-box">${html}</div>`
  bg.addEventListener('click', e => { if (e.target === bg) closeProfileModal() })
  document.body.appendChild(bg)
}
window.closeProfileModal = () => { document.getElementById('profileModal')?.remove() }

/* ================================================================
   USERS / KARYAWAN PAGE
================================================================ */
async function renderUsers() {
  const content = document.getElementById('content')
  const canAdmin = window.currentUser.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-users"></i> Manajemen Karyawan</h2>
      <button class="btn-primary btn-sm" onclick="openFormTambah()">
        <i class="fa fa-plus"></i> Tambah Karyawan
      </button>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button id="tabAktif" class="btn-primary btn-sm" onclick="switchTab('aktif')">
        <i class="fa fa-users"></i> Karyawan Aktif
      </button>
      <button id="tabPending" class="btn-secondary btn-sm" onclick="switchTab('pending')">
        <i class="fa fa-hourglass-half"></i> Menunggu Daftar
      </button>
    </div>

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
  window._cutiMap = {}
  ;(cutiData||[]).forEach(c => { window._cutiMap[c.user_id] = (window._cutiMap[c.user_id]||0) + (parseInt(c.jumlah_hari)||0) })
  window._allUsers = users || []
  window._pendingList = pending || []
  window._currentTab = 'aktif'

  renderUserList(window._allUsers)

  // Tab
  window.switchTab = function(tab) {
    window._currentTab = tab
    document.getElementById('tabAktif').className = tab=='aktif' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
    document.getElementById('tabPending').className = tab=='pending' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
    if (tab === 'aktif') renderUserList(window._allUsers)
    else renderPendingList(window._pendingList)
  }

  window.filterUsers = function() {
    const q = document.getElementById('searchUser').value.toLowerCase()
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
      nama_lengkap: nama,
      jabatan: document.getElementById('pJabatan').value.trim(),
      departemen: document.getElementById('pDept').value.trim(),
      no_hp: document.getElementById('pHp').value.trim(),
      tanggal_bergabung: document.getElementById('pTgl').value || null,
      tanggal_lahir: document.getElementById('pLahir').value || null,
      role: document.getElementById('pRole').value,
      created_by: window.currentUser.id,
    }])

    if (error) { alert('Gagal simpan: ' + error.message); return }
    closeUserModal()
    alert(`✅ Data ${nama} disimpan!\n\nMinta karyawan buka halaman register.html untuk mendaftar dengan email & password mereka.`)
    await renderUsers()
  }
}

/* ---- Render list karyawan ---- */
function renderUserList(users) {
  const el = document.getElementById('userListContainer')
  if (!el) return
  if (!users.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa fa-users"></i><p>Tidak ada karyawan</p></div>`
    return
  }
  el.innerHTML = users.map(u => {
    const masaKerja = hitungMasaKerja(u.tanggal_bergabung)
    const jatah = hitungJatahCuti(u.tanggal_bergabung)
    const terpakai = (window._cutiMap||{})[u.id] || 0
    const sisa = jatah - terpakai
    const isAktif = u.status_akun !== 'Non-Aktif'

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

/* ================= HELPERS ================= */
function infoRow(label, value) {
  return `<div class="info-row"><div class="ir-label">${label}</div><div class="ir-val">${value}</div></div>`
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
document.addEventListener('keydown', e => { if(e.key==='Escape') closeSidebar() })

/* ================= DARK MODE ================= */
window.toggleTheme = function() {
  document.documentElement.classList.toggle('dark')
  const isDark = document.documentElement.classList.contains('dark')
  const icon = document.getElementById('themeIcon')
  if (icon) icon.className = isDark ? 'fa fa-sun' : 'fa fa-moon'
  localStorage.setItem('theme', isDark ? 'dark' : 'light')
}
