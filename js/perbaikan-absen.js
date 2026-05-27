/**
 * js/perbaikan-absen.js
 * ============================================================
 * FIX KRITIS: Sinkronisasi ke tabel `absensi` saat approval
 *
 * Sebelumnya fungsi confirmApprovePerbaikan() hanya mengubah
 * status di tabel `perbaikan_absen` dan mengupdate tabel `jadwal`
 * (untuk perubahan shift), tapi TIDAK menyentuh tabel `absensi`.
 * Akibatnya laporan rekap tetap menampilkan status lama.
 *
 * Perbaikan di fungsi confirmApprovePerbaikan():
 *   - Jenis `lupa_masuk`: cari baris di tabel absensi berdasarkan
 *     (nama + tanggal), update waktu_masuk dan status_absensi.
 *     Jika belum ada baris absensi di hari itu, INSERT baris baru.
 *   - Jenis `lupa_pulang`: update waktu_pulang dan status_absensi
 *     pada baris absensi yang sudah ada.
 *   - Jenis `perubahan_shift`: tetap seperti sebelumnya (update jadwal).
 * ============================================================
 */

import { supabase } from './supabase.js'
import { buildTimestampLokal, toJamLokal } from './timezone.js'
import { showToast } from './feedback.js'

export async function renderPerbaikanAbsen(user) {
  const content = document.getElementById('content')
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-pencil-alt"></i> Perbaikan Absen</h2>
    </div>

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

    <div id="tabBuatContent" class="fade-up">
      <div class="card" style="padding: 20px;">
        <h3 style="font-weight: 800; margin-bottom: 16px;">Buat Request Perbaikan Absen</h3>

        <div class="field">
          <label>Tanggal <span style="color: var(--danger);">*</span></label>
          <input type="date" id="inputTanggal" onchange="loadJadwalForDate(window.currentUser)"
            style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
              font-size: .85rem; font-family: inherit; outline: none;">
          <div id="infoShiftHariIni" style="font-size: .75rem; color: var(--primary); margin-top: 4px; font-weight: 700;"></div>
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

        <div id="formPerubahanShift" style="display: none;">
          <div class="field">
            <label>Shift Baru <span style="color: var(--danger);">*</span></label>
            <select id="inputShiftBaru"
              style="width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                font-size: .85rem; font-family: inherit; outline: none;">
              <option value="">-- Pilih Shift --</option>
              <option value="2" id="optShiftPagi">Shift Pagi (07:00 - 15:00)</option>
              <option value="3" id="optShiftSore">Shift Sore (15:00 - 23:00)</option>
              <option value="4" id="optShiftMalam">Shift Malam (23:00 - 07:00)</option>
              <option value="8" id="optShiftOff">OFF</option>
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

    <div id="tabDaftarContent" style="display: none;" class="fade-up">
      <div id="daftarRequestList" class="card" style="text-align: center; padding: 28px;">
        <i class="fa fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
        <p style="color: var(--text-muted); margin-top: 8px; font-size: .85rem;">Memuat data...</p>
      </div>
    </div>

    ${isAdmin ? `
      <div id="tabApprovalContent" style="display: none;" class="fade-up">
        <div id="approvalRequestList" class="card" style="text-align: center; padding: 28px;">
          <i class="fa fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
          <p style="color: var(--text-muted); margin-top: 8px; font-size: .85rem;">Memuat data...</p>
        </div>
      </div>
    ` : ''}
  `

  window._currentPerbaikanUser     = user
  window._isAdminPerbaikan         = user.role === 'admin' || user.role === 'super_admin'
  window._currentShiftCodeHariIni  = null

  await loadDaftarRequest(user)
  if (window._isAdminPerbaikan) {
    await loadApprovalRequest()
  }
}

window.updatePerbaikanForm = function () {
  const jenis = document.getElementById('inputJenis').value

  document.getElementById('formJamShouldBe').style.display      = (jenis === 'lupa_masuk' || jenis === 'lupa_pulang') ? 'block' : 'none'
  document.getElementById('formPerubahanShift').style.display   = jenis === 'perubahan_shift' ? 'block' : 'none'

  if (jenis === 'perubahan_shift' && window._currentShiftCodeHariIni) {
    const code = String(window._currentShiftCodeHariIni)
    document.getElementById('optShiftPagi').style.display  = (code === '2') ? 'none' : 'block'
    document.getElementById('optShiftSore').style.display  = (code === '3') ? 'none' : 'block'
    document.getElementById('optShiftMalam').style.display = (code === '4') ? 'none' : 'block'
    document.getElementById('optShiftOff').style.display   = (code === '8') ? 'none' : 'block'
  } else {
    document.getElementById('optShiftPagi').style.display  = 'block'
    document.getElementById('optShiftSore').style.display  = 'block'
    document.getElementById('optShiftMalam').style.display = 'block'
    document.getElementById('optShiftOff').style.display   = 'block'
  }
}

window.loadJadwalForDate = async function (user) {
  const tanggal = document.getElementById('inputTanggal').value
  const infoEl  = document.getElementById('infoShiftHariIni')
  if (!tanggal || !infoEl) return

  try {
    const { data: jadwal } = await supabase
      .from('jadwal')
      .select('shift_code')
      .eq('user_id', user.id)
      .eq('tanggal', tanggal)
      .maybeSingle()

    window._currentShiftCodeHariIni = jadwal?.shift_code || '2'

    const textMap = {
      '2': 'Shift Pagi (07:00 - 15:00)',
      '3': 'Shift Sore (15:00 - 23:00)',
      '4': 'Shift Malam (23:00 - 07:00)',
      '8': 'OFF / Libur'
    }
    infoEl.textContent = `Jadwal Anda saat ini di tanggal tersebut: ${textMap[window._currentShiftCodeHariIni] || 'Regular Pagi'}`

    const shiftMap = {
      '2': { jam_masuk: '07:00', jam_pulang: '15:00' },
      '3': { jam_masuk: '15:00', jam_pulang: '23:00' },
      '4': { jam_masuk: '23:00', jam_pulang: '07:00' },
      '8': { jam_masuk: '00:00', jam_pulang: '00:00' }
    }
    const shiftData = shiftMap[window._currentShiftCodeHariIni] || { jam_masuk: '07:00', jam_pulang: '15:00' }

    document.getElementById('inputJamMasukShouldBe').value  = shiftData.jam_masuk
    document.getElementById('inputJamPulangShouldBe').value = shiftData.jam_pulang

    updatePerbaikanForm()

  } catch (err) {
    console.error('Error load jadwal:', err)
  }
}

window.switchPerbaikanTab = async function (tab) {
  document.getElementById('tabBuat').className   = tab === 'buat'   ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  document.getElementById('tabDaftar').className = tab === 'daftar' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'

  if (document.getElementById('tabApproval')) {
    document.getElementById('tabApproval').className = tab === 'approval' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  }

  document.getElementById('tabBuatContent').style.display   = tab === 'buat'   ? 'block' : 'none'
  document.getElementById('tabDaftarContent').style.display = tab === 'daftar' ? 'block' : 'none'

  if (document.getElementById('tabApprovalContent')) {
    document.getElementById('tabApprovalContent').style.display = tab === 'approval' ? 'block' : 'none'
    if (tab === 'approval') await loadApprovalRequest()
  }

  if (tab === 'daftar') await loadDaftarRequest(window._currentPerbaikanUser)
}

window.submitPerbaikanAbsen = async function (user) {
  const tanggal     = document.getElementById('inputTanggal').value
  const jenis       = document.getElementById('inputJenis').value
  const keterangan  = document.getElementById('inputKeterangan').value
  const msgEl       = document.getElementById('msgStatusBuat')
  const btn         = event.target

  msgEl.textContent = ''

  if (!tanggal)          { msgEl.style.color = '#dc2626'; msgEl.textContent = '⚠ Tanggal wajib diisi'; return }
  if (!jenis)            { msgEl.style.color = '#dc2626'; msgEl.textContent = '⚠ Jenis perbaikan wajib dipilih'; return }
  if (!keterangan.trim()){ msgEl.style.color = '#dc2626'; msgEl.textContent = '⚠ Keterangan wajib diisi'; return }

  let payload = {
    user_id:    user.id,
    nama:       user.nama_lengkap,
    tanggal,
    jenis,
    keterangan,
    status:     'pending',
    created_at: new Date().toISOString()
  }

  if (jenis === 'lupa_masuk' || jenis === 'lupa_pulang') {
    payload.jam_masuk  = document.getElementById('inputJamMasukActual').value  || null
    payload.jam_pulang = document.getElementById('inputJamPulangActual').value || null
  } else if (jenis === 'perubahan_shift') {
    const shiftVal = document.getElementById('inputShiftBaru').value
    if (!shiftVal) { msgEl.style.color = '#dc2626'; msgEl.textContent = '⚠ Silakan tentukan pilihan shift baru Anda'; return }
    payload.shift_baru = shiftVal
  }

  btn.disabled   = true
  btn.innerHTML  = '<i class="fa fa-spinner fa-spin"></i> Mengirim...'

  try {
    const { data: insertedRows, error } = await supabase.from('perbaikan_absen').insert([payload]).select('id').limit(1)
    if (error) throw error

    await logAuditEvent({ action: 'create', entityType: 'perbaikan_absen', entityId: insertedRows?.[0]?.id, after: payload })
    msgEl.style.color = '#16a34a'
    msgEl.textContent = '✅ Request berhasil dikirim'

    setTimeout(() => {
      document.getElementById('inputTanggal').value        = ''
      document.getElementById('inputJenis').value          = ''
      document.getElementById('inputJamMasukActual').value = ''
      document.getElementById('inputJamPulangActual').value= ''
      document.getElementById('inputShiftBaru').value      = ''
      document.getElementById('inputKeterangan').value     = ''
      if (document.getElementById('infoShiftHariIni'))
        document.getElementById('infoShiftHariIni').textContent = ''
      updatePerbaikanForm()
    }, 1500)

  } catch (err) {
    msgEl.style.color = '#dc2626'
    msgEl.textContent = '❌ Error: ' + err.message
  } finally {
    btn.disabled  = false
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

    const shiftLabelMap = { '2': 'Shift Pagi', '3': 'Shift Sore', '4': 'Shift Malam', '8': 'OFF' }

    el.innerHTML = data.map(req => {
      const statusColor     = req.status === 'approved' ? '#dcfce7' : req.status === 'rejected' ? '#fee2e2' : '#fef3c7'
      const statusTextColor = req.status === 'approved' ? '#166534' : req.status === 'rejected' ? '#991b1b' : '#92400e'
      const statusText      = req.status === 'approved' ? 'Disetujui' : req.status === 'rejected' ? 'Ditolak' : 'Menunggu'

      return `
        <div class="card" style="padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <div style="font-weight: 800; font-size: .95rem;">${req.tanggal}</div>
              <div style="font-size: .75rem; color: var(--text-muted); margin-top: 3px;">
                ${req.jenis.replace('_', ' ').toUpperCase()}
              </div>
            </div>
            <span style="padding: 4px 10px; border-radius: 20px; font-size: .7rem; font-weight: 700; background: ${statusColor}; color: ${statusTextColor};">
              ${statusText}
            </span>
          </div>
          <div style="padding: 12px 0; border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200); margin: 12px 0; font-size: .85rem;">
            <strong>Alasan:</strong> ${req.keterangan}
          </div>
          ${req.jam_masuk  ? `<div style="font-size: .8rem; color: var(--text-muted);">Jam Masuk: ${req.jam_masuk}</div>`  : ''}
          ${req.jam_pulang ? `<div style="font-size: .8rem; color: var(--text-muted);">Jam Pulang: ${req.jam_pulang}</div>` : ''}
          ${req.shift_baru ? `<div style="font-size: .8rem; color: var(--text-muted);">Request Shift Baru: ${shiftLabelMap[req.shift_baru] || req.shift_baru}</div>` : ''}
          ${req.catatan_approval ? `
            <div style="margin-top: 10px; padding: 10px; background: #f3f4f6; border-left: 3px solid var(--primary); border-radius: 4px; font-size: .8rem;">
              <strong style="color: var(--text-muted);"><i class="fa fa-sticky-note" style="margin-right: 6px; color: #f59e0b;"></i>Catatan:</strong>
              <div style="color: var(--text); margin-top: 4px;">${req.catatan_approval}</div>
            </div>
          ` : ''}
        </div>
      `
    }).join('')

  } catch (err) {
    el.innerHTML = `<div class="card"><p style="color: var(--danger);">Error: ${err.message}</p></div>`
  }
}

async function loadApprovalRequest() {
  const el = document.getElementById('approvalRequestList')
  if (!el) return

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

    const shiftLabelMap = { '2': 'Shift Pagi', '3': 'Shift Sore', '4': 'Shift Malam', '8': 'OFF' }

    el.innerHTML = data.map(req => `
      <div class="card" style="padding: 16px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <div style="font-weight: 800; font-size: .95rem;">${req.nama}</div>
            <div style="font-size: .75rem; color: var(--text-muted); margin-top: 3px;">
              ${req.tanggal} • ${req.jenis.replace('_', ' ').toUpperCase()}
            </div>
          </div>
          <span style="padding: 4px 10px; border-radius: 20px; font-size: .7rem; font-weight: 700; background: #fef3c7; color: #92400e;">
            Menunggu
          </span>
        </div>
        <div style="padding: 12px 0; border-top: 1px solid var(--gray-200); border-bottom: 1px solid var(--gray-200); margin: 12px 0; font-size: .85rem;">
          <strong>Alasan:</strong> ${req.keterangan}
        </div>
        ${req.jam_masuk  ? `<div style="font-size: .8rem; color: var(--text-muted);">Jam Masuk: ${req.jam_masuk}</div>`  : ''}
        ${req.jam_pulang ? `<div style="font-size: .8rem; color: var(--text-muted);">Jam Pulang: ${req.jam_pulang}</div>` : ''}
        ${req.shift_baru ? `<div style="font-size: .8rem; color: var(--text-muted);">Request Shift Baru: ${shiftLabelMap[req.shift_baru] || req.shift_baru}</div>` : ''}
        <div style="display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap;">
          <button onclick="showPerbaikanTimeline('${req.id}')" class="btn-secondary btn-sm" style="flex: 1;">
            <i class="fa fa-clock-rotate-left"></i> Timeline
          </button>
          <button onclick="showApprovePerbaikanModal('${req.id}')" class="btn-success btn-sm" style="flex: 1;">
            <i class="fa fa-check"></i> Setujui
          </button>
          <button onclick="showRejectModal('${req.id}')" class="btn-danger btn-sm" style="flex: 1;">
            <i class="fa fa-times"></i> Tolak
          </button>
        </div>
      </div>
    `).join('')

  } catch (err) {
    if (!el) return
    el.innerHTML = `<div class="card"><p style="color: var(--danger);">Error: ${err.message}</p></div>`
  }
}

window.showApprovePerbaikanModal = function (id) {
  const modal = document.createElement('div')
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center; z-index: 9999;
  `

  const box = document.createElement('div')
  box.style.cssText = `
    background: white; border-radius: 16px; padding: 24px;
    max-width: 450px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  `

  box.innerHTML = `
    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 16px;">
      <i class="fa fa-check-circle" style="color: #16a34a; margin-right: 8px;"></i>Setujui Request
    </h3>
    <textarea id="catatanPerbaikan" placeholder="Tambah catatan (opsional)..."
      style="width: 100%; padding: 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
        font-size: .85rem; font-family: inherit; outline: none; min-height: 100px; margin-bottom: 16px; resize: vertical;"></textarea>
    <div style="display: flex; gap: 10px;">
      <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn-secondary" style="flex: 1;">Batal</button>
      <button onclick="confirmApprovePerbaikan('${id}', document.getElementById('catatanPerbaikan').value); this.parentElement.parentElement.parentElement.remove();" class="btn-success" style="flex: 1;">Setujui</button>
    </div>
  `

  modal.appendChild(box)
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
  document.body.appendChild(modal)
}

