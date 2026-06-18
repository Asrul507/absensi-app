import { supabase } from './supabase.js'
import { showToast, setButtonLoading } from './feedback.js'
import { normalizeRole } from './access-control.js'

const DEBUG_AUTH = false

/* ================= LOGIN ================= */
async function fetchClientByCode(clientCode) {
  const cleanClientCode = String(clientCode || '').trim().toLowerCase()
  if (!cleanClientCode) return null
  const escapedCode = cleanClientCode.replace(/[,()]/g, '')
  const { data, error } = await supabase
    .from('clients')
    .select('id,nama_client,kode_client,domain_login,status')
    .or(`kode_client.eq.${escapedCode},domain_login.eq.${escapedCode}`)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function fetchDefaultClient() {
  return fetchClientByCode('@default')
}

async function fetchOrCreateDepartment({ clientId, departmentId, departemen }) {
  if (departmentId) return departmentId
  const namaDepartment = String(departemen || '').trim()
  if (!clientId || !namaDepartment) return null

  const { data: existing, error: existingError } = await supabase
    .from('departments')
    .select('id')
    .eq('client_id', clientId)
    .eq('nama_department', namaDepartment)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing?.id) return existing.id

  const { data: inserted, error: insertError } = await supabase
    .from('departments')
    .insert([{ client_id: clientId, nama_department: namaDepartment, status: 'active' }])
    .select('id')
    .maybeSingle()
  if (insertError) {
    console.warn('Gagal membuat department otomatis dari pending profile:', insertError)
    return null
  }
  return inserted?.id || null
}

function buildTenantContext(profile, selectedClient = null, globalMode = false) {
  return {
    mode: globalMode ? 'global' : 'client',
    user_id: profile.id,
    role: normalizeRole(profile.role),
    client_id: globalMode ? null : (selectedClient?.id || profile.client_id || null),
    department_id: globalMode ? null : (profile.department_id || null),
    nama_client: globalMode ? 'Global Admin' : (selectedClient?.nama_client || 'Client'),
    kode_client: globalMode ? null : (selectedClient?.kode_client || null)
  }
}

