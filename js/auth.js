import { supabase } from './supabase.js'

/* ================= LOGIN ================= */
export async function login(email, password) {
  const btn = document.getElementById('btnLogin')
  if (btn) {
    btn.disabled = true
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (btn) {
    btn.disabled = false
    btn.innerHTML = '<i class="fa fa-sign-in-alt"></i> Masuk'
  }

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
export async function registerKaryawan(pendingId, email, password, konfirmasi) {
  // Validasi input
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

  const btn = document.getElementById('btnDaftar')
  if (btn) {
    btn.disabled = true
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mendaftarkan...'
  }

  // Ambil data pending
  const { data: pending, error: pendingErr } = await supabase
    .from('pending_profiles')
    .select('*')
    .eq('id', pendingId)
    .eq('status', 'waiting')
    .single()

  if (pendingErr || !pending) {
    showRegError('Data karyawan tidak ditemukan atau sudah terdaftar')
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-user-plus"></i> Daftar & Kirim Verifikasi' }
    return false
  }

  // Signup ke Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        pending_id:   pendingId,
        nama_lengkap: pending.nama_lengkap,
      }
    }
  })

  if (error) {
    showRegError(
      error.message.includes('already registered')
        ? 'Email ini sudah terdaftar. Silakan gunakan email lain atau login.'
        : error.message
    )
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-user-plus"></i> Daftar & Kirim Verifikasi' }
    return false
  }

  const user = data.user
  if (user) {
    // Buat profil langsung (akan aktif setelah email terverifikasi)
    const { error: profileError } = await supabase.from('profiles').insert([{
      id:                user.id,
      email,
      nama_lengkap:      pending.nama_lengkap,
      role:              pending.role || 'staff',
      jabatan:           pending.jabatan || '',
      departemen:        pending.departemen || '',
      no_hp:             pending.no_hp || '',
      tanggal_bergabung: pending.tanggal_bergabung || null,
      tanggal_lahir:     pending.tanggal_lahir || null,
      status_akun:       'Menunggu Verifikasi',
      foto_url:          '',
      sisa_cuti:         0,
      jatah_cuti:        0,
    }])

    if (profileError) {
      console.error('Profile insert error:', profileError)
      // Lanjut saja, profil bisa di-setup ulang saat login pertama
    }

    // Update pending → registered
    await supabase.from('pending_profiles')
      .update({ status: 'registered' })
      .eq('id', pendingId)
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-user-plus"></i> Daftar & Kirim Verifikasi' }
  return true
}

/* ===============================================================
   SIGNUP LANGSUNG (untuk HRD buat akun tanpa pending flow)
   Dipakai saat HRD ingin buat akun sekaligus dengan email
=============================================================== */
export async function signup(email, password, role = 'staff', extraData = {}) {
  if (!email || !password) { alert('Email & password wajib diisi'); return false }
  if (password.length < 6) { alert('Password minimal 6 karakter'); return false }

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) { alert(error.message); return false }

  const user = data.user
  if (user) {
    const { error: profileError } = await supabase.from('profiles').insert([{
      id:                user.id,
      email,
      nama_lengkap:      extraData.nama_lengkap || email.split('@')[0],
      role,
      jabatan:           extraData.jabatan      || '',
      departemen:        extraData.departemen   || '',
      no_hp:             extraData.no_hp        || '',
      tanggal_bergabung: extraData.tanggal_bergabung || null,
      tanggal_lahir:     extraData.tanggal_lahir     || null,
      status_akun:       'Aktif',
      foto_url:          '',
      sisa_cuti:         0,
      jatah_cuti:        0,
    }])
    if (profileError) { alert(profileError.message); return false }
  }
  return true
}

/* ================= HELPERS ================= */
function showLoginError(msg) {
  const el = document.getElementById('loginError')
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block' }
  else alert(msg)
}

function showRegError(msg) {
  const el = document.getElementById('regError')
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block' }
  else alert(msg)
}

