import { supabase } from './supabase.js'
import { showToast, setButtonLoading } from './feedback.js'

/* ================= LOGIN ================= */
export async function login(email, password) {
  const btn = document.getElementById('btnLogin')
  setButtonLoading(btn, true, '<i class="fa fa-spinner fa-spin"></i> Memproses...')

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  console.log('LOGIN RESULT:', data)
  console.log('LOGIN ERROR:', error)

  setButtonLoading(btn, false, '<i class="fa fa-sign-in-alt"></i> Masuk')

  if (error) {
    showLoginError(
      error.message.includes('Email not confirmed')
        ? 'Email belum diverifikasi. Cek inbox email kamu dan klik link verifikasi.'
        : error.message.includes('Invalid login')
          ? 'Email atau password salah.'
          : error.message
    )
    return false
  }
  return true
}

/* ================= LOGOUT ================= */
export async function logout() {
  await supabase.auth.signOut()
  location.reload()
}

/* ===============================================================
   DAFTAR KARYAWAN BARU
   Dipanggil dari halaman registrasi (karyawan pilih nama sendiri)
=============================================================== */
export async function registerKaryawan(
  pendingId,
  email,
  password,
  konfirmasi
) {

  // ================= VALIDASI =================
  if (!email || !password) {
    showRegError('Email dan password wajib diisi')
    return false
  }

  if (password.length < 8) {
    showRegError('Password minimal 8 karakter')
    return false
  }

  if (password !== konfirmasi) {
    showRegError('Password dan konfirmasi tidak cocok')
    return false
  }

  if (!email.includes('@') || !email.includes('.')) {
    showRegError('Format email tidak valid')
    return false
  }

  // ================= LOADING BUTTON =================
  const btn = document.getElementById('btnDaftar')

  if (btn) {
    btn.disabled = true
    btn.innerHTML =
      '<i class="fa fa-spinner fa-spin"></i> Mendaftarkan...'
  }

  try {

    // ================= AMBIL DATA PENDING =================
    const {
      data: pending,
      error: pendingErr
    } = await supabase
      .from('pending_profiles')
      .select('*')
      .eq('id', pendingId)
      .eq('status', 'waiting')
      .single()

    if (pendingErr || !pending) {
      throw new Error(
        'Data karyawan tidak ditemukan atau sudah terdaftar'
      )
    }

    // ================= SIGNUP =================
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://hrpro01.netlify.app/callback.html',
        data: {
          pending_id: pendingId,
          nama_lengkap: pending.nama_lengkap,
        }
      }
    })

    // ================= ERROR =================
    if (error) {
      if (error.message.includes('already registered')) {
        throw new Error(
          'Email ini sudah terdaftar. Silakan login atau gunakan email lain.'
        )
      }
      throw error
    }

    const user = data?.user

    // ================= BUAT PROFILE =================
    if (user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: user.id,
          email,
          nama_lengkap: pending.nama_lengkap,
          role: pending.role || 'staff',
          jabatan: pending.jabatan || '',
          departemen: pending.departemen || '',
          no_hp: pending.no_hp || '',
          tanggal_bergabung: pending.tanggal_bergabung || null,
          tanggal_lahir: pending.tanggal_lahir || null,
          status_akun: 'Menunggu Verifikasi',
          foto_url: '',
          sisa_cuti: 0,
          jatah_cuti: 0,
          titik_radius: pending.titik_radius || null 
        }])

      if (profileError) {
        console.error('PROFILE ERROR:', profileError)
      }

      // ================= UPDATE PENDING =================
      await supabase
        .from('pending_profiles')
        .update({
          status: 'registered'
        })
        .eq('id', pendingId)
    }

    return true

  } catch (err) {
    console.error(err)
    showRegError(
      err.message || 'Terjadi kesalahan saat registrasi'
    )
    return false
  } finally {
    // ================= RESET BUTTON =================
    if (btn) {
      btn.disabled = false
      btn.innerHTML = '<i class="fa fa-user-plus"></i> Daftar & Kirim Verifikasi'
    }
  }
}

/* ===============================================================
   SIGNUP LANGSUNG (untuk HRD buat akun tanpa pending flow)
   Dipakai saat HRD ingin buat akun sekaligus dengan email
=============================================================== */
export async function signup(email, password, role = 'staff', extraData = {}) {
  if (!email || !password) { showToast('Email & password wajib diisi', 'warning'); return false }
  if (password.length < 6) { showToast('Password minimal 6 karakter', 'warning'); return false }

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) { showToast(error.message, 'error'); return false }

  const user = data.user
  if (user) {
    const { error: profileError } = await supabase.from('profiles').insert([{
      id: user.id,
      email,
      nama_lengkap: extraData.nama_lengkap || email.split('@')[0],
      role,
      jabatan: extraData.jabatan || '',
      departemen: extraData.departemen || '',
      no_hp: extraData.no_hp || '',
      tanggal_bergabung: extraData.tanggal_bergabung || null,
      tanggal_lahir: extraData.tanggal_lahir || null,
      status_akun: 'Aktif',
      foto_url: '',
      sisa_cuti: 0,
      jatah_cuti: 0,
      titik_radius: extraData.titik_radius || null
    }])
    if (profileError) { showToast(profileError.message, 'error'); return false }
  }
  return true
}

/* ================= HELPERS ================= */
function showLoginError(msg) {
  const el = document.getElementById('loginError')
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block' }
  else showToast(msg, 'error')
}

function showRegError(msg) {
  const el = document.getElementById('regError')
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block' }
  else showToast(msg, 'error')
}

/* ===============================================================
   UPDATE PASSWORD USER (Bisa untuk diri sendiri atau di-reset Admin)
=============================================================== */
export async function updateUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    showToast('Password baru minimal 6 karakter!', 'warning')
    return false
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (error) {
    showToast('Gagal memperbarui password: ' + error.message, 'error')
    return false
  }
  return true
}