export async function login(email, password, clientCode = '') {
  const btn = document.getElementById('btnLogin')
  setButtonLoading(btn, true, '<i class="fa fa-spinner fa-spin"></i> Memproses...')

  const cleanClientCode = String(clientCode || '').trim().toLowerCase()
  let selectedClient = null

  try {
    if (cleanClientCode) {
      selectedClient = await fetchClientByCode(cleanClientCode)
      if (!selectedClient) {
        showLoginError('Kode kantor tidak ditemukan. Periksa kembali kode/domain login kantor Anda.')
        return false
      }
      if (selectedClient.status !== 'active') {
        showLoginError('Kantor/client ini sedang nonaktif. Hubungi administrator.')
        return false
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (DEBUG_AUTH) {
      console.log('LOGIN RESULT:', data)
      console.log('LOGIN ERROR:', error)
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

    const authUser = data?.user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,role,client_id,department_id,nama_lengkap')
      .eq('id', authUser?.id)
      .maybeSingle()

    if (profileError || !profile) {
      await supabase.auth.signOut()
      showLoginError('Profil akun tidak ditemukan. Hubungi HR/admin.')
      return false
    }

    const role = normalizeRole(profile.role)
    const isSuperAdmin = role === 'super_admin'

    if (!cleanClientCode) {
      if (!isSuperAdmin) {
        await supabase.auth.signOut()
        showLoginError('Kode kantor wajib diisi untuk akun kantor.')
        return false
      }
      sessionStorage.setItem('tenantContext', JSON.stringify(buildTenantContext({ ...profile, role }, null, true)))
      return true
    }

    if (!isSuperAdmin && String(profile.client_id || '') !== String(selectedClient.id)) {
      await supabase.auth.signOut()
      showLoginError('Akun ini tidak terdaftar pada kantor/client yang dipilih.')
      return false
    }

    sessionStorage.setItem('tenantContext', JSON.stringify(buildTenantContext({ ...profile, role }, selectedClient, false)))
    return true
  } catch (err) {
    console.error('LOGIN ERROR:', err)
    showLoginError('Login gagal diproses. Coba lagi beberapa saat atau hubungi admin.')
    return false
  } finally {
    setButtonLoading(btn, false, '<i class="fa fa-sign-in-alt"></i> Masuk')
  }
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
      .maybeSingle()

    if (pendingErr || !pending) {
      throw new Error('Data karyawan tidak ditemukan atau sudah terdaftar')
    }

    const defaultClient = pending.client_id ? null : await fetchDefaultClient()
    const clientId = pending.client_id || defaultClient?.id || null
    const role = normalizeRole(pending.role || 'staff')
    let departmentId = pending.department_id || null

    if (!clientId) {
      throw new Error('Client untuk registrasi belum tersedia. Hubungi admin.')
    }

    departmentId = await fetchOrCreateDepartment({
      clientId,
      departmentId,
      departemen: pending.departemen
    })

    const signupMetadata = {
      pending_id: String(pendingId),
      nama_lengkap: pending.nama_lengkap || '',
      role,
      client_id: clientId,
      department_id: departmentId || null
    }

    // ================= SIGNUP =================
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/callback.html`,
        data: signupMetadata
      }
    })

    // ================= ERROR =================
    if (error) {
      console.error('REGISTER AUTH ERROR:', { pending, signupMetadata, error })
      const msg = String(error.message || '')
      if (msg.includes('already registered') || msg.includes('User already registered')) {
        throw new Error('Email ini sudah terdaftar. Silakan login atau gunakan email lain.')
      }
      if (error.name === 'AuthRetryableFetchError' || msg.includes('500') || msg.toLowerCase().includes('fetch')) {
        throw new Error('Server auth sedang bermasalah atau konfigurasi email belum benar. Coba lagi beberapa saat atau hubungi admin.')
      }
      throw error
    }

    const user = data?.user

    // ================= BUAT PROFILE =================
    if (user) {
      const profilePayload = {
        id: user.id,
        email,
        nama_lengkap: pending.nama_lengkap,
        role,
        client_id: clientId,
        department_id: departmentId,
        jabatan: pending.jabatan || '',
        departemen: pending.departemen || '',
        no_hp: pending.no_hp || '',
        tanggal_bergabung: pending.tanggal_bergabung || null,
        tanggal_lahir: pending.tanggal_lahir || null,
        jenis_kontrak: pending.jenis_kontrak || null,
        kontrak_mulai: pending.kontrak_mulai || null,
        durasi_kontrak: pending.durasi_kontrak || null,
        satuan_durasi_kontrak: pending.satuan_durasi_kontrak || 'bulan',
        masa_kontrak: pending.masa_kontrak || null,
        kontrak_berakhir: pending.kontrak_berakhir || null,
        status_kontrak: pending.status_kontrak || 'aktif',
        status_akun: 'Menunggu Verifikasi',
        foto_url: '',
        sisa_cuti: pending.sisa_cuti || 0,
        jatah_cuti: pending.jatah_cuti || 0,
        titik_radius: pending.titik_radius || null
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert([profilePayload], { onConflict: 'id', ignoreDuplicates: true })

      if (profileError) {
        console.error('PROFILE ERROR:', profileError)
        throw profileError
      }

      // ================= UPDATE PENDING =================
      await supabase
        .from('pending_profiles')
        .update({
          status: 'registered',
          client_id: clientId,
          department_id: departmentId
        })
        .eq('id', pendingId)
        .eq('status', 'waiting')
    }

    return true

  } catch (err) {
    console.error('REGISTER KARYAWAN ERROR:', err)
    const msg = String(err?.message || '')
    showRegError(
      err?.name === 'AuthRetryableFetchError' || msg.includes('500') || msg.toLowerCase().includes('fetch')
        ? 'Server auth sedang bermasalah atau konfigurasi email belum benar. Coba lagi beberapa saat atau hubungi admin.'
        : (msg || 'Terjadi kesalahan saat registrasi')
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
      jenis_kontrak: extraData.jenis_kontrak || null,
      kontrak_mulai: extraData.kontrak_mulai || null,
      durasi_kontrak: extraData.durasi_kontrak || null,
      satuan_durasi_kontrak: extraData.satuan_durasi_kontrak || 'bulan',
      masa_kontrak: extraData.masa_kontrak || null,
      kontrak_berakhir: extraData.kontrak_berakhir || null,
      status_kontrak: extraData.status_kontrak || 'aktif',
      status_akun: 'Aktif',
      foto_url: '',
      sisa_cuti: 0,
      jatah_cuti: 0,
      titik_radius: extraData.titik_radius || null,
      client_id: extraData.client_id || null,
      department_id: extraData.department_id || null
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
