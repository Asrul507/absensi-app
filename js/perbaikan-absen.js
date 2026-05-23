import { supabase } from './supabase.js'

export async function renderPerbaikanAbsen(user) {
  const content = document.getElementById('content')
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-pencil-alt"></i> Perbaikan Absen</h2>
    </div>

    <!-- TABS -->
    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
      <button id="tabBuat" class="btn-primary btn-sm" onclick="switchPerbaikanTab('buat')">
        <i class="fa fa-plus"></i> Buat Request
      </button>
      <button id="tabDaftar" class="btn-secondary btn-sm" onclick="switchPerbaikanTab('daftar')">
        <i class="fa fa-list"></i> Daftar Request
      </button>
      ${isAdmin ? `
        <button id="tabApproval" class="btn-secondary btn-sm" onclick="switchPerbaikanTab('approval')">
          <i class="fa fa-check-circle"></i> Approval
        </button>
      ` : ''}
    </div>

    <!-- TAB BUAT REQUEST -->
    <div id="tabBuatContent" class="fade-up">
      <div class="card" style="padding: 20px;">
        <h3 style="font-weight: 800; margin-bottom: 16px;">Buat Request Perbaikan Absen</h3>

        <div class="field">
          <label>Tanggal <span style="color: var(--danger);">*</span></label>
          <input type="date" id="inputTanggal" onchange="loadJadwalForDate(window.currentUser)"
            style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
              font-size: .85rem; font-family: inherit; outline: none;">
        </div>

        <div class="field">
          <label>Jenis Perbaikan <span style="color: var(--danger);">*</span></label>
          <select id="inputJenis" onchange="updatePerbaikanForm()"
            style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
              font-size: .85rem; font-family: inherit; outline: none;">
            <option value="">-- Pilih Jenis --</option>
            <option value="lupa_masuk">Lupa Masuk</option>
            <option value="lupa_pulang">Lupa Pulang</option>
            <option value="perubahan_shift">Perubahan Shift</option>
          </select>
        </div>

        <!-- Kondisional: Lupa Masuk/Pulang -->
        <div id="formJamShouldBe" style="display: none;">
          <div class="field">
            <label>Jam yang Seharusnya (dari jadwal) <span style="color: var(--text-muted);">Auto-filled</span></label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="font-size: .75rem; color: var(--text-muted); display: block; margin-bottom: 5px;">Jam Masuk</label>
                <input type="time" id="inputJamMasukShouldBe" disabled
                  style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                    font-size: .85rem; font-family: inherit; outline: none; background: #f3f4f6;">
              </div>
              <div>
                <label style="font-size: .75rem; color: var(--text-muted); display: block; margin-bottom: 5px;">Jam Pulang</label>
                <input type="time" id="inputJamPulangShouldBe" disabled
                  style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                    font-size: .85rem; font-family: inherit; outline: none; background: #f3f4f6;">
              </div>
            </div>
          </div>

          <div class="field">
            <label>Jam yang Diinput (Isi Jika Lupa) <span style="color: var(--danger);">*</span></label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="font-size: .75rem; color: var(--text-muted); display: block; margin-bottom: 5px;">Jam Masuk Anda</label>
                <input type="time" id="inputJamMasukActual"
                  style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                    font-size: .85rem; font-family: inherit; outline: none;">
              </div>
              <div>
                <label style="font-size: .75rem; color: var(--text-muted); display: block; margin-bottom: 5px;">Jam Pulang Anda</label>
                <input type="time" id="inputJamPulangActual"
                  style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                    font-size: .85rem; font-family: inherit; outline: none;">
              </div>
            </div>
          </div>
        </div>

        <!-- Kondisional: Perubahan Shift -->
        <div id="formPerubahanShift" style="display: none;">
          <div class="field">
            <label>Shift Baru <span style="color: var(--danger);">*</span></label>
            <select id="inputShiftBaru"
              style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                font-size: .85rem; font-family: inherit; outline: none;">
              <option value="">-- Pilih Shift --</option>
              <option value="pagi">Shift Pagi (07:00 - 15:00)</option>
              <option value="sore">Shift Sore (15:00 - 23:00)</option>
              <option value="malam">Shift Malam (23:00 - 07:00)</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>Keterangan / Alasan <span style="color: var(--danger);">*</span></label>
          <textarea id="inputKeterangan" placeholder="Jelaskan alasan perbaikan absen..."
            style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
              font-size: .85rem; font-family: inherit; outline: none; min-height: 100px; resize: vertical;"></textarea>
        </div>

        <button class="btn-primary" onclick="submitPerbaikanAbsen(window.currentUser)" style="width: 100%; margin-top: 16px;">
          <i class="fa fa-paper-plane"></i> Kirim Request
        </button>
        <p id="msgStatusBuat" style="font-size: .8rem; margin-top: 8px; min-height: 18px; text-align: center;"></p>
      </div>
    </div>

    <!-- TAB DAFTAR REQUEST -->
    <div id="tabDaftarContent" style="display: none;" class="fade-up">
      <div id="daftarRequestList" class="card" style="text-align: center; padding: 28px;">
        <i class="fa fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
        <p style="color: var(--text-muted); margin-top: 8px; font-size: .85rem;">Memuat data...</p>
      </div>
    </div>

    <!-- TAB APPROVAL (hanya admin) -->
    ${isAdmin ? `
      <div id="tabApprovalContent" style="display: none;" class="fade-up">
        <div id="approvalRequestList" class="card" style="text-align: center; padding: 28px;">
          <i class="fa fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
          <p style="color: var(--text-muted); margin-top: 8px; font-size: .85rem;">Memuat data...</p>
        </div>
      </div>
    ` : ''}
  `

  window._currentPerbaikanUser = user
  window._isAdminPerbaikan = user.role === 'admin' || user.role === 'super_admin'

  // Load daftar request
  await loadDaftarRequest(user)
  if (window._isAdminPerbaikan) {
    await loadApprovalRequest()
  }
}

window.updatePerbaikanForm = function () {
  const jenis = document.getElementById('inputJenis').value
  
  document.getElementById('formJamShouldBe').style.display = (jenis === 'lupa_masuk' || jenis === 'lupa_pulang') ? 'block' : 'none'
  document.getElementById('formPerubahanShift').style.display = jenis === 'perubahan_shift' ? 'block' : 'none'
}

window.loadJadwalForDate = async function (user) {
  const tanggal = document.getElementById('inputTanggal').value
  if (!tanggal) return

  try {
    const { data: jadwal } = await supabase
      .from('jadwal')
      .select('shift_code')
      .eq('user_id', user.id)
      .eq('tanggal', tanggal)
      .maybeSingle()

    // Map shift code to time
    const shiftMap = {
      '2': { jam_masuk: '07:00', jam_pulang: '15:00' },
      '3': { jam_masuk: '15:00', jam_pulang: '23:00' },
      '4': { jam_masuk: '23:00', jam_pulang: '07:00' },
    }

    const shiftData = shiftMap[jadwal?.shift_code] || { jam_masuk: '07:00', jam_pulang: '15:00' }

    document.getElementById('inputJamMasukShouldBe').value = shiftData.jam_masuk
    document.getElementById('inputJamPulangShouldBe').value = shiftData.jam_pulang

  } catch (err) {
    console.error('Error load jadwal:', err)
  }
}

window.switchPerbaikanTab = async function (tab) {
  document.getElementById('tabBuat').className = tab === 'buat' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  document.getElementById('tabDaftar').className = tab === 'daftar' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  
  if (document.getElementById('tabApproval')) {
    document.getElementById('tabApproval').className = tab === 'approval' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  }

  document.getElementById('tabBuatContent').style.display = tab === 'buat' ? 'block' : 'none'
  document.getElementById('tabDaftarContent').style.display = tab === 'daftar' ? 'block' : 'none'
  
  if (document.getElementById('tabApprovalContent')) {
    document.getElementById('tabApprovalContent').style.display = tab === 'approval' ? 'block' : 'none'
    if (tab === 'approval') {
      await loadApprovalRequest()
    }
  }

  if (tab === 'daftar') {
    await loadDaftarRequest(window._currentPerbaikanUser)
  }
}

window.submitPerbaikanAbsen = async function (user) {
  const tanggal = document.getElementById('inputTanggal').value
  const jenis = document.getElementById('inputJenis').value
  const keterangan = document.getElementById('inputKeterangan').value
  const msgEl = document.getElementById('msgStatusBuat')
  const btn = event.target

  msgEl.textContent = ''

  // Validasi
  if (!tanggal) {
    msgEl.style.color = '#dc2626'
    msgEl.textContent = '⚠ Tanggal wajib diisi'
    return
  }
  if (!jenis) {
    msgEl.style.color = '#dc2626'
    msgEl.textContent = '⚠ Jenis perbaikan wajib dipilih'
    return
  }
  if (!keterangan.trim()) {
    msgEl.style.color = '#dc2626'
    msgEl.textContent = '⚠ Keterangan wajib diisi'
    return
  }

  let payload = {
    user_id: user.id,
    nama: user.nama_lengkap,
    tanggal,
    jenis,
    keterangan,
    status: 'pending',
    created_at: new Date().toISOString()
  }

  // Tambah data sesuai jenis
  if (jenis === 'lupa_masuk' || jenis === 'lupa_pulang') {
    payload.jam_masuk = document.getElementById('inputJamMasukActual').value || null
    payload.jam_pulang = document.getElementById('inputJamPulangActual').value || null
  } else if (jenis === 'perubahan_shift') {
    payload.shift_baru = document.getElementById('inputShiftBaru').value
  }

  btn.disabled = true
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mengirim...'

  try {
    const { error } = await supabase.from('perbaikan_absen').insert([payload])

    if (error) throw error

    msgEl.style.color = '#16a34a'
    msgEl.textContent = '✅ Request berhasil dikirim'

    // Reset form
    setTimeout(() => {
      document.getElementById('inputTanggal').value = ''
      document.getElementById('inputJenis').value = ''
      document.getElementById('inputJamMasukActual').value = ''
      document.getElementById('inputJamPulangActual').value = ''
      document.getElementById('inputShiftBaru').value = ''
      document.getElementById('inputKeterangan').value = ''
      updatePerbaikanForm()
    }, 1500)

  } catch (err) {
    msgEl.style.color = '#dc2626'
    msgEl.textContent = '❌ Error: ' + err.message
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="fa fa-paper-plane"></i> Kirim Request'
  }
}

async function loadDaftarRequest(user) {
  const el = document.getElementById('daftarRequestList')

  try {
    const { data, error } = await supabase
      .from('perbaikan_absen')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    if (!data?.length) {
      el.innerHTML = `
        <div class="empty-state" style="padding: 52px 24px;">
          <i class="fa fa-inbox"></i>
          <p>Belum ada request perbaikan</p>
        </div>
      `
      return
    }

    let html = ''
    data.forEach(req => {
      const statusColor = req.status === 'approved' ? '#dcfce7' : req.status === 'rejected' ? '#fee2e2' : '#fef3c7'
      const statusTextColor = req.status === 'approved' ? '#166534' : req.status === 'rejected' ? '#991b1b' : '#92400e'
      const statusText = req.status === 'approved' ? 'Disetujui' : req.status === 'rejected' ? 'Ditolak' : 'Menunggu'

      html += `
        <div class="card" style="padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <div style="font-weight: 800; font-size: .95rem;">${req.tanggal}</div>
              <div style="font-size: .75rem; color: var(--text-muted); margin-top: 3px;">
                ${req.jenis.replace('_', ' ').toUpperCase()}
              </div>
            </div>
            <span style="
              padding: 4px 10px;
              border-radius: 20px;
              font-size: .7rem;
              font-weight: 700;
              background: ${statusColor};
              color: ${statusTextColor};
            ">
              ${statusText}
            </span>
          </div>
          <div style="padding: 12px 0; border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200); margin: 12px 0; font-size: .85rem;">
            <strong>Alasan:</strong> ${req.keterangan}
          </div>
          ${req.jam_masuk ? `<div style="font-size: .8rem; color: var(--text-muted);">Jam Masuk: ${req.jam_masuk}</div>` : ''}
          ${req.jam_pulang ? `<div style="font-size: .8rem; color: var(--text-muted);">Jam Pulang: ${req.jam_pulang}</div>` : ''}
          ${req.shift_baru ? `<div style="font-size: .8rem; color: var(--text-muted);">Shift Baru: ${req.shift_baru}</div>` : ''}
          ${req.catatan_approval ? `<div style="font-size: .8rem; color: var(--warning); margin-top: 8px;"><strong>Catatan Admin:</strong> ${req.catatan_approval}</div>` : ''}
        </div>
      `
    })

    el.innerHTML = html

  } catch (err) {
    el.innerHTML = `<div class="card"><p style="color: var(--danger);">Error: ${err.message}</p></div>`
  }
}

async function loadApprovalRequest() {
  const el = document.getElementById('approvalRequestList')

  try {
    const { data, error } = await supabase
      .from('perbaikan_absen')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) throw error

    if (!data?.length) {
      el.innerHTML = `
        <div class="empty-state" style="padding: 52px 24px;">
          <i class="fa fa-check-circle"></i>
          <p>Tidak ada request yang menunggu approval</p>
        </div>
      `
      return
    }

    let html = ''
    data.forEach(req => {
      html += `
        <div class="card" style="padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <div style="font-weight: 800; font-size: .95rem;">${req.nama}</div>
              <div style="font-size: .75rem; color: var(--text-muted); margin-top: 3px;">
                ${req.tanggal} • ${req.jenis.replace('_', ' ').toUpperCase()}
              </div>
            </div>
            <span style="
              padding: 4px 10px;
              border-radius: 20px;
              font-size: .7rem;
              font-weight: 700;
              background: #fef3c7;
              color: #92400e;
            ">
              Menunggu
            </span>
          </div>
          <div style="padding: 12px 0; border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200); margin: 12px 0; font-size: .85rem;">
            <strong>Alasan:</strong> ${req.keterangan}
          </div>
          ${req.jam_masuk ? `<div style="font-size: .8rem; color: var(--text-muted);">Jam Masuk: ${req.jam_masuk}</div>` : ''}
          ${req.jam_pulang ? `<div style="font-size: .8rem; color: var(--text-muted);">Jam Pulang: ${req.jam_pulang}</div>` : ''}
          ${req.shift_baru ? `<div style="font-size: .8rem; color: var(--text-muted);">Shift Baru: ${req.shift_baru}</div>` : ''}
          
          <div style="display: flex; gap: 10px; margin-top: 12px;">
            <button onclick="approvePerbaikanRequest('${req.id}', true)" class="btn-success btn-sm" style="flex: 1;">
              <i class="fa fa-check"></i> Setujui
            </button>
            <button onclick="showRejectModal('${req.id}')" class="btn-danger btn-sm" style="flex: 1;">
              <i class="fa fa-times"></i> Tolak
            </button>
          </div>
        </div>
      `
    })

    el.innerHTML = html

  } catch (err) {
    el.innerHTML = `<div class="card"><p style="color: var(--danger);">Error: ${err.message}</p></div>`
  }
}

window.approvePerbaikanRequest = async function (id, approve) {
  try {
    const { error } = await supabase
      .from('perbaikan_absen')
      .update({ status: approve ? 'approved' : 'rejected' })
      .eq('id', id)

    if (error) throw error

    alert(approve ? '✅ Request disetujui' : '❌ Request ditolak')
    await loadApprovalRequest()

  } catch (err) {
    alert('Error: ' + err.message)
  }
}

window.showRejectModal = function (id) {
  const modal = document.createElement('div')
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  `

  const box = document.createElement('div')
  box.style.cssText = `
    background: white;
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  `

  box.innerHTML = `
    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 16px;">Tolak Request</h3>
    <textarea id="catatan" placeholder="Masukkan catatan penolakan..."
      style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
        font-size: .85rem; font-family: inherit; outline: none; min-height: 80px; margin-bottom: 16px; resize: vertical;"></textarea>
    <div style="display: flex; gap: 10px;">
      <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn-secondary" style="flex: 1;">Batal</button>
      <button onclick="confirmRejectPerbaikan('${id}', document.getElementById('catatan').value); this.parentElement.parentElement.parentElement.remove();" class="btn-danger" style="flex: 1;">Tolak</button>
    </div>
  `

  modal.appendChild(box)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove()
  })
  document.body.appendChild(modal)
}

window.confirmRejectPerbaikan = async function (id, catatan) {
  try {
    const { error } = await supabase
      .from('perbaikan_absen')
      .update({ status: 'rejected', catatan_approval: catatan })
      .eq('id', id)

    if (error) throw error

    alert('✅ Request ditolak')
    await loadApprovalRequest()

  } catch (err) {
    alert('Error: ' + err.message)
  }
}
