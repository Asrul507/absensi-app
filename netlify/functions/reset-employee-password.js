const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const json = (body, statusCode = 200) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ACTIVE_ROLES = ['super_admin', 'admin_all', 'admin_hr', 'admin', 'staff']
function normalizeRole(role) { const v = String(role || 'staff').trim().toLowerCase(); if (v === 'hr') return 'admin_hr'; if (v === 'spv' || v === 'supervisor') return 'admin'; return ACTIVE_ROLES.includes(v) ? v : 'staff' }
function parseJson(text) { try { return JSON.parse(text || '{}') } catch { return {} } }
async function supabaseRequest(path, key, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(options.headers || {}) }
  })
  const text = await res.text()
  const body = text ? parseJson(text) : null
  if (!res.ok) throw new Error(body?.message || body?.error_description || body?.error || `Supabase error ${res.status}`)
  return body
}
async function userRequest(path, jwt, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { apikey: ANON_KEY, authorization: `Bearer ${jwt}`, 'content-type': 'application/json', ...(options.headers || {}) }
  })
  const text = await res.text()
  const body = text ? parseJson(text) : null
  if (!res.ok) throw new Error(body?.message || body?.error_description || body?.error || `Supabase error ${res.status}`)
  return body
}
async function admin(path, options = {}) { return supabaseRequest(path, SERVICE_ROLE_KEY, options) }
async function first(table, query) {
  const rows = await admin(`/rest/v1/${table}?${query}`, { headers: { accept: 'application/json' } })
  return Array.isArray(rows) ? rows[0] || null : rows
}
function canResetPassword(caller, target) {
  const callerRole = normalizeRole(caller?.role)
  const targetRole = normalizeRole(target?.role)
  if (!caller?.id || !target?.id || caller.id === target.id) return false
  if (callerRole === 'super_admin') return targetRole !== 'super_admin'
  const sameOffice = Boolean(caller.client_id && target.client_id && String(caller.client_id) === String(target.client_id))
  if (!sameOffice) return false
  if (callerRole === 'admin_all' || callerRole === 'admin_hr') return ['admin', 'staff'].includes(targetRole)
  if (callerRole === 'admin') {
    return targetRole === 'staff' && caller.department_id && target.department_id && String(caller.department_id) === String(target.department_id)
  }
  return false
}
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json({ success: false, error: 'ENV Supabase function belum lengkap.' }, 500)
    const jwt = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ success: false, error: 'Sesi login wajib dikirim.' }, 401)
    const body = parseJson(event.body)
    const targetUserId = String(body.user_id || '').trim()
    const newPassword = String(body.new_password || '')
    if (!targetUserId) return json({ success: false, error: 'Target user wajib diisi.' }, 400)
    if (newPassword.length < 8) return json({ success: false, error: 'Password minimal 8 karakter.' }, 400)

    const authUser = await userRequest('/auth/v1/user', jwt)
    const caller = await first('profiles', `select=id,role,client_id,department_id,nama_lengkap&id=eq.${authUser.id}`)
    const target = await first('profiles', `select=id,role,client_id,department_id,nama_lengkap&id=eq.${targetUserId}`)
    if (!caller) return json({ success: false, error: 'Profil pemohon tidak ditemukan.' }, 403)
    if (!target) return json({ success: false, error: 'Profil target tidak ditemukan.' }, 404)
    if (!canResetPassword(caller, target)) return json({ success: false, error: 'Anda tidak memiliki izin reset password user ini.' }, 403)

    await admin(`/auth/v1/admin/users/${target.id}`, { method: 'PUT', body: JSON.stringify({ password: newPassword }) })
    await admin(`/rest/v1/profiles?id=eq.${target.id}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ must_change_password: true, password_changed_at: new Date().toISOString() })
    })
    return json({ success: true })
  } catch (error) {
    console.error('RESET_EMPLOYEE_PASSWORD_ERROR:', { message: error?.message })
    return json({ success: false, error: error.message || 'Gagal reset password.' }, 500)
  }
}
