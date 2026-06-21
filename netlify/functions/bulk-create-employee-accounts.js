const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const json = (body, statusCode = 200) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ROLES = ['admin_all','admin_hr','admin','staff']
function normalizeRole(role) { const v = String(role || 'staff').trim().toLowerCase(); if (v === 'hr') return 'admin_hr'; if (v === 'spv' || v === 'supervisor') return 'admin'; return ['super_admin', ...ROLES].includes(v) ? v : 'staff' }
function cleanCode(code) { return String(code || '').trim().toLowerCase().replace(/^@/, '') }
function readBody(text) { try { return JSON.parse(text || '{}') } catch { return {} } }
async function req(path, key, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(options.headers || {}) } })
  const text = await res.text(); const body = text ? readBody(text) : null
  if (!res.ok) throw new Error(body?.message || body?.error_description || body?.error || `Supabase error ${res.status}`)
  return body
}
async function admin(path, options) { return req(path, SERVICE_ROLE_KEY, options) }
async function userReq(path, jwt, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { apikey: ANON_KEY, authorization: `Bearer ${jwt}`, 'content-type': 'application/json', ...(options.headers || {}) } })
  const text = await res.text(); const body = text ? readBody(text) : null
  if (!res.ok) throw new Error(body?.message || body?.error_description || body?.error || `Supabase error ${res.status}`)
  return body
}
async function first(table, query) {
  const rows = await admin(`/rest/v1/${table}?${query}`, { headers: { accept: 'application/json' } })
  return Array.isArray(rows) ? rows[0] || null : rows
}
exports.handler = async (event) => {
  const createdAuthIds = []
  try {
    if (event.httpMethod !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) return json({ success: false, error: 'ENV Supabase function belum lengkap.' }, 500)
    const jwt = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ success: false, error: 'Sesi login wajib dikirim.' }, 401)
    const authUser = await userReq('/auth/v1/user', jwt)
    const caller = await first('profiles', `select=id,role,client_id,department_id,nama_lengkap&id=eq.${authUser.id}`)
    if (!caller) return json({ success: false, error: 'Profil pembuat akun tidak ditemukan.' }, 403)
    const callerRole = normalizeRole(caller.role)
    if (!['super_admin','admin_hr'].includes(callerRole)) return json({ success: false, error: 'Hanya super_admin/admin_hr yang boleh bulk create akun.' }, 403)
    const employees = readBody(event.body).employees || []
    if (!Array.isArray(employees) || !employees.length) return json({ success: false, error: 'Daftar karyawan kosong.' }, 400)
    if (employees.length > 200) return json({ success: false, error: 'Maksimal 200 karyawan per upload.' }, 400)

    const results = []
    for (const [idx, emp] of employees.entries()) {
      const username = String(emp.username || '').trim().toLowerCase()
      const password = String(emp.password_awal || '')
      const role = normalizeRole(emp.role)
      const nama = String(emp.nama_lengkap || '').trim()
      const jabatan = String(emp.jabatan || '').trim()
      let clientId = emp.client_id
      const departmentId = emp.department_id
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error(`Baris ${emp._index || idx + 2}: username tidak valid.`)
      if (password.length < 8) throw new Error(`Baris ${emp._index || idx + 2}: password minimal 8 karakter.`)
      if (!ROLES.includes(role)) throw new Error(`Baris ${emp._index || idx + 2}: role tidak valid atau super_admin ditolak.`)
      if (!nama || !jabatan || !clientId || !departmentId) throw new Error(`Baris ${emp._index || idx + 2}: data wajib belum lengkap.`)
      if (callerRole === 'admin_hr') {
        clientId = caller.client_id
        if (!['admin','staff'].includes(role)) throw new Error(`Baris ${emp._index || idx + 2}: Admin HR hanya boleh membuat admin/staff.`)
      }
      const client = await first('clients', `select=id,nama_client,kode_client,domain_login,status&id=eq.${clientId}`)
      if (!client || !['active','aktif'].includes(String(client.status || '').toLowerCase())) throw new Error(`Baris ${emp._index || idx + 2}: Office tidak valid/nonaktif.`)
      const dept = await first('departments', `select=id,nama_department,client_id,status&id=eq.${departmentId}&client_id=eq.${client.id}`)
      if (!dept || !['active','aktif'].includes(String(dept.status || '').toLowerCase())) throw new Error(`Baris ${emp._index || idx + 2}: Department tidak valid untuk Office.`)
      const emailInternal = `${username}@${cleanCode(client.kode_client || client.domain_login)}.local`
      if (await first('profiles', `select=id&client_id=eq.${client.id}&username=eq.${encodeURIComponent(username)}`)) throw new Error(`Baris ${emp._index || idx + 2}: username sudah dipakai di Office ini.`)
      if (await first('profiles', `select=id&email_internal=eq.${encodeURIComponent(emailInternal)}`)) throw new Error(`Baris ${emp._index || idx + 2}: email internal sudah dipakai.`)
      const created = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: emailInternal, password, email_confirm: true, user_metadata: { username, nama_lengkap: nama, role, client_id: client.id, department_id: dept.id } }) })
      createdAuthIds.push(created.id)
      const profile = { id: created.id, username, email_internal: emailInternal, email: emailInternal, nama_lengkap: nama, role, client_id: client.id, department_id: dept.id, departemen: dept.nama_department, jabatan, no_hp: emp.no_hp || '', tanggal_bergabung: emp.tanggal_bergabung || null, tanggal_lahir: emp.tanggal_lahir || null, jenis_kontrak: emp.jenis_kontrak || null, kontrak_mulai: emp.kontrak_mulai || null, durasi_kontrak: emp.durasi_kontrak || null, satuan_durasi_kontrak: emp.satuan_durasi_kontrak || 'bulan', masa_kontrak: emp.masa_kontrak || null, kontrak_berakhir: emp.kontrak_berakhir || null, status_kontrak: emp.status_kontrak || 'aktif', status_akun: 'Aktif', foto_url: emp.foto_url || '', sisa_cuti: emp.sisa_cuti || 0, titik_radius: emp.titik_radius || null, must_change_password: true, created_by: caller.id }
      await admin('/rest/v1/profiles', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(profile) })
      results.push({ user_id: created.id, username, email_internal })
    }
    return json({ success: true, created_count: results.length, results })
  } catch (error) {
    console.error('BULK_CREATE_EMPLOYEE_ACCOUNTS_ERROR:', { message: error?.message })
    for (const id of createdAuthIds.reverse()) {
      try { await admin(`/rest/v1/profiles?id=eq.${id}`, { method: 'DELETE' }) } catch (rollbackError) { console.error('Rollback profile failed:', { id, message: rollbackError?.message }) }
      try { await admin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }) } catch (rollbackError) { console.error('Rollback auth user failed:', { id, message: rollbackError?.message }) }
    }
    return json({ success: false, error: error.message || 'Gagal bulk create akun.' }, 500)
  }
}
