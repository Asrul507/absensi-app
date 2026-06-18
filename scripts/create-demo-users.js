#!/usr/bin/env node
/**
 * Create demo multi-tenant HRIS data for development/staging only.
 *
 * Required env:
 *   SUPABASE_URL=https://PROJECT.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Optional guard override:
 *   ALLOW_PRODUCTION_DEMO=true
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
const ALLOW_PRODUCTION_DEMO = String(process.env.ALLOW_PRODUCTION_DEMO || '').toLowerCase() === 'true'

const DEMO_PASSWORD = 'Demo123!'
const CLIENT = {
  nama_client: 'Kantor A',
  kode_client: 'kantora',
  domain_login: '@kantora',
  status: 'active'
}
const DEPARTMENTS = ['Housekeeping', 'HRD', 'Security', 'Engineering']
const USERS = [
  { email: 'gm@kantora.demo', role: 'admin_all', department: 'HRD', nama_lengkap: 'GM Kantor A', jabatan: 'General Manager' },
  { email: 'hrd@kantora.demo', role: 'admin_hr', department: 'HRD', nama_lengkap: 'HRD Kantor A', jabatan: 'HRD' },
  { email: 'hkmanager@kantora.demo', role: 'admin', department: 'Housekeeping', nama_lengkap: 'HK Manager Kantor A', jabatan: 'Housekeeping Manager' },
  { email: 'staff@kantora.demo', role: 'staff', department: 'Housekeeping', nama_lengkap: 'Staff Housekeeping Kantor A', jabatan: 'Staff Housekeeping' }
]

function assertSafeEnvironment() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi dari environment variable.')
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
    throw new Error('SUPABASE_URL tidak valid. Format harus https://PROJECT.supabase.co')
  }
  if (IS_PRODUCTION && !ALLOW_PRODUCTION_DEMO) {
    throw new Error('Script demo tidak boleh dijalankan di production. Set ALLOW_PRODUCTION_DEMO=true hanya jika benar-benar paham risikonya.')
  }
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: headers(options.headers || {})
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message = payload?.message || payload?.msg || text || response.statusText
    throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${message}`)
  }
  return payload
}

async function upsertRest(table, rows, onConflict) {
  const params = new URLSearchParams()
  if (onConflict) params.set('on_conflict', onConflict)
  return request(`/rest/v1/${table}?${params.toString()}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows)
  })
}

async function selectRest(table, query) {
  return request(`/rest/v1/${table}?${query}`, { method: 'GET' })
}

async function findAuthUserByEmail(email) {
  const perPage = 1000
  let page = 1
  while (page <= 10) {
    const payload = await request(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`, { method: 'GET' })
    const users = payload?.users || []
    const found = users.find(user => String(user.email || '').toLowerCase() === email.toLowerCase())
    if (found) return found
    if (users.length < perPage) return null
    page += 1
  }
  return null
}

async function createOrUpdateAuthUser(user) {
  const metadata = {
    nama_lengkap: user.nama_lengkap,
    role: user.role,
    client_id: user.client_id,
    department_id: user.department_id,
    demo: true
  }

  const existing = await findAuthUserByEmail(user.email)
  if (existing?.id) {
    await request(`/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: metadata,
        app_metadata: { role: user.role, demo: true }
      })
    })
    return { id: existing.id, created: false }
  }

  const created = await request('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { role: user.role, demo: true }
    })
  })
  return { id: created.id, created: true }
}

async function main() {
  assertSafeEnvironment()
  console.log('▶ Membuat client demo Kantor A...')
  const [client] = await upsertRest('clients', [CLIENT], 'kode_client')

  console.log('▶ Membuat department demo...')
  await upsertRest('departments', DEPARTMENTS.map(nama_department => ({
    client_id: client.id,
    nama_department,
    status: 'active'
  })), 'client_id,nama_department')

  const departments = await selectRest('departments', `select=id,nama_department&client_id=eq.${client.id}`)
  const departmentMap = Object.fromEntries(departments.map(department => [department.nama_department, department]))

  console.log('▶ Membuat/update auth users dan profiles demo...')
  for (const user of USERS) {
    const department = departmentMap[user.department]
    if (!department?.id) throw new Error(`Department tidak ditemukan: ${user.department}`)

    const authUser = await createOrUpdateAuthUser({
      ...user,
      client_id: client.id,
      department_id: department.id
    })

    await upsertRest('profiles', [{
      id: authUser.id,
      email: user.email,
      nama_lengkap: user.nama_lengkap,
      role: user.role,
      client_id: client.id,
      department_id: department.id,
      departemen: user.department,
      jabatan: user.jabatan,
      status_akun: 'Aktif',
      foto_url: '',
      sisa_cuti: 0,
      jatah_cuti: 0
    }], 'id')

    console.log(`${authUser.created ? '✓ Created' : '✓ Updated'} ${user.email} (${user.role} / ${user.department})`)
  }

  console.log('\n✅ Demo users Kantor A siap digunakan.')
  console.log('Login: <email> / Demo123! / @kantora')
}

main().catch(error => {
  console.error('❌ Gagal membuat demo users:', error.message)
  process.exit(1)
})
