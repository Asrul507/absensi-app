import { supabase } from './supabase.js'
import { isSuperAdmin } from './access-control.js'

function safeText(value, fallback = '-') {
  const text = value === null || value === undefined || value === '' ? fallback : String(value)
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function readTenantContext() {
  try { return JSON.parse(sessionStorage.getItem('tenantContext') || '{}') || {} } catch { return {} }
}

export function clearTenantContext() { sessionStorage.removeItem('tenantContext') }

export function formatOfficeLabel(client) {
  const item = Array.isArray(client) ? client[0] : client
  const name = item?.nama_client || item?.nama_office || item?.client_name || ''
  const code = item?.domain_login || item?.kode_client || ''
  if (!name && !code) return ''
  return name && code ? `${name} (${code})` : (name || code)
}

export function getActiveOfficeContextLabel(user = window.currentUser) {
  if (isSuperAdmin(user)) {
    const ctx = readTenantContext()
    return ctx?.mode === 'client' ? formatOfficeLabel(ctx.client || ctx) : ''
  }
  return formatOfficeLabel(user?.clients || { nama_client: user?.nama_client || user?.client_name, domain_login: user?.domain_login, kode_client: user?.kode_client })
}

async function fetchOfficeCards() {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id,nama_client,kode_client,domain_login,status')
    .order('nama_client')
  if (error) throw error
  return Promise.all((clients || []).map(async (client) => {
    const [{ count: activeEmployees }, { count: departments }] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('client_id', client.id).in('status_akun', ['Aktif', 'active']),
      supabase.from('departments').select('id', { count: 'exact', head: true }).eq('client_id', client.id)
    ])
    return { ...client, active_employees: activeEmployees || 0, department_count: departments || 0 }
  }))
}

export async function setSuperAdminOfficeContext(clientId, nextPage = null) {
  const offices = window._officeContextCards || await fetchOfficeCards()
  const client = offices.find(c => String(c.id) === String(clientId))
  if (!client) throw new Error('Office tidak ditemukan.')
  sessionStorage.setItem('tenantContext', JSON.stringify({ mode: 'client', client_id: client.id, client }))
  window.updateHeaderOfficeContext?.()
  if (nextPage) await window.navigate(nextPage)
}

export async function clearSuperAdminOfficeContext(nextPage = null) {
  clearTenantContext()
  window.updateHeaderOfficeContext?.()
  if (nextPage) await window.navigate(nextPage)
}

export async function ensureSuperAdminOfficeContext(pageKey, title = 'Pilih Office') {
  if (!isSuperAdmin(window.currentUser)) return true
  const ctx = readTenantContext()
  if (ctx?.mode === 'client' && ctx?.client_id) return true

  const content = document.getElementById('content')
  if (!content) return false
  content.innerHTML = `<div class="card" style="padding:22px;text-align:center;"><i class="fa fa-spinner fa-spin"></i> Memuat daftar Office...</div>`
  try {
    const offices = await fetchOfficeCards()
    window._officeContextCards = offices
    content.innerHTML = `
      <div class="page-header">
        <h2><i class="fa fa-building"></i> ${safeText(title)}</h2>
      </div>
      <div class="card fade-up" style="padding:14px 16px;margin-bottom:14px;color:var(--text-muted);font-size:.85rem;line-height:1.6;">
        Super Admin harus memilih Office terlebih dahulu. Setelah dipilih, data menu ini hanya menampilkan data dengan <strong>client_id</strong> Office aktif sampai Office diganti atau logout.
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;">
        ${offices.map(c => `
          <button type="button" class="card fade-up" onclick="window.setSuperAdminOfficeContext('${safeText(c.id)}','${safeText(pageKey)}')" style="text-align:left;padding:16px;border:1px solid var(--border);cursor:pointer;background:var(--white);">
            <div style="font-weight:900;font-size:1rem;color:var(--text);">${safeText(c.nama_client || 'Office')}</div>
            <div style="font-size:.8rem;color:var(--primary);font-weight:800;margin:4px 0 10px;">${safeText(c.domain_login || c.kode_client || '-')}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.75rem;color:var(--text-muted);">
              <span><strong>${c.active_employees}</strong> karyawan aktif</span>
              <span><strong>${c.department_count}</strong> department</span>
              <span style="grid-column:1/-1;">Status: <strong>${safeText(c.status || '-')}</strong></span>
            </div>
          </button>
        `).join('') || `<div class="card" style="padding:18px;color:var(--text-muted);">Belum ada Office.</div>`}
      </div>
    `
  } catch (err) {
    console.error('ensureSuperAdminOfficeContext error:', err)
    content.innerHTML = `<div class="card" style="padding:18px;border-left:4px solid var(--danger);"><strong style="color:var(--danger);">Gagal memuat Office</strong><div style="color:var(--text-muted);font-size:.85rem;margin-top:6px;">${safeText(err.message || err)}</div></div>`
  }
  return false
}

window.setSuperAdminOfficeContext = setSuperAdminOfficeContext
window.clearSuperAdminOfficeContext = clearSuperAdminOfficeContext