/* ============================================================
   FUNGSI UTAMA — APPROVE PERBAIKAN ABSEN
   FIX: Setelah disetujui, sistem sekarang juga langsung
   mengupdate tabel `absensi` agar rekap laporan sinkron.

   Alur untuk lupa_masuk:
     1. Cari baris absensi di tanggal tersebut (by nama + tanggal)
     2a. Jika SUDAH ADA → update waktu_masuk, status_absensi = 'approved manual'
     2b. Jika BELUM ADA → INSERT baris baru dengan waktu_masuk

   Alur untuk lupa_pulang:
     1. Cari baris absensi di tanggal tersebut
     2. Update waktu_pulang, status_absensi = 'complete'

   Format waktu: jam dari request (HH:MM) digabung dengan
   tanggal absensi menjadi ISO string dengan offset dari titik radius
   agar tersimpan dalam format timestamp yang benar di Supabase.
   ============================================================ */
window.confirmApprovePerbaikan = async function (id, catatan) {
  try {
    // 1. Ambil detail request
    const { data: req, error: fetchErr } = await supabase
      .from('perbaikan_absen')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !req) throw new Error('Data request perbaikan tidak ditemukan.')

    // 2. Tandai request sebagai approved
    const beforeState = { ...req }
    const { error: approveErr } = await supabase
      .from('perbaikan_absen')
      .update({
        status:            'approved',
        catatan_approval:  catatan || null,
        approved_at:       new Date().toISOString()
      })
      .eq('id', id)

    if (approveErr) throw approveErr

    // ── CABANG: LUPA MASUK ──────────────────────────────────────────────────
    if (req.jenis === 'lupa_masuk' && req.jam_masuk) {
      // Konversi "HH:MM" + tanggal → ISO timestamp (asumsi WIB UTC+7)
      const waktuMasukISO = buildTimestampLokal(req.tanggal, req.jam_masuk)

      // Cek apakah baris absensi hari itu sudah ada
      const { data: existingAbsen } = await supabase
        .from('absensi')
        .select('id, waktu_pulang')
        .eq('nama', req.nama)
        .eq('tanggal', req.tanggal)
        .maybeSingle()

      if (existingAbsen) {
        // Sudah ada baris → update waktu_masuk dan status
        const { error: updErr } = await supabase
          .from('absensi')
          .update({
            waktu_masuk:     waktuMasukISO,
            status_absensi:  existingAbsen.waktu_pulang ? 'complete' : 'approved manual',
            status_masuk:    'Manual'
          })
          .eq('id', existingAbsen.id)

        if (updErr) throw new Error('Gagal update waktu_masuk di absensi: ' + updErr.message)

      } else {
        // Belum ada baris → buat baris baru
        const { error: insErr } = await supabase
          .from('absensi')
          .insert([{
            nama:           req.nama,
            tanggal:        req.tanggal,
            waktu_masuk:    waktuMasukISO,
            status_absensi: 'approved manual',
            status_masuk:   'Manual'
          }])

        if (insErr) throw new Error('Gagal insert absensi baru: ' + insErr.message)
      }
    }

    // ── CABANG: LUPA PULANG ─────────────────────────────────────────────────
    if (req.jenis === 'lupa_pulang' && req.jam_pulang) {
      const waktuPulangISO = buildTimestampLokal(req.tanggal, req.jam_pulang)

      // Cari baris absensi yang sudah ada (harus ada karena sudah masuk)
      const { data: existingAbsen } = await supabase
        .from('absensi')
        .select('id')
        .eq('nama', req.nama)
        .eq('tanggal', req.tanggal)
        .maybeSingle()

      if (existingAbsen) {
        const { error: updErr } = await supabase
          .from('absensi')
          .update({
            waktu_pulang:   waktuPulangISO,
            status_absensi: 'complete',
            status_pulang:  'Manual'
          })
          .eq('id', existingAbsen.id)

        if (updErr) throw new Error('Gagal update waktu_pulang di absensi: ' + updErr.message)

      } else {
        // Edge case: tidak ada baris masuk sama sekali, buat sekalian
        const { error: insErr } = await supabase
          .from('absensi')
          .insert([{
            nama:           req.nama,
            tanggal:        req.tanggal,
            waktu_pulang:   waktuPulangISO,
            status_absensi: 'approved manual',
            status_pulang:  'Manual'
          }])

        if (insErr) throw new Error('Gagal insert absensi baru (pulang): ' + insErr.message)
      }
    }

    // ── CABANG: PERUBAHAN SHIFT ─────────────────────────────────────────────
    if (req.jenis === 'perubahan_shift' && req.shift_baru) {
      const { data: existingJadwal } = await supabase
        .from('jadwal')
        .select('id')
        .eq('user_id', req.user_id)
        .eq('tanggal', req.tanggal)
        .maybeSingle()

      if (existingJadwal) {
        await supabase
          .from('jadwal')
          .update({ shift_code: req.shift_baru, status_override: null })
          .eq('id', existingJadwal.id)
      } else {
        await supabase
          .from('jadwal')
          .insert([{ user_id: req.user_id, tanggal: req.tanggal, shift_code: req.shift_baru }])
      }
    }

    await logAuditEvent({ action: 'approve', entityType: 'perbaikan_absen', entityId: id, before: beforeState, after: { ...beforeState, status: 'approved', catatan_approval: catatan || null } })
    showToast('Request berhasil disetujui dan data absensi diperbarui', 'success')
    await loadApprovalRequest()

  } catch (err) {
    console.error('confirmApprovePerbaikan error:', err)
    showToast('Error saat memproses approval: ' + err.message, 'error')
  }
}

