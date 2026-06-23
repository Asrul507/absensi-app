import { supabase } from './supabase.js'
import { requireRole } from './access-control.js'
import { showToast } from './feedback.js'
import { buildPackageLimitText, getPackageLabel, mergeClientPackageConfig } from './package-service.js'

function safeText(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function packageBadgeClass(packageType) {
  if (packageType === 'pro') return 'badge-green'
  if (packageType === 'standard') return 'badge-blue'
  return 'badge-yellow'
}

function statusBadgeClass(status) {
  return status === 'active' ? 'badge-green' : 'badge-gray'
}

function licenseBadgeClass(status) {
  if (status === 'active') return 'badge-green'
  if (status === 'suspended') return 'badge-yellow'
  return 'badge-red'
}

async function fetchDeveloperStats() {
  const [clientsRes, profilesRes, departmentsRes, locationsRes] = await Promise.all([
    supabase.from('clients').select('*').order('nama_client'),
    supabase.from('profiles').select('id,client_id,role,status_akun'),
    supabase.from('departments').select('id,client_id,status'),
    supabase.from('lokasi_absen').select('id,client_id,status'),
  ])

  if (clientsRes.error) throw clientsRes.error
  if (profilesRes.error) throw profilesRes.error
  if (departmentsRes.error) throw departmentsRes.error
  if (locationsRes.error) throw locationsRes.error

  const clients = (clientsRes.data || []).map(mergeClientPackageConfig)
  const profiles = profilesRes.data || []
  const departments = departmentsRes.data || []
  const locations = locationsRes.data || []

  return clients.map(client => {
    const clientProfiles = profiles.filter(p => String(p.client_id) === String(client.id))
    const activeEmployees = clientProfiles.filter(p => p.status_akun !== 'Non-Aktif')
    const admins = activeEmployees.filter(p => ['admin_all', 'admin_hr', 'admin'].includes(String(p.role || '').toLowerCase()))
    const activeDepartments = departments.filter(d => String(d.client_id) === String(client.id) && d.status !== 'inactive')
    const activeLocations = locations.filter(l => String(l.client_id) === String(client.id) && l.status !== 'inactive')

    return {
      ...client,
      usage: {
        employees: activeEmployees.length,
        admins: admins.length,
        departments: activeDepartments.length,
        gps_points: activeLocations.length,
      },
    }
  })
}

function usageLine(label, current, max) {
  const over = Number(current || 0) > Number(max || 0)
  return `
    <div style="display:flex;justify-content:space-between;gap:10px;font-size:.78rem;padding:6px 0;border-bottom:1px dashed var(--border);">
      <span style="color:var(--text-muted);">${label}</span>
      <strong style="color:${over ? 'var(--danger)' : 'var(--text)'};">${current}/${max}</strong>
    </div>
  `
}

export async function renderDeveloperPanel(user = window.currentUser) {
  const content = document.getElementById('content')
  try {
    requireRole('super_admin', user)
  } catch (err) {
    if (content) content.innerHTML = `<div class="card"><p class="text-danger">${safeText(err.message)}</p></div>`
    return
  }

  if (!content) return
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2><i class="fa fa-code"></i> Developer Panel</h2>
        <p style="margin:6px 0 0;color:var(--text-muted);font-size:.86rem;">Panel owner untuk mengelola client, paket, lisensi, dan tools developer. Tidak menampilkan menu operasional absensi.</p>
      </div>
      <button class="btn-primary btn-sm" onclick="navigate('settings-app')"><i class="fa fa-building-user"></i> Client & Package Settings</button>
    </div>
    <div id="developerPanelBody" class="card" style="padding:18px;text-align:center;"><i class="fa fa-spinner fa-spin"></i> Memuat data developer...</div>
  `

  try {
    const clients = await fetchDeveloperStats()
    const totalClients = clients.length
    const activeClients = clients.filter(c => c.status === 'active').length
    const suspendedClients = clients.filter(c => c.subscription_status === 'suspended' || c.subscription_status === 'expired').length
    const totalEmployees = clients.reduce((sum, c) => sum + c.usage.employees, 0)

    const body = document.getElementById('developerPanelBody')
    if (!body) return
    body.style.textAlign = 'left'
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;">
        <div class="card" style="padding:14px;"><div style="color:var(--text-muted);font-size:.75rem;font-weight:800;">TOTAL CLIENT</div><div style="font-size:1.8rem;font-weight:900;">${totalClients}</div></div>
        <div class="card" style="padding:14px;"><div style="color:var(--text-muted);font-size:.75rem;font-weight:800;">CLIENT AKTIF</div><div style="font-size:1.8rem;font-weight:900;color:var(--success);">${activeClients}</div></div>
        <div class="card" style="padding:14px;"><div style="color:var(--text-muted);font-size:.75rem;font-weight:800;">LISENSI BERMASALAH</div><div style="font-size:1.8rem;font-weight:900;color:${suspendedClients ? 'var(--warning)' : 'var(--success)'};">${suspendedClients}</div></div>
        <div class="card" style="padding:14px;"><div style="color:var(--text-muted);font-size:.75rem;font-weight:800;">TOTAL USER AKTIF</div><div style="font-size:1.8rem;font-weight:900;">${totalEmployees}</div></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
        ${clients.map(c => `
          <div style="border:1px solid var(--border);border-radius:14px;padding:14px;background:var(--white);">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
              <div>
                <div style="font-weight:900;">${safeText(c.nama_client)}</div>
                <div style="font-size:.76rem;color:var(--text-muted);margin-top:3px;">${safeText(c.kode_client)} · ${safeText(c.domain_login)}</div>
              </div>
              <span class="badge ${packageBadgeClass(c.package_type)}">${getPackageLabel(c.package_type)}</span>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
              <span class="badge ${statusBadgeClass(c.status)}">client: ${safeText(c.status || 'active')}</span>
              <span class="badge ${licenseBadgeClass(c.subscription_status)}">lisensi: ${safeText(c.subscription_status || 'active')}</span>
            </div>
            <div style="font-size:.75rem;color:var(--text-muted);margin-top:10px;">${safeText(buildPackageLimitText(c))}</div>
            <div style="margin-top:10px;">
              ${usageLine('Karyawan aktif', c.usage.employees, c.max_employees)}
              ${usageLine('Admin aktif', c.usage.admins, c.max_admins)}
              ${usageLine('Department aktif', c.usage.departments, c.max_departments)}
              ${usageLine('Titik GPS aktif', c.usage.gps_points, c.max_gps_points)}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
              <button class="btn-secondary btn-sm" onclick="navigate('settings-app')"><i class="fa fa-gear"></i> Kelola Paket</button>
            </div>
          </div>
        `).join('') || '<div class="empty-state"><i class="fa fa-building"></i><p>Belum ada client.</p></div>'}
      </div>
    `
  } catch (err) {
    console.error('renderDeveloperPanel error:', err)
    const body = document.getElementById('developerPanelBody')
    if (body) body.innerHTML = `<p class="text-danger">Gagal memuat Developer Panel: ${safeText(err.message)}</p>`
    showToast('Gagal memuat Developer Panel', 'error')
  }
}
