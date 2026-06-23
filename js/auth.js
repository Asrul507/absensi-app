import { supabase } from './supabase.js'
import { showToast, setButtonLoading } from './feedback.js'
import { normalizeRole } from './access-control.js'

const DEBUG_AUTH = false

function normalizeClientCode(clientCode) {
  const value = String(clientCode || '').trim().toLowerCase()
  return value.startsWith('@') ? value.slice(1) : value
}

async function fetchClientByCode(clientCode) {
  const code = normalizeClientCode(clientCode)
  if (!code) return null
  const { data, error } = await supabase
    .from('clients')
    .select('id,nama_client,kode_client,domain_login,status')
    .or(`kode_client.eq.${code},domain_login.eq.@${code},domain_login.eq.${code}`)
    .maybeSingle()
  if (error) throw error
  return data || null
}

function buildInternalEmail(username, clientCode = 'global') {
  const cleanUsername = String(username || '').trim().toLowerCase()
  const cleanCode = normalizeClientCode(clientCode) || 'global'
  return `${cleanUsername}+${cleanCode}@gpro.my.id`
}

async function findTenantProfileByUsername(username, clientId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,email_internal,role,client_id,department_id,nama_lengkap,status_akun')
    .eq('username', String(username || '').trim().toLowerCase())
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

function buildTenantContext(profile, selectedClient = null, globalMode = false) {
  return {
    mode: globalMode ? 'global' : 'client',
    user_id: profile.id,
    username: profile.username || null,
    role: normalizeRole(profile.role),
    client_id: globalMode ? null : (selectedClient?.id || profile.client_id || null),
    department_id: globalMode ? null : (profile.department_id || null),
    nama_client: globalMode ? 'Global Admin / All Offices' : (selectedClient?.nama_client || 'Office'),
    kode_client: globalMode ? null : (selectedClient?.kode_client || null)
  }
}

async function findSuperAdminProfileByUsername(username) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,email_internal,role,client_id,department_id,nama_lengkap,status_akun')
    .eq('username', String(username || '').trim().toLowerCase())
    .eq('role', 'super_admin')
    .maybeSingle()
  if (error) throw error
  return data || null
}


export async function lookupOfficeForUsername(username) {
  const cleanUsername = String(username || '').trim().toLowerCase()
  if (!cleanUsername) return { status: 'empty' }
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,role,client_id,clients:client_id(id,nama_client,kode_client,domain_login,status)')
    .eq('username', cleanUsername)
    .limit(5)
  if (error) throw error
  const officeProfiles = (data || []).filter(profile => normalizeRole(profile.role) !== 'super_admin' && profile.client_id)
  const uniqueClients = Array.from(new Map(officeProfiles.map(profile => [String(profile.client_id), profile.clients])).values()).filter(Boolean)
  if (uniqueClients.length === 1) {
    const client = uniqueClients[0]
    return { status: 'single', code: client.domain_login || client.kode_client || '', client }
  }
  if (uniqueClients.length > 1) return { status: 'multiple' }
  const superAdmin = (data || []).some(profile => normalizeRole(profile.role) === 'super_admin')
  return { status: superAdmin ? 'super_admin' : 'none' }
}

export async function login(username, password, clientCode = '') {
  const btn = document.getElementById('btnLogin')
  setButtonLoading(btn, true, '<i class="fa fa-spinner fa-spin"></i> Memproses...')

  const cleanUsername = String(username || '').trim().toLowerCase()
  const cleanClientCode = normalizeClientCode(clientCode)
  let selectedClient = null

  try {
    if (!cleanUsername || !password) {
      showLoginError('Username dan password wajib diisi.')
      return false
    }

    let emailInternal = ''
    if (cleanClientCode) {
      selectedClient = await fetchClientByCode(cleanClientCode)
      if (!selectedClient) { showLoginError('Kode kantor tidak ditemukan. Periksa kembali kode/domain login kantor Anda.'); return false }
      if (!['active','aktif'].includes(String(selectedClient.status || '').toLowerCase())) { showLoginError('Office ini sedang nonaktif. Hubungi administrator.'); return false }
      const tenantProfile = await findTenantProfileByUsername(cleanUsername, selectedClient.id)
      emailInternal = tenantProfile?.email_internal || buildInternalEmail(cleanUsername, selectedClient.kode_client || selectedClient.domain_login)
    } else {
      const superProfile = await findSuperAdminProfileByUsername(cleanUsername)
      if (!superProfile?.email_internal) { showLoginError('Kode kantor wajib diisi untuk akun kantor. Super admin dapat login tanpa kode kantor.'); return false }
      emailInternal = superProfile.email_internal
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: emailInternal, password })
    if (DEBUG_AUTH) console.log('LOGIN RESULT:', { data, error })
    if (error) { showLoginError(error.message.includes('Invalid login') ? 'Username, password, atau kode kantor salah.' : error.message); return false }

    const authUser = data?.user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,username,email_internal,role,client_id,department_id,nama_lengkap,status_akun')
      .eq('id', authUser?.id)
      .maybeSingle()
    if (profileError || !profile) { await supabase.auth.signOut(); showLoginError('Profil akun tidak ditemukan. Hubungi HR/admin.'); return false }

    const role = normalizeRole(profile.role)
    const isSuperAdmin = role === 'super_admin'
    const status = String(profile.status_akun || 'Aktif').toLowerCase()
    if (!['aktif','active'].includes(status)) { await supabase.auth.signOut(); showLoginError('Akun Anda nonaktif. Hubungi HR/admin.'); return false }

    if (!cleanClientCode) {
      if (!isSuperAdmin) { await supabase.auth.signOut(); showLoginError('Kode kantor wajib diisi untuk akun kantor.'); return false }
      sessionStorage.setItem('tenantContext', JSON.stringify(buildTenantContext({ ...profile, role }, null, true)))
      return true
    }

    if (!isSuperAdmin && String(profile.client_id || '') !== String(selectedClient.id)) { await supabase.auth.signOut(); showLoginError('Akun ini tidak terdaftar pada Office yang dipilih.'); return false }
    if (isSuperAdmin && !profile.client_id) profile.client_id = selectedClient.id
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

export async function createEmployeeAccount(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sesi login tidak ditemukan.')
  const res = await fetch('/.netlify/functions/create-employee-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload)
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.success) throw new Error(body.error || 'Gagal membuat akun karyawan.')
  return body
}

/* ================= LOGOUT ================= */
export async function logout() {
  sessionStorage.removeItem('tenantContext')
  await supabase.auth.signOut()
  location.reload()
}

/* ===============================================================
   SELF-REGISTER DEPRECATED
   Akun karyawan kini hanya dibuat oleh super_admin/admin_hr melalui
   Netlify Function server-side agar tidak ada proses verifikasi email.
=============================================================== */
export async function registerKaryawan() {
  showRegError('Self-register sudah dinonaktifkan. Hubungi HRD/admin untuk dibuatkan akun username.')
  return false
}

export async function signup() {
  showToast('Pembuatan akun dari browser dinonaktifkan. Gunakan form Tambah Karyawan.', 'warning')
  return false
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
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id) {
    await supabase.from('profiles').update({ must_change_password: false, password_changed_at: new Date().toISOString() }).eq('id', user.id)
  }
  return true
}
