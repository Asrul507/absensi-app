const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const json = (body, statusCode = 200) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ACTIVE_ROLES = ['super_admin', 'admin_all', 'admin_hr', 'admin', 'staff']
function normalizeRole(role) { const v = String(role || 'staff').trim().toLowerCase(); if (v === 'hr') return 'admin_hr'; if (v === 'spv' || v === 'supervisor') return 'admin'; return ACTIVE_ROLES.includes(v) ? v : 'staff' }
function cleanCode(code) { return String(code || '').trim().toLowerCase().replace(/^@/, '') }
function readBody(text) { try { return JSON.parse(text || '{}') } catch { return {} } }
function hasRequiredEnv() { return Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY) }
function parseJson(text) { try { return JSON.parse(text || '{}') } catch { return {} } }
async function request(path, key, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(options.headers || {}) } })
  const text = await res.text(); const body = text ? parseJson(text) : null
  if (!res.ok) throw Object.assign(new Error(body?.message || body?.error_description || body?.error || `Supabase error ${res.status}`), { statusCode: res.status })
  return body
}
async function userRequest(path, jwt, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { apikey: ANON_KEY, authorization: `Bearer ${jwt}`, 'content-type': 'application/json', ...(options.headers || {}) } })
  const text = await res.text(); const body = text ? parseJson(text) : null
  if (!res.ok) throw Object.assign(new Error(body?.message || body?.error_description || body?.error || `Supabase error ${res.status}`), { statusCode: res.status })
  return body
}
async function admin(path, options = {}) { return request(path, SERVICE_ROLE_KEY, options) }
async function first(table, query) { const rows = await admin(`/rest/v1/${table}?${query}`, { headers: { accept: 'application/json' } }); return Array.isArray(rows) ? rows[0] || null : rows }
async function getCallerProfile(jwt) {
  const authUser = await userRequest('/auth/v1/user', jwt)
  const caller = await first('profiles', `select=id,role,client_id,department_id&id=eq.${authUser.id}`)
  if (!caller) throw Object.assign(new Error('Profil pemohon tidak ditemukan.'), { statusCode: 403 })
  return caller
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)
    if (!hasRequiredEnv()) return json({ success: false, error: 'ENV Supabase function belum lengkap.' }, 500)
    const jwt = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ success: false, error: 'Sesi login wajib dikirim.' }, 401)

    const caller = await getCallerProfile(jwt)
    if (normalizeRole(caller.role) !== 'super_admin') return json({ success: false, error: 'Hanya super_admin yang boleh mengubah username/Office login.' }, 403)

    const body = readBody(event.body)
    const targetUserId = String(body.user_id || '').trim()
    const username = String(body.username || '').trim().toLowerCase()
    const clientId = String(body.client_id || '').trim()
    const departmentId = String(body.department_id || '').trim()
    if (!targetUserId) return json({ success: false, error: 'Target user wajib diisi.' }, 400)
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return json({ success: false, error: 'Username wajib 3-40 karakter: huruf kecil, angka, titik, underscore, strip.' }, 400)
    if (!clientId) return json({ success: false, error: 'Office wajib dipilih.' }, 400)

    const target = await first('profiles', `select=id,role,username,email_internal,client_id,department_id&id=eq.${targetUserId}`)
    if (!target) return json({ success: false, error: 'Profil target tidak ditemukan.' }, 404)
    if (normalizeRole(target.role) === 'super_admin') return json({ success: false, error: 'Identitas login super_admin tidak boleh diubah dari form karyawan.' }, 403)

    const client = await first('clients', `select=id,nama_client,kode_client,domain_login,status&id=eq.${clientId}`)
    if (!client || !['active', 'aktif'].includes(String(client.status || '').toLowerCase())) return json({ success: false, error: 'Office tidak valid atau nonaktif.' }, 400)
    const code = cleanCode(client.kode_client || client.domain_login)
    if (!code) return json({ success: false, error: 'Office belum memiliki kode/domain login.' }, 400)
    const emailInternal = `${username}@${code}.local`

    const usernameOwner = await first('profiles', `select=id&client_id=eq.${client.id}&username=eq.${encodeURIComponent(username)}&id=neq.${target.id}`)
    if (usernameOwner) return json({ success: false, error: 'Username sudah dipakai di Office ini.' }, 409)
    const emailOwner = await first('profiles', `select=id&email_internal=eq.${encodeURIComponent(emailInternal)}&id=neq.${target.id}`)
    if (emailOwner) return json({ success: false, error: 'Email internal sudah dipakai user lain.' }, 409)

    if (String(target.client_id || '') !== String(client.id)) {
      if (!departmentId) return json({ success: false, error: 'Office berubah. Pilih ulang Department yang sesuai Office baru sebelum menyimpan.' }, 400)
      const dept = await first('departments', `select=id,status&id=eq.${departmentId}&client_id=eq.${client.id}`)
      if (!dept || !['active','aktif'].includes(String(dept.status || '').toLowerCase())) return json({ success: false, error: 'Department tidak valid untuk Office baru.' }, 400)
    }

    await admin(`/auth/v1/admin/users/${target.id}`, { method: 'PUT', body: JSON.stringify({ email: emailInternal, email_confirm: true }) })
    try {
      await admin(`/rest/v1/profiles?id=eq.${target.id}`, { method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ username, email_internal: emailInternal, client_id: client.id }) })
    } catch (profileError) {
      if (target.email_internal) await admin(`/auth/v1/admin/users/${target.id}`, { method: 'PUT', body: JSON.stringify({ email: target.email_internal, email_confirm: true }) }).catch(() => null)
      throw profileError
    }

    return json({ success: true, user_id: target.id, username, email_internal: emailInternal, client_id: client.id })
  } catch (error) {
    console.error('UPDATE_EMPLOYEE_LOGIN_IDENTITY_ERROR:', { message: error?.message })
    const statusCode = error?.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500
    return json({ success: false, error: error.message || 'Gagal memperbarui identitas login.' }, statusCode)
  }
}
