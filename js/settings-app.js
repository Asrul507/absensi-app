import { supabase } from './supabase.js'
import { showToast } from './feedback.js'
import { requireRole } from './access-control.js'

export async function renderSettingsApp(user = window.currentUser) {
  const content = document.getElementById('content')
  try { requireRole('super_admin', user) } catch (err) { content.innerHTML = `<div class="card"><p class="text-danger">${err.message}</p></div>`; return }
  content.innerHTML = `<div class="page-header"><h2><i class="fa fa-building-user"></i> Settings App · Office & Department</h2><button class="btn-primary btn-sm" onclick="openClientForm()"><i class="fa fa-plus"></i> Tambah Office</button></div><div id="settingsAppBody" class="card" style="padding:18px;text-align:center;"><i class="fa fa-spinner fa-spin"></i> Memuat...</div>`
  await loadSettingsApp()
}

async function loadSettingsApp() {
  const { data: clients, error } = await supabase.from('clients').select('*, departments(*)').order('nama_client')
  const body = document.getElementById('settingsAppBody')
  if (error) { body.innerHTML = `<p class="text-danger">Gagal memuat Office: ${error.message}</p>`; return }
  body.innerHTML = `<div style="display:grid;gap:14px;">${(clients||[]).map(c => `
    <div style="border:1px solid var(--border);border-radius:14px;padding:14px;text-align:left;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div><strong>${c.nama_client}</strong><div style="color:var(--text-muted);font-size:.78rem;">${c.kode_client} · ${c.domain_login} · <span class="badge ${c.status === 'active' ? 'badge-green' : 'badge-gray'}">${c.status}</span></div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn-secondary btn-sm" onclick="openClientForm('${c.id}')"><i class="fa fa-edit"></i> Edit</button><button class="btn-primary btn-sm" onclick="openDepartmentForm('${c.id}')"><i class="fa fa-plus"></i> Department</button></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">${(c.departments||[]).map(d => `<span class="badge ${d.status === 'active' ? 'badge-blue' : 'badge-gray'}" onclick="openDepartmentForm('${c.id}','${d.id}')" style="cursor:pointer;">${d.nama_department}</span>`).join('') || '<span style="color:var(--text-muted);font-size:.8rem;">Belum ada department.</span>'}</div>
    </div>`).join('') || '<p>Belum ada Office.</p>'}</div>`
  window._settingsClients = clients || []
}

window.openClientForm = function(id = '') {
  const c = (window._settingsClients || []).find(x => x.id === id) || {}
  window.showUserModal(`<div class="modal-header"><h3>${id ? 'Edit' : 'Tambah'} Office</h3><button class="modal-close" onclick="closeUserModal()"><i class="fa fa-times"></i></button></div><div style="display:grid;gap:12px;padding-top:10px;"><div class="field"><label>Nama Office</label><input id="clientNama" value="${c.nama_client || ''}"></div><div class="field"><label>Kode Office</label><input id="clientKode" value="${c.kode_client || ''}"></div><div class="field"><label>Domain Login</label><input id="clientDomain" value="${c.domain_login || ''}" placeholder="@kantora"></div><div class="field"><label>Status</label><select id="clientStatus"><option value="active" ${c.status !== 'inactive' ? 'selected' : ''}>active</option><option value="inactive" ${c.status === 'inactive' ? 'selected' : ''}>inactive</option></select></div></div><div class="modal-actions"><button class="btn-secondary" onclick="closeUserModal()">Batal</button><button class="btn-primary" onclick="saveClient('${id}')">Simpan</button></div>`)
}
window.saveClient = async function(id = '') {
  const payload = { nama_client: document.getElementById('clientNama').value.trim(), kode_client: document.getElementById('clientKode').value.trim().toLowerCase(), domain_login: document.getElementById('clientDomain').value.trim().toLowerCase(), status: document.getElementById('clientStatus').value, updated_at: new Date().toISOString() }
  if (!payload.nama_client || !payload.kode_client || !payload.domain_login) return showToast('Nama, kode, dan domain wajib diisi.', 'warning')
  const q = id ? supabase.from('clients').update(payload).eq('id', id) : supabase.from('clients').insert([payload])
  const { error } = await q
  if (error) return showToast('Gagal menyimpan Office: ' + error.message, 'error')
  closeUserModal(); showToast('Office tersimpan.', 'success'); await loadSettingsApp()
}
window.openDepartmentForm = function(clientId, deptId = '') {
  const c = (window._settingsClients || []).find(x => x.id === clientId) || {}; const d = (c.departments || []).find(x => x.id === deptId) || {}
  window.showUserModal(`<div class="modal-header"><h3>${deptId ? 'Edit' : 'Tambah'} Department</h3><button class="modal-close" onclick="closeUserModal()"><i class="fa fa-times"></i></button></div><div style="display:grid;gap:12px;padding-top:10px;"><div class="field"><label>Office</label><input value="${c.nama_client || '-'}" disabled></div><div class="field"><label>Nama Department</label><input id="deptNama" value="${d.nama_department || ''}"></div><div class="field"><label>Status</label><select id="deptStatus"><option value="active" ${d.status !== 'inactive' ? 'selected' : ''}>active</option><option value="inactive" ${d.status === 'inactive' ? 'selected' : ''}>inactive</option></select></div></div><div class="modal-actions"><button class="btn-secondary" onclick="closeUserModal()">Batal</button><button class="btn-primary" onclick="saveDepartment('${clientId}','${deptId}')">Simpan</button></div>`)
}
window.saveDepartment = async function(clientId, deptId = '') {
  const payload = { client_id: clientId, nama_department: document.getElementById('deptNama').value.trim(), status: document.getElementById('deptStatus').value, updated_at: new Date().toISOString() }
  if (!payload.nama_department) return showToast('Nama department wajib diisi.', 'warning')
  const q = deptId ? supabase.from('departments').update(payload).eq('id', deptId) : supabase.from('departments').insert([payload])
  const { error } = await q
  if (error) return showToast('Gagal menyimpan department: ' + error.message, 'error')
  closeUserModal(); showToast('Department tersimpan.', 'success'); await loadSettingsApp()
}
