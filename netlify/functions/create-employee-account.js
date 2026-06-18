const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const json = (body, statusCode = 200) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
function normalizeRole(role) { const v = String(role || 'staff').trim().toLowerCase(); if (v === 'hr') return 'admin_hr'; if (v === 'spv' || v === 'supervisor') return 'admin'; return ['super_admin','admin_all','admin_hr','admin','staff'].includes(v) ? v : 'staff' }
function cleanCode(code) { return String(code || '').trim().toLowerCase().replace(/^@/, '') }
async function sb(path, options = {}, token = SERVICE_ROLE_KEY) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { apikey: token, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) } })
  const text = await res.text(); const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(body?.message || body?.error_description || body?.error || `Supabase error ${res.status}`)
  return body
}
async function first(table, query) { const rows = await sb(`/rest/v1/${table}?${query}`, { headers: { accept: 'application/json' } }); return Array.isArray(rows) ? rows[0] || null : rows }
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405)
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) return json({ error: 'ENV Supabase function belum lengkap.' }, 500)
    const jwt = String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'Sesi login wajib dikirim.' }, 401)
    const authUser = await sb('/auth/v1/user', { method: 'GET' }, jwt)
    const caller = await first('profiles', `select=id,role,client_id,department_id,nama_lengkap&id=eq.${authUser.id}`)
    if (!caller) return json({ error: 'Profil pembuat akun tidak ditemukan.' }, 403)
    const callerRole = normalizeRole(caller.role)
    if (!['super_admin', 'admin_hr'].includes(callerRole)) return json({ error: 'Hanya super_admin/admin_hr yang boleh membuat akun.' }, 403)
    const body = JSON.parse(event.body || '{}')
    const username = String(body.username || '').trim().toLowerCase(); const password = String(body.password_awal || ''); const role = normalizeRole(body.role); const nama = String(body.nama_lengkap || '').trim(); const jabatan = String(body.jabatan || '').trim(); let clientId = body.client_id; const departmentId = body.department_id
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return json({ error: 'Username wajib 3-40 karakter: huruf kecil, angka, titik, underscore, strip.' }, 400)
    if (password.length < 8) return json({ error: 'Password awal minimal 8 karakter.' }, 400)
    if (!clientId || !departmentId || !nama || !jabatan) return json({ error: 'Data wajib belum lengkap.' }, 400)
    if (callerRole === 'admin_hr') { if (!['admin', 'staff'].includes(role)) return json({ error: 'Admin HR hanya boleh membuat role admin atau staff.' }, 403); clientId = caller.client_id }
    if (callerRole === 'super_admin' && !['admin_all','admin_hr','admin','staff'].includes(role)) return json({ error: 'Role tujuan tidak valid untuk form karyawan.' }, 400)
    const client = await first('clients', `select=id,nama_client,kode_client,status&id=eq.${clientId}`)
    if (!client || client.status !== 'active') return json({ error: 'Client tidak valid atau nonaktif.' }, 400)
    const dept = await first('departments', `select=id,nama_department,client_id,status&id=eq.${departmentId}&client_id=eq.${client.id}`)
    if (!dept || dept.status !== 'active') return json({ error: 'Department tidak valid untuk client ini.' }, 400)
    const emailInternal = `${username}@${cleanCode(client.kode_client)}.local`
    if (await first('profiles', `select=id&client_id=eq.${client.id}&username=eq.${encodeURIComponent(username)}`)) return json({ error: 'Username sudah dipakai di client ini.' }, 409)
    if (await first('profiles', `select=id&email_internal=eq.${encodeURIComponent(emailInternal)}`)) return json({ error: 'Email internal sudah dipakai.' }, 409)
    const created = await sb('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: emailInternal, password, email_confirm: true, user_metadata: { username, nama_lengkap: nama, role, client_id: client.id, department_id: dept.id } }) })
    const profile = { id: created.id, username, email_internal: emailInternal, email: emailInternal, nama_lengkap: nama, role, client_id: client.id, department_id: dept.id, departemen: dept.nama_department, jabatan, no_hp: body.no_hp || '', tanggal_bergabung: body.tanggal_bergabung || null, tanggal_lahir: body.tanggal_lahir || null, jenis_kontrak: body.jenis_kontrak || null, kontrak_mulai: body.kontrak_mulai || null, durasi_kontrak: body.durasi_kontrak || null, satuan_durasi_kontrak: body.satuan_durasi_kontrak || 'bulan', masa_kontrak: body.masa_kontrak || null, kontrak_berakhir: body.kontrak_berakhir || null, status_kontrak: body.status_kontrak || 'aktif', status_akun: 'Aktif', foto_url: body.foto_url || '', sisa_cuti: body.sisa_cuti || 0, jatah_cuti: body.jatah_cuti || 0, titik_radius: body.titik_radius || null, must_change_password: true, created_by: caller.id }
    await sb('/rest/v1/profiles', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(profile) })
    return json({ success: true, user_id: created.id, username, email_internal: emailInternal })
  } catch (error) { console.error(error); return json({ error: error.message || 'Gagal membuat akun.' }, 500) }
}
