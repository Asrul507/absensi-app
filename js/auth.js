import { supabase } from './supabase.js'

/* ================= LOGIN ================= */
export async function login(email, password) {
  const btn = document.getElementById('btnLogin')
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Loading...' }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-sign-in-alt"></i> Masuk' }

  if (error) {
    showLoginError(error.message)
    return false
  }
  return true
}

/* ================= SIGNUP ================= */
export async function signup(email, password, role = 'staff', extraData = {}) {
  if (!email || !password) {
    alert('Email & password wajib diisi')
    return false
  }
  if (password.length < 6) {
    alert('Password minimal 6 karakter')
    return false
  }

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    alert(error.message)
    return false
  }

  const user = data.user
  if (user) {
    const tanggalBergabung = extraData.tanggal_bergabung || new Date().toISOString().split('T')[0]
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{
        id: user.id,
        email,
        nama_lengkap: extraData.nama_lengkap || email.split('@')[0],
        role,
        status_akun: 'Aktif',
        tanggal_bergabung: tanggalBergabung,
        jabatan: extraData.jabatan || '',
        departemen: extraData.departemen || '',
        no_hp: extraData.no_hp || '',
        sisa_cuti: 0
      }])

    if (profileError) {
      alert(profileError.message)
      return false
    }
  }

  return true
}

/* ================= LOGOUT ================= */
export async function logout() {
  await supabase.auth.signOut()
  location.reload()
}

/* ================= HELPER: tampilkan error login ================= */
function showLoginError(msg) {
  const el = document.getElementById('loginError')
  if (el) {
    el.textContent = '⚠ ' + msg
    el.style.display = 'block'
  } else {
    alert(msg)
  }
}
