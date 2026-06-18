import { supabase } from './supabase.js'
import { showToast, confirmAction, setButtonLoading } from './feedback.js'
import { resetShiftMasterCache } from './shift-resolver.js'
import { applyTenantFilter } from './access-control.js'

export async function renderShiftManagement() {
  const content = document.getElementById('content')

  const { data: shifts, error } = await applyTenantFilter(supabase.from('shift').select('*').order('jam_masuk'))

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-clock"></i> Shift Management</h2>
      <button class="btn-primary btn-sm" onclick="openFormShift()">
        <i class="fa fa-plus"></i> Tambah Shift
      </button>
    </div>

    ${error ? `<div class="alert danger"><i class="fa fa-exclamation-circle"></i> Gagal memuat data shift</div>` : ''}

    <div class="card fade-up">
      ${!shifts?.length
        ? `<div class="empty-state"><i class="fa fa-clock"></i><p>Belum ada shift</p></div>`
        : shifts.map(s => `
          <div class="shift-card">
            <div class="sc-icon"><i class="fa fa-clock"></i></div>
            <div class="sc-info">
              <div class="sc-name">${s.nama_shift}</div>
              <div class="sc-time">${s.jam_masuk} – ${s.jam_pulang} ${s.keterangan ? '· ' + s.keterangan : ''}</div>
            </div>
            <div class="sc-actions">
              <button class="action-btn delete" onclick="deleteShift('${s.id}')" title="Hapus">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          </div>`).join('')}
    </div>
  `

  window.openFormShift = function () {
    showModal(`
      <div class="modal-header">
        <h3><i class="fa fa-clock" style="color:var(--primary);"></i> Tambah Shift</h3>
        <button class="modal-close" onclick="closeShiftModal()"><i class="fa fa-times"></i></button>
      </div>
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
    if (!nama || !masuk || !pulang) { showToast('Lengkapi data shift', 'warning'); return }
    const btn = document.querySelector('#shiftModal .btn-primary')
    setButtonLoading(btn, true)

    const { error } = await supabase.from('shift').insert([{ nama_shift: nama, jam_masuk: masuk, jam_pulang: pulang, keterangan: ket, client_id: window.currentUser?.client_id || null, department_id: window.currentUser?.department_id || null }])
    setButtonLoading(btn, false)
    if (error) { showToast('Gagal tambah shift: ' + error.message, 'error'); return }
    resetShiftMasterCache()
    closeShiftModal()
    showToast('Shift berhasil ditambahkan', 'success')
    renderShiftManagement()
  }
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