window.showRejectModal = function (id) {
  const modal = document.createElement('div')
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center; z-index: 9999;
  `

  const box = document.createElement('div')
  box.style.cssText = `
    background: white; border-radius: 16px; padding: 24px;
    max-width: 450px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  `

  box.innerHTML = `
    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 16px;">
      <i class="fa fa-times-circle" style="color: #dc2626; margin-right: 8px;"></i>Tolak Request
    </h3>
    <textarea id="catatan" placeholder="Alasan penolakan (wajib)..."
      style="width: 100%; padding: 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
        font-size: .85rem; font-family: inherit; outline: none; min-height: 100px; margin-bottom: 16px; resize: vertical;"></textarea>
    <div style="display: flex; gap: 10px;">
      <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn-secondary" style="flex: 1;">Batal</button>
      <button onclick="confirmRejectPerbaikan('${id}', document.getElementById('catatan').value); this.parentElement.parentElement.parentElement.remove();" class="btn-danger" style="flex: 1;">Tolak</button>
    </div>
  `

  modal.appendChild(box)
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
  document.body.appendChild(modal)
}

window.confirmRejectPerbaikan = async function (id, catatan) {
  if (!catatan.trim()) { showToast('Alasan penolakan wajib diisi', 'warning'); return }

  try {
    const { data: beforeReject } = await supabase.from('perbaikan_absen').select('*').eq('id', id).single()
    const { error } = await supabase
      .from('perbaikan_absen')
      .update({
        status:           'rejected',
        catatan_approval: catatan,
        approved_at:      new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    await logAuditEvent({ action: 'reject', entityType: 'perbaikan_absen', entityId: id, before: beforeReject || null, after: { ...(beforeReject || {}), status: 'rejected', catatan_approval: catatan } })
    showToast('Request ditolak', 'success')
    await loadApprovalRequest()

  } catch (err) {
    showToast('Error: ' + err.message, 'error')
  }
}


window.showPerbaikanTimeline = async function(id) {
  try {
    const rows = await fetchAuditTimeline('perbaikan_absen', id)
    if (!rows.length) return showToast('Belum ada audit trail untuk request ini', 'info')
    const text = rows.map(r => `• ${new Date(r.created_at).toLocaleString('id-ID')} | ${r.actor_name || '-'} (${r.actor_role || '-'}) → ${r.action}`).join('\n')
    console.log('Timeline Perbaikan Absen\n\n' + text)
    showToast('Timeline ditampilkan di console browser', 'info')
  } catch (err) {
    showToast('Gagal memuat timeline: ' + err.message, 'error')
  }
}
