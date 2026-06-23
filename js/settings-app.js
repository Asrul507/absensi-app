import { supabase } from './supabase.js'
import { showToast } from './feedback.js'
import { requireRole } from './access-control.js'
import { PACKAGE_DEFINITIONS, buildPackageLimitText, getPackageDefaults, getPackageLabel, getPackageOptionsHtml, mergeClientPackageConfig } from './package-service.js'

function escapeAttr(value = '') {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function packageBadgeClass(packageType) {
  if (packageType === 'pro') return 'badge-green'
  if (packageType === 'standard') return 'badge-blue'
  return 'badge-yellow'
}

function clientStatusBadgeClass(status) {
  return status === 'active' ? 'badge-green' : 'badge-gray'
}

function subscriptionBadgeClass(status) {
  if (status === 'active') return 'badge-green'
  if (status === 'suspended') return 'badge-yellow'
  return 'badge-gray'
}

export async function renderSettingsApp(user = window.currentUser) {
  const content = document.getElementById('content')
  try {
    requireRole('super_admin', user)
  } catch (err) {
    content.innerHTML = `<div class="card"><p class="text-danger">${err.message}</p></div>`
    return
  }

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2><i class="fa fa-building-user"></i> Client & Package Settings</h2>
        <p style="margin:6px 0 0;color:var(--text-muted);font-size:.86rem;">Kelola domain kantor, paket client, limit penggunaan, dan department.</p>
      </div>
      <button class="btn-primary btn-sm" onclick="openClientForm()"><i class="fa fa-plus"></i> Tambah Client</button>
    </div>
    <div id="settingsAppBody" class="card" style="padding:18px;text-align:center;"><i class="fa fa-spinner fa-spin"></i> Memuat...</div>
  `
  await loadSettingsApp()
}

async function loadSettingsApp() {
  const { data: rawClients, error } = await supabase
    .from('clients')
    .select('*, departments(*)')
    .order('nama_client')

  const body = document.getElementById('settingsAppBody')
  if (!body) return

  if (error) {
    body.innerHTML = `<p class="text-danger">Gagal memuat Client: ${error.message}</p>`
    return
  }

  const clients = (rawClients || []).map(mergeClientPackageConfig)
  window._settingsClients = clients

  body.innerHTML = `
    <div style="display:grid;gap:14px;">
      ${clients.map(c => {
        const activeDepartments = (c.departments || []).filter(d => d.status !== 'inactive')
        const deptCount = activeDepartments.length
        const deptFull = deptCount >= c.max_departments
        return `
          <div style="border:1px solid var(--border);border-radius:14px;padding:14px;text-align:left;background:var(--white);">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
              <div>
                <strong style="font-size:1rem;">${escapeAttr(c.nama_client)}</strong>
                <div style="color:var(--text-muted);font-size:.78rem;margin-top:3px;">
                  ${escapeAttr(c.kode_client)} · ${escapeAttr(c.domain_login)} ·
                  <span class="badge ${clientStatusBadgeClass(c.status)}">${escapeAttr(c.status || 'active')}</span>
                  <span class="badge ${subscriptionBadgeClass(c.subscription_status)}">lisensi: ${escapeAttr(c.subscription_status || 'active')}</span>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                  <span class="badge ${packageBadgeClass(c.package_type)}"><i class="fa fa-box"></i> Paket ${getPackageLabel(c.package_type)}</span>
                  <span class="badge badge-gray">${buildPackageLimitText(c)}</span>
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn-secondary btn-sm" onclick="openClientForm('${c.id}')"><i class="fa fa-edit"></i> Edit Client</button>
                <button class="btn-primary btn-sm" onclick="openDepartmentForm('${c.id}')" ${deptFull ? 'disabled title="Limit department paket sudah penuh"' : ''}>
                  <i class="fa fa-plus"></i> Department ${deptCount}/${c.max_departments}
                </button>
              </div>
            </div>
            <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
              ${(c.departments || []).map(d => `<span class="badge ${d.status === 'active' ? 'badge-blue' : 'badge-gray'}" onclick="openDepartmentForm('${c.id}','${d.id}')" style="cursor:pointer;">${escapeAttr(d.nama_department)}</span>`).join('') || '<span style="color:var(--text-muted);font-size:.8rem;">Belum ada department.</span>'}
            </div>
            ${c.package_notes ? `<div style="margin-top:10px;color:var(--text-muted);font-size:.8rem;"><i class="fa fa-note-sticky"></i> ${escapeAttr(c.package_notes)}</div>` : ''}
          </div>
        `
      }).join('') || '<p>Belum ada Client.</p>'}
    </div>
  `
}

window.applyPackageDefaults = function() {
  const packageType = document.getElementById('clientPackage')?.value || 'basic'
  const defaults = getPackageDefaults(packageType)
  Object.entries(defaults).forEach(([key, value]) => {
    const el = document.getElementById(key)
    if (el) el.value = value
  })
  const info = document.getElementById('packagePreviewInfo')
  const pkg = PACKAGE_DEFINITIONS[defaults.package_type]
  if (info) {
    info.innerHTML = `
      <div style="padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--gray-50);font-size:.82rem;color:var(--text-muted);">
        <strong style="color:var(--text);">Paket ${pkg.label}</strong> · ${pkg.price_label}<br>
        Max ${pkg.max_employees} karyawan, ${pkg.max_admins} admin, ${pkg.max_departments} department, ${pkg.max_locations} lokasi, ${pkg.max_gps_points} titik GPS.
      </div>
    `
  }
}

window.openClientForm = function(id = '') {
  const existing = (window._settingsClients || []).find(x => x.id === id) || {}
  const c = mergeClientPackageConfig(existing)

  window.showUserModal(`
    <div class="modal-header">
      <h3>${id ? 'Edit' : 'Tambah'} Client</h3>
      <button class="modal-close" onclick="closeUserModal()"><i class="fa fa-times"></i></button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;padding-top:10px;">
      <div class="field"><label>Nama Client / Office <span class="req">*</span></label><input id="clientNama" value="${escapeAttr(c.nama_client || '')}" placeholder="PT Contoh Maju"></div>
      <div class="field"><label>Kode Office <span class="req">*</span></label><input id="clientKode" value="${escapeAttr(c.kode_client || '')}" placeholder="contoh"></div>
      <div class="field"><label>Domain Login <span class="req">*</span></label><input id="clientDomain" value="${escapeAttr(c.domain_login || '')}" placeholder="@contoh"></div>
      <div class="field"><label>Status Client</label><select id="clientStatus"><option value="active" ${c.status !== 'inactive' ? 'selected' : ''}>active</option><option value="inactive" ${c.status === 'inactive' ? 'selected' : ''}>inactive</option></select></div>

      <div class="field" style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:10px;margin-top:4px;">
        <label style="color:var(--primary);font-weight:900;"><i class="fa fa-box"></i> Paket & Limit Client</label>
      </div>
      <div class="field"><label>Paket <span class="req">*</span></label><select id="clientPackage" onchange="applyPackageDefaults()">${getPackageOptionsHtml(c.package_type)}</select></div>
      <div class="field"><label>Status Lisensi</label><select id="subscriptionStatus"><option value="active" ${c.subscription_status === 'active' ? 'selected' : ''}>active</option><option value="suspended" ${c.subscription_status === 'suspended' ? 'selected' : ''}>suspended</option><option value="expired" ${c.subscription_status === 'expired' ? 'selected' : ''}>expired</option></select></div>
      <div class="field"><label>Jenis Lisensi</label><select id="licenseType"><option value="one_time" ${c.license_type === 'one_time' ? 'selected' : ''}>one_time</option><option value="monthly" ${c.license_type === 'monthly' ? 'selected' : ''}>monthly</option><option value="yearly" ${c.license_type === 'yearly' ? 'selected' : ''}>yearly</option></select></div>
      <div class="field"><label>Tanggal Mulai</label><input type="date" id="licenseStart" value="${escapeAttr(c.license_start || new Date().toISOString().slice(0, 10))}"></div>
      <div class="field"><label>Tanggal Akhir</label><input type="date" id="licenseEnd" value="${escapeAttr(c.license_end || '')}"></div>

      <input type="hidden" id="package_type" value="${escapeAttr(c.package_type)}">
      <div class="field"><label>Max Karyawan</label><input type="number" min="1" id="max_employees" value="${c.max_employees}"></div>
      <div class="field"><label>Max Admin</label><input type="number" min="1" id="max_admins" value="${c.max_admins}"></div>
      <div class="field"><label>Max Department</label><input type="number" min="1" id="max_departments" value="${c.max_departments}"></div>
      <div class="field"><label>Max Lokasi/Site</label><input type="number" min="1" id="max_locations" value="${c.max_locations}"></div>
      <div class="field"><label>Max Titik GPS</label><input type="number" min="1" id="max_gps_points" value="${c.max_gps_points}"></div>
      <div id="packagePreviewInfo" style="grid-column:1/-1;"></div>
      <div class="field" style="grid-column:1/-1;"><label>Catatan Client</label><textarea id="packageNotes" rows="3" placeholder="Catatan paket, kontrak, atau kebutuhan client...">${escapeAttr(c.package_notes || '')}</textarea></div>
    </div>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeUserModal()">Batal</button>
      <button class="btn-primary" onclick="saveClient('${id}')">Simpan</button>
    </div>
  `)

  const pkgEl = document.getElementById('clientPackage')
  if (pkgEl) pkgEl.value = c.package_type
  window.applyPackageDefaults()
  ;['max_employees','max_admins','max_departments','max_locations','max_gps_points'].forEach(key => {
    const el = document.getElementById(key)
    if (el && c[key]) el.value = c[key]
  })
}

window.saveClient = async function(id = '') {
  const packageType = document.getElementById('clientPackage')?.value || 'basic'
  const payload = {
    nama_client: document.getElementById('clientNama')?.value.trim(),
    kode_client: document.getElementById('clientKode')?.value.trim().toLowerCase(),
    domain_login: document.getElementById('clientDomain')?.value.trim().toLowerCase(),
    status: document.getElementById('clientStatus')?.value || 'active',
    package_type: packageType,
    max_employees: Number(document.getElementById('max_employees')?.value || 0),
    max_admins: Number(document.getElementById('max_admins')?.value || 0),
    max_departments: Number(document.getElementById('max_departments')?.value || 0),
    max_locations: Number(document.getElementById('max_locations')?.value || 0),
    max_gps_points: Number(document.getElementById('max_gps_points')?.value || 0),
    subscription_status: document.getElementById('subscriptionStatus')?.value || 'active',
    license_type: document.getElementById('licenseType')?.value || 'one_time',
    license_start: document.getElementById('licenseStart')?.value || new Date().toISOString().slice(0, 10),
    license_end: document.getElementById('licenseEnd')?.value || null,
    package_notes: document.getElementById('packageNotes')?.value.trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (!payload.nama_client || !payload.kode_client || !payload.domain_login) return showToast('Nama, kode, dan domain wajib diisi.', 'warning')
  if (!payload.domain_login.startsWith('@')) return showToast('Domain Login harus diawali @, contoh: @livingbpn', 'warning')
  if (!payload.max_employees || !payload.max_admins || !payload.max_departments || !payload.max_locations || !payload.max_gps_points) return showToast('Semua limit paket wajib lebih dari 0.', 'warning')

  const q = id ? supabase.from('clients').update(payload).eq('id', id) : supabase.from('clients').insert([payload])
  const { error } = await q
  if (error) return showToast('Gagal menyimpan Client: ' + error.message, 'error')

  closeUserModal()
  showToast('Client dan paket tersimpan.', 'success')
  await loadSettingsApp()
}

window.openDepartmentForm = function(clientId, deptId = '') {
  const c = (window._settingsClients || []).find(x => x.id === clientId) || {}
  const d = (c.departments || []).find(x => x.id === deptId) || {}
  const activeDeptCount = (c.departments || []).filter(x => x.status !== 'inactive').length
  if (!deptId && activeDeptCount >= Number(c.max_departments || 1)) {
    showToast(`Limit department paket ${getPackageLabel(c.package_type)} sudah penuh (${activeDeptCount}/${c.max_departments}).`, 'warning')
    return
  }

  window.showUserModal(`
    <div class="modal-header"><h3>${deptId ? 'Edit' : 'Tambah'} Department</h3><button class="modal-close" onclick="closeUserModal()"><i class="fa fa-times"></i></button></div>
    <div style="display:grid;gap:12px;padding-top:10px;">
      <div class="field"><label>Client / Office</label><input value="${escapeAttr(c.nama_client || '-')}" disabled></div>
      <div class="field"><label>Limit Department</label><input value="${activeDeptCount}/${c.max_departments || 1} aktif" disabled></div>
      <div class="field"><label>Nama Department <span class="req">*</span></label><input id="deptNama" value="${escapeAttr(d.nama_department || '')}"></div>
      <div class="field"><label>Status</label><select id="deptStatus"><option value="active" ${d.status !== 'inactive' ? 'selected' : ''}>active</option><option value="inactive" ${d.status === 'inactive' ? 'selected' : ''}>inactive</option></select></div>
    </div>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeUserModal()">Batal</button><button class="btn-primary" onclick="saveDepartment('${clientId}','${deptId}')">Simpan</button></div>
  `)
}

window.saveDepartment = async function(clientId, deptId = '') {
  const c = (window._settingsClients || []).find(x => x.id === clientId) || {}
  const nextStatus = document.getElementById('deptStatus')?.value || 'active'
  const activeDeptCount = (c.departments || []).filter(x => x.status !== 'inactive' && x.id !== deptId).length
  if (nextStatus !== 'inactive' && activeDeptCount >= Number(c.max_departments || 1)) {
    return showToast(`Limit department paket ${getPackageLabel(c.package_type)} sudah penuh (${activeDeptCount}/${c.max_departments}).`, 'warning')
  }

  const payload = {
    client_id: clientId,
    nama_department: document.getElementById('deptNama')?.value.trim(),
    status: nextStatus,
    updated_at: new Date().toISOString(),
  }
  if (!payload.nama_department) return showToast('Nama department wajib diisi.', 'warning')

  const q = deptId ? supabase.from('departments').update(payload).eq('id', deptId) : supabase.from('departments').insert([payload])
  const { error } = await q
  if (error) return showToast('Gagal menyimpan department: ' + error.message, 'error')

  closeUserModal()
  showToast('Department tersimpan.', 'success')
  await loadSettingsApp()
}