import { supabase } from './supabase.js'

/* ================= LOGIN ================= */
export async function login(email, password) {

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    alert(error.message)
    return
  }
}

/* ================= SIGNUP ================= */
export async function signup(email, password, role = 'staff') {

  if (!email || !password) {
    alert('Email & password wajib diisi')
    return
  }

  if (password.length < 6) {
    alert('Password minimal 6 karakter')
    return
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  })

  console.log('SIGNUP:', data)
  console.log('ERROR:', error)

  if (error) {
    alert(error.message)
    return
  }

  const user = data.user

  if (user) {

    const { error: profileError } = await supabase
      .from('profiles')
      .insert([
        {
          id: user.id,
          email,
          nama_lengkap: email.split('@')[0],
           role: 'staff',
          status_akun: 'Aktif'
        }
      ])

    console.log('PROFILE ERROR:', profileError)

    if (profileError) {
      alert(profileError.message)
      return
    }
  }

  alert('Signup berhasil')
}

/* ================= LOGOUT ================= */
export async function logout() {

  await supabase.auth.signOut()

  location.reload()
}