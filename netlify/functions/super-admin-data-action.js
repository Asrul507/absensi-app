const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const json = (body, statusCode = 200) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
function normalizeRole(role) { return String(role || 'staff').trim().toLowerCase() }
function readBody(text) { try { return JSON.parse(text || '{}') } catch { return {} } }
function cleanIds(ids) { return Array.from(new Set((Array.isArray(ids) ? ids : []).map(id => String(id || '').trim()).filter(Boolean))).slice(0, 500) }
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
async function requireSuperAdmin(jwt) {
  const authUser = await userRequest('/auth/v1/user', jwt)
  const profile = await first('profiles', `select=id,role&id=eq.${authUser.id}`)
  if (!profile || normalizeRole(profile.role) !== 'super_admin') throw Object.assign(new Error('Hanya super_admin yang boleh menjalankan aksi data berbahaya.'), { statusCode: 403 })
  return profile
}
async function ensureUnusedShift(ids) {
  const data = await admin(`/rest/v1/jadwal?select=shift_id&shift_id=in.(${ids.map(encodeURIComponent).join(',')})&limit=1`, { headers: { accept: 'application/json' } })
  if (data?.length) throw Object.assign(new Error('Shift terpilih masih dipakai jadwal. Lepaskan dari jadwal terlebih dahulu.'), { statusCode: 409 })
}
async function ensureNoRefs(table, column, ids, message) {
  const data = await admin(`/rest/v1/${table}?select=id&${column}=in.(${ids.map(encodeURIComponent).join(',')})&limit=1`, { headers: { accept: 'application/json' } })
  if (data?.length) throw Object.assign(new Error(message), { statusCode: 409 })
}
async function deleteByIds(table, pk, ids) {
  const data = await admin(`/rest/v1/${table}?${pk}=in.(${ids.map(encodeURIComponent).join(',')})`, { method: 'DELETE', headers: { prefer: 'return=representation', accept: 'application/json' } })
  return Array.isArray(data) ? data.length : 0
}
async function runAction(menuKey, action, ids) {
  if (!ids.length) throw Object.assign(new Error('Tidak ada data terpilih.'), { statusCode: 400 })
  if (menuKey === 'employees') {
    if (!['deactivate_selected', 'delete_selected', 'delete_filtered'].includes(action)) throw Object.assign(new Error('Aksi karyawan tidak didukung.'), { statusCode: 400 })
    const data = await admin(`/rest/v1/profiles?id=in.(${ids.map(encodeURIComponent).join(',')})&role=neq.super_admin`, { method: 'PATCH', headers: { prefer: 'return=representation', accept: 'application/json' }, body: JSON.stringify({ status_akun: 'Non-Aktif' }) })
    return { affected_count: Array.isArray(data) ? data.length : 0, mode: 'deactivated' }
  }
  if (!['delete_selected', 'delete_filtered'].includes(action)) throw Object.assign(new Error('Reset menu ini belum tersedia.'), { statusCode: 400 })
  if (menuKey === 'shifts') { await ensureUnusedShift(ids); return { affected_count: await deleteByIds('shift', 'id', ids), mode: 'deleted' } }
  if (menuKey === 'schedules') return { affected_count: await deleteByIds('jadwal', 'id', ids), mode: 'deleted' }
  if (menuKey === 'attendance') return { affected_count: await deleteByIds('absensi', 'id', ids), mode: 'deleted' }
  if (menuKey === 'requests') return { affected_count: await deleteByIds('pengajuan', 'id', ids), mode: 'deleted' }
  if (menuKey === 'corrections') return { affected_count: await deleteByIds('perbaikan_absen', 'id', ids), mode: 'deleted' }
  if (menuKey === 'locations') return { affected_count: await deleteByIds('lokasi_absen', 'id', ids), mode: 'deleted' }
  if (menuKey === 'departments') { await ensureNoRefs('profiles', 'department_id', ids, 'Department masih memiliki profiles.'); await ensureNoRefs('jadwal', 'department_id', ids, 'Department masih memiliki jadwal.'); return { affected_count: await deleteByIds('departments', 'id', ids), mode: 'deleted' } }
  if (menuKey === 'offices') { await ensureNoRefs('profiles', 'client_id', ids, 'Office masih memiliki profiles.'); await ensureNoRefs('departments', 'client_id', ids, 'Office masih memiliki departments.'); await ensureNoRefs('shift', 'client_id', ids, 'Office masih memiliki shift.'); return { affected_count: await deleteByIds('clients', 'id', ids), mode: 'deleted' } }
  throw Object.assign(new Error('Menu tidak didukung.'), { statusCode: 400 })
}
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json({ success: false, error: 'ENV Supabase function belum lengkap.' }, 500)
    const jwt = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ success: false, error: 'Sesi login wajib dikirim.' }, 401)
    const body = readBody(event.body)
    if (String(body.confirm_text || '').trim().toUpperCase() !== 'HAPUS') return json({ success: false, error: 'Konfirmasi wajib mengetik HAPUS.' }, 400)
    const menuKey = String(body.menu_key || '').trim()
    const action = String(body.action || '').trim()
    const ids = cleanIds(body.ids)
    await requireSuperAdmin(jwt)
    const result = await runAction(menuKey, action, ids)
    return json({ success: true, menu_key: menuKey, action, ...result })
  } catch (error) {
    console.error('SUPER_ADMIN_DATA_ACTION_ERROR:', { message: error?.message })
    const statusCode = error?.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500
    return json({ success: false, error: error.message || 'Aksi data gagal.' }, statusCode)
  }
}
