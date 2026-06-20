import { supabase } from './supabase.js'
import { showToast, confirmAction, setButtonLoading } from './feedback.js'
import { resetShiftMasterCache } from './shift-resolver.js'
import { applyTenantFilter, isSuperAdmin } from './access-control.js'

function safeText(value, fallback = '-') {
  const text = value === null || value === undefined || value === '' ? fallback : String(value)
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getShiftOfficeLabel(shift) {
  const client = Array.isArray(shift?.clients) ? shift.clients[0] : shift?.clients
  if (client?.nama_client) return `${client.nama_client}${client.domain_login || client.kode_client ? ` (${client.domain_login || client.kode_client})` : ''}`
  return shift?.client_id || 'Belum ada Office'
}

async function fetchActiveOffices() {
  const { data, error } = await supabase.from('clients').select('id,nama_client,kode_client,domain_login,status').eq('status', 'active').order('nama_client')
  if (error) throw error
  return data || []
}

async function countLegacyShiftsWithoutOffice() {
  try {
    const { count, error } = await supabase.from('shift').select('id', { count: 'exact', head: true }).is('client_id', null)
    if (error) throw error
    return count || 0
  } catch (err) {
    console.warn('Tidak dapat menghitung shift legacy tanpa Office:', err)
    return 0
  }
}

export async function renderShiftManagement() {
  const content = document.getElementById('content')
  const superAdmin = isSuperAdmin(window.currentUser)

  const { data: shifts, error } = await applyTenantFilter(
    supabase.from('shift').select('*, clients:client_id(id,nama_client,kode_client,domain_login,status)').order('jam_masuk'),
    { user: window.currentUser, clientColumn: 'client_id', departmentColumn: null, userColumn: null, enforceSelf: false, enforceDepartment: false }
  )
  const visibleShifts = (shifts || []).filter(s => superAdmin || s.client_id)
  const legacyShifts = (shifts || []).filter(s => !s.client_id)
  const legacyShiftWarningCount = superAdmin ? legacyShifts.length : await countLegacyShiftsWithoutOffice()
  let officeOptions = []
  if (superAdmin) {
    try {
      officeOptions = await fetchActiveOffices()
    } catch (err) {
      console.error('Gagal memuat Office untuk Shift:', err)
      showToast('Gagal memuat daftar Office untuk Shift.', 'warning')
    }
  }

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-clock"></i> Shift Management</h2>
      <button class="btn-primary btn-sm" onclick="openFormShift()">
        <i class="fa fa-plus"></i> Tambah Shift
      </button>
    </div>

    ${error ? `<div class="alert danger"><i class="fa fa-exclamation-circle"></i> Gagal memuat data shift</div>` : ''}
    ${legacyShiftWarningCount ? `
      <div class="alert warning" style="margin-bottom:12px;">
        <i class="fa fa-triangle-exclamation"></i>
        ${superAdmin
          ? `<span><strong>${legacyShiftWarningCount}</strong> shift legacy belum memiliki Office. Shift ini hanya terlihat oleh Super Admin sampai di-assign ke Office.</span>`
          : `<span>Ada shift legacy tanpa Office pada data lama. Data ini disembunyikan dari role Office dan perlu di-assign oleh Super Admin.</span>`}
      </div>
    ` : ''}

    <div class="card fade-up">
      ${!visibleShifts?.length
        ? `<div class="empty-state"><i class="fa fa-clock"></i><p>Belum ada shift</p></div>`
        : visibleShifts.map(s => `
          <div class="shift-card">
            <div class="sc-icon"><i class="fa fa-clock"></i></div>
            <div class="sc-info">
              <div class="sc-name">
                ${safeText(s.nama_shift)}
                ${!s.client_id ? `<span class="badge badge-yellow" style="margin-left:6px;">Belum ada Office</span>` : ''}
              </div>
              <div class="sc-time">${safeText(s.jam_masuk)} – ${safeText(s.jam_pulang)} ${s.keterangan ? '· ' + safeText(s.keterangan) : ''}</div>
              <div style="font-size:.72rem;color:var(--text-muted);margin-top:3px;"><i class="fa fa-building"></i> Office: ${safeText(getShiftOfficeLabel(s))}</div>
            </div>
            <div class="sc-actions">
              ${superAdmin && !s.client_id ? `
                <button class="btn-secondary btn-sm" onclick="openAssignShiftOffice('${safeText(s.id)}')" title="Assign Office">
                  <i class="fa fa-building"></i> Assign Office
                </button>
              ` : ''}
              <button class="action-btn delete" onclick="deleteShift('${safeText(s.id)}')" title="Hapus">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          </div>`).join('')}
    </div>
  `
  window._shiftOfficeOptions = officeOptions
  window._shiftRows = visibleShifts

  window.openFormShift = function () {
    const officeField = superAdmin
      ? `<div class="field"><label>Office <span class="req">*</span></label>
          <select id="sOffice">
            <option value="">-- Pilih Office --</option>
            ${(window._shiftOfficeOptions || []).map(c => `<option value="${safeText(c.id)}">${safeText(c.nama_client)} (${safeText(c.domain_login || c.kode_client)})</option>`).join('')}
          </select>
        </div>`
      : `<div class="field"><label>Office</label><input value="${safeText(window.currentUser?.clients?.nama_client || window.currentUser?.nama_client || window.currentUser?.client_id)}" disabled></div>`
    showModal(`
      <div class="modal-header">
        <h3><i class="fa fa-clock" style="color:var(--primary);"></i> Tambah Shift</h3>
        <button class="modal-close" onclick="closeShiftModal()"><i class="fa fa-times"></i></button>
      </div>
      ${officeField}
      <div class="field"><label>Nama Shift <span class="req">*</span></label>
        <input id="sNama" placeholder="cth: Shift Pagi"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label>Jam Masuk <span class="req">*</span></label>
          <input type="time" id="sJamMasuk"></div>
        <div class="field"><label>Jam Pulang <span class="req">*</span></label>
          <input type="time" id="sJamPulang"></div>
      </div>
      <div class="field"><label>Keterangan</label>
        <input id="sKet" placeholder="Opsional"></div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeShiftModal()">Batal</button>
        <button class="btn-primary" onclick="saveShift()"><i class="fa fa-save"></i> Simpan</button>
      </div>
    `)
  }

  window.saveShift = async function () {
    const nama     = document.getElementById('sNama').value.trim()
    const masuk    = document.getElementById('sJamMasuk').value
    const pulang   = document.getElementById('sJamPulang').value
    const ket      = document.getElementById('sKet').value.trim()
    const clientId = superAdmin ? document.getElementById('sOffice')?.value : window.currentUser?.client_id
    if (!nama || !masuk || !pulang) { showToast('Lengkapi data shift', 'warning'); return }
    if (!clientId) { showToast('Office wajib dipilih untuk shift baru.', 'warning'); return }
    const btn = document.querySelector('#shiftModal .btn-primary')
    setButtonLoading(btn, true)

    const { error } = await supabase.from('shift').insert([{ nama_shift: nama, jam_masuk: masuk, jam_pulang: pulang, keterangan: ket, client_id: clientId, department_id: window.currentUser?.department_id || null }])
    setButtonLoading(btn, false)
    if (error) { showToast('Gagal tambah shift: ' + error.message, 'error'); return }
    resetShiftMasterCache()
    closeShiftModal()
    showToast('Shift berhasil ditambahkan', 'success')
    renderShiftManagement()
  }
}

window.openAssignShiftOffice = function(id) {
  if (!isSuperAdmin(window.currentUser)) { showToast('Hanya Super Admin yang dapat assign Office shift legacy.', 'warning'); return }
  const target = (window._shiftRows || []).find(s => String(s.id) === String(id))
  if (!target) { showToast('Shift tidak ditemukan.', 'warning'); return }
  showModal(`
    <div class="modal-header">
      <h3><i class="fa fa-building" style="color:var(--primary);"></i> Assign Shift ke Office</h3>
      <button class="modal-close" onclick="closeShiftModal()"><i class="fa fa-times"></i></button>
    </div>
    <div class="alert warning" style="margin-bottom:10px;">
      <i class="fa fa-triangle-exclamation"></i> Shift legacy <strong>${safeText(target.nama_shift)}</strong> belum memiliki Office.
    </div>
    <div class="field"><label>Office <span class="req">*</span></label>
      <select id="assignShiftOffice">
        <option value="">-- Pilih Office --</option>
        ${(window._shiftOfficeOptions || []).map(c => `<option value="${safeText(c.id)}">${safeText(c.nama_client)} (${safeText(c.domain_login || c.kode_client)})</option>`).join('')}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeShiftModal()">Batal</button>
      <button class="btn-primary" onclick="saveAssignShiftOffice('${safeText(target.id)}')"><i class="fa fa-save"></i> Assign Office</button>
    </div>
  `)
}

window.saveAssignShiftOffice = async function(id) {
  if (!isSuperAdmin(window.currentUser)) { showToast('Hanya Super Admin yang dapat assign Office shift legacy.', 'warning'); return }
  const clientId = document.getElementById('assignShiftOffice')?.value
  if (!clientId) { showToast('Office wajib dipilih.', 'warning'); return }
  const btn = document.querySelector('#shiftModal .btn-primary')
  setButtonLoading(btn, true)
  const { error } = await supabase.from('shift').update({ client_id: clientId }).eq('id', id)
  setButtonLoading(btn, false)
  if (error) { showToast('Gagal assign Office shift: ' + error.message, 'error'); return }
  resetShiftMasterCache()
  closeShiftModal()
  showToast('Shift legacy berhasil di-assign ke Office.', 'success')
  renderShiftManagement()
}

window.deleteShift = async function (id) {
  if (!(await confirmAction('Hapus shift ini?', 'Ya, hapus'))) return
  const { error } = await supabase.from('shift').delete().eq('id', id)
  if (error) { showToast('Gagal hapus shift: ' + error.message, 'error'); return }
  resetShiftMasterCache()
  showToast('Shift dihapus', 'success')
  renderShiftManagement()
}

function showModal(html) {
  let el = document.getElementById('shiftModal')
  if (el) el.remove()
  const bg = document.createElement('div')
  bg.id = 'shiftModal'; bg.className = 'modal-bg open'
  bg.innerHTML = `<div class="modal-box">${html}</div>`
  bg.addEventListener('click', e => { if (e.target === bg) closeShiftModal() })
  document.body.appendChild(bg)
}
window.closeShiftModal = () => { const m = document.getElementById('shiftModal'); if (m) m.remove() }
