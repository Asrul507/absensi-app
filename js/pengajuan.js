import { supabase } from './supabase.js'
import { getTodayLokal } from './timezone.js'
import { logAuditEvent, fetchAuditTimeline } from './audit-trail.js'
import { isEligibleCuti, getSisaCuti, hitungMasaKerja, syncSisaCutiProfile } from './cuti.js'
import { showToast, setButtonLoading } from './feedback.js'

/* ===============================================================
   HITUNG TANGGAL SELESAI
   FIX: ganti toISOString() → toDateStr() agar tidak geser 1 hari
=============================================================== */
function hitungTanggalSelesai(startDate, hari) {
  if (!startDate || !hari) return null
  // Parse "YYYY-MM-DD" sebagai waktu lokal (bukan UTC)
  const [y, m, d] = startDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + (parseInt(hari) - 1))
  return toDateStr(date)  // FIX: was date.toISOString().split('T')[0]
}

export async function renderPengajuan(user) {
  const content = document.getElementById('content')
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  let query = supabase.from('pengajuan').select('*').order('created_at', { ascending: false })
  const { data: list, error } = await query
  if (error) {
    content.innerHTML = `<div class="card"><p class="text-danger">❌ Gagal load data</p></div>`
    return
  }

  const myList = isAdmin ? list : list.filter(i => i.user_id === user.id)

  const masaKerja = hitungMasaKerja(user.tanggal_bergabung)
  const eligible = isEligibleCuti(user.tanggal_bergabung)
  const { jatah, terpakai, sisa } = await getSisaCuti(user.id, user.tanggal_bergabung)

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-file-alt"></i> Pengajuan</h2>
    </div>

    ${!isAdmin ? `
    <div class="card fade-up" style="background:linear-gradient(135deg,#1e3a8a,#0891b2);color:#fff;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:.7rem;opacity:.75;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Status Cuti Anda</div>
          <div style="font-size:1rem;font-weight:800;">Masa Kerja: ${masaKerja} bulan</div>
          <div style="font-size:.85rem;opacity:.85;margin-top:2px;">
            ${!eligible ? '⚠ Belum eligible cuti (min. 6 bulan kerja)' : '✅ Eligible mengajukan cuti'}
          </div>
        </div>
        <div style="display:flex;gap:20px;text-align:center;">
          <div>
            <div style="font-size:1.8rem;font-weight:900;">${jatah}</div>
            <div style="font-size:.65rem;opacity:.75;text-transform:uppercase;">Jatah</div>
          </div>
          <div>
            <div style="font-size:1.8rem;font-weight:900;color:#fbbf24;">${terpakai}</div>
            <div style="font-size:.65rem;opacity:.75;text-transform:uppercase;">Terpakai</div>
          </div>
          <div>
            <div style="font-size:1.8rem;font-weight:900;color:${sisa < 0 ? '#f87171' : '#4ade80'};">${sisa}</div>
            <div style="font-size:.65rem;opacity:.75;text-transform:uppercase;">Sisa</div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    <div class="card fade-up-1">
      <h3 style="font-size:.9rem;font-weight:800;margin-bottom:16px;">
        <i class="fa fa-plus-circle" style="color:var(--primary);"></i> Buat Pengajuan Baru
      </h3>

      <div class="field">
        <label><i class="fa fa-tag"></i> Jenis Pengajuan</label>
        <select id="jenis" onchange="onJenisChange()">
          <option value="cuti">Cuti Tahunan</option>
          <option value="sakit">Sakit</option>
          <option value="izin">Izin</option>
        </select>
      </div>

      <div id="infoEligible" style="display:none;" class="alert warning">
        <i class="fa fa-exclamation-triangle"></i>
        <span id="infoEligibleMsg"></span>
      </div>

      <div class="field">
        <label><i class="fa fa-pen"></i> Alasan / Keterangan <span class="req">*</span></label>
        <textarea id="alasan" placeholder="Tuliskan alasan pengajuan..."></textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field">
          <label><i class="fa fa-calendar"></i> Tanggal Mulai <span class="req">*</span></label>
          <input type="date" id="tanggalMulai">
        </div>
        <div class="field">
          <label><i class="fa fa-hashtag"></i> Jumlah Hari <span class="req">*</span></label>
          <input type="number" id="jumlahHari" min="1" placeholder="1" oninput="updateTanggalSelesai()">
        </div>
      </div>

      <div class="field">
        <label><i class="fa fa-calendar-check"></i> Tanggal Selesai</label>
        <input type="date" id="tanggalSelesai" disabled style="background:var(--gray-100);">
      </div>

      <div class="field">
        <label><i class="fa fa-paperclip"></i> Upload Surat (opsional)</label>
        <input type="file" id="fileSurat" accept=".pdf,.jpg,.jpeg,.png">
      </div>

      <button id="btnSubmit" class="btn-primary w-full" style="margin-top:8px;">
        <i class="fa fa-paper-plane"></i> Ajukan Sekarang
      </button>
    </div>

    <div class="card fade-up-2">
      <h3 style="font-size:.9rem;font-weight:800;margin-bottom:16px;">
        <i class="fa fa-history" style="color:var(--primary);"></i>
        ${isAdmin ? 'Semua Pengajuan' : 'Riwayat Pengajuan Saya'}
      </h3>

      ${myList.length === 0 ? `<div class="empty-state"><i class="fa fa-inbox"></i><p>Belum ada pengajuan</p></div>`
        : myList.map(i => `
          <div class="pengajuan-card ${i.status === 'approved' ? 'approved' : i.status === 'rejected' ? 'rejected' : 'pending'}">
            <div class="pq-header">
              <div>
                <div class="pq-name">${i.nama || 'Unknown'}</div>
                <div class="pq-type">${labelJenis(i.jenis)} • ${i.jumlah_hari || '-'} hari</div>
              </div>
              <span class="badge ${i.status === 'approved' ? 'badge-green' : i.status === 'rejected' ? 'badge-red' : 'badge-yellow'}">
                ${i.status?.toUpperCase()}
              </span>
            </div>
            <div class="pq-ket">${i.alasan || '-'}</div>
            <div class="pq-date">
              📅 ${i.tanggal_mulai || '-'} s/d ${i.tanggal_selesai || '-'}
              &nbsp;·&nbsp; Diajukan: ${i.tanggal_pengajuan || '-'}
            </div>
            ${i.file ? `<a href="${i.file}" target="_blank" style="font-size:.8rem;color:var(--primary);"><i class="fa fa-paperclip"></i> Lihat Surat</a>` : ''}
            ${i.catatan_approval ? `
              <div style="margin-top: 12px; padding: 10px; background: #f3f4f6; border-left: 3px solid var(--primary); border-radius: 4px; font-size: .8rem;">
                <strong style="color: var(--text-muted);"><i class="fa fa-sticky-note" style="margin-right: 6px; color: #f59e0b;"></i>Catatan Admin:</strong>
                <div style="color: var(--text); margin-top: 4px;">${i.catatan_approval}</div>
              </div>
            ` : ''}
            <div style="margin-top:8px;"><button class="btn-secondary btn-sm" onclick="showPengajuanTimeline('${i.id}')"><i class="fa fa-clock-rotate-left"></i> Timeline</button></div>
            ${isAdmin && i.status === 'pending' ? `
              <div class="pq-actions">
                <button class="btn-primary btn-sm" onclick="showApprovalModal('${i.id}', 'approve')">
                  <i class="fa fa-check"></i> Approve
                </button>
                <button class="btn-danger btn-sm" onclick="showApprovalModal('${i.id}', 'reject')">
                  <i class="fa fa-times"></i> Tolak
                </button>
              </div>
            ` : ''}
          </div>
        `).join('')}
    </div>
  `

  window.onJenisChange = function() {
    const jenis = document.getElementById('jenis').value
    const infoEl = document.getElementById('infoEligible')
    const msgEl = document.getElementById('infoEligibleMsg')

    if (jenis === 'cuti') {
      if (!eligible) {
        infoEl.style.display = 'flex'
        infoEl.className = 'alert warning'
        msgEl.textContent = `Anda belum eligible cuti. Masa kerja ${masaKerja} bulan (min. 6 bulan).`
      } else if (masaKerja < 12) {
        infoEl.style.display = 'flex'
        infoEl.className = 'alert info'
        msgEl.textContent = `Anda eligible cuti izin (masa kerja 6-11 bulan). Jatah 12 hari/tahun didapat setelah 12 bulan kerja.`
      } else if (sisa <= 0) {
        infoEl.style.display = 'flex'
        infoEl.className = 'alert warning'
        msgEl.textContent = `Sisa cuti Anda ${sisa} hari. Pengajuan akan mencatat minus.`
      } else {
        infoEl.style.display = 'none'
      }
    } else {
      infoEl.style.display = 'none'
    }
  }

  window.onJenisChange()

  window.updateTanggalSelesai = function() {
    const mulai = document.getElementById('tanggalMulai').value
    const jumlah = document.getElementById('jumlahHari').value
    const selesai = hitungTanggalSelesai(mulai, jumlah)
    if (selesai) document.getElementById('tanggalSelesai').value = selesai
  }

  document.getElementById('tanggalMulai').addEventListener('change', window.updateTanggalSelesai)

  document.getElementById('btnSubmit').onclick = async () => {
    const jenis = document.getElementById('jenis').value
    const alasan = document.getElementById('alasan').value.trim()
    const jumlahHari = parseInt(document.getElementById('jumlahHari').value)
    const tanggalMulai = document.getElementById('tanggalMulai').value
    const file = document.getElementById('fileSurat').files[0]

    if (!alasan) { showToast('Alasan wajib diisi', 'warning'); return }
    if (!tanggalMulai) { showToast('Tanggal mulai wajib diisi', 'warning'); return }
    if (!jumlahHari || jumlahHari < 1) { showToast('Jumlah hari tidak valid', 'warning'); return }

    if (jenis === 'cuti' && !eligible) {
      showToast(`Belum eligible cuti. Masa kerja ${masaKerja} bulan (min. 6 bulan).`, 'warning')
      return
    }

    const btn = document.getElementById('btnSubmit')
    setButtonLoading(btn, true, '<i class="fa fa-spinner fa-spin"></i> Mengirim...')

    let fileUrl = null
    if (file) {
      const fileName = `${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('surat').upload(fileName, file)
      if (uploadError) { showToast('Upload surat gagal: ' + uploadError.message, 'error'); setButtonLoading(btn, false, '<i class="fa fa-paper-plane"></i> Ajukan Sekarang'); return }
      fileUrl = supabase.storage.from('surat').getPublicUrl(fileName).data.publicUrl
    }

    const tanggal_selesai = hitungTanggalSelesai(tanggalMulai, jumlahHari)

    const payload = {
      user_id: user.id,
      nama: user.nama_lengkap || user.email,
      jenis,
      alasan,
      file: fileUrl,
      status: 'pending',
      tanggal_pengajuan: getTodayLokal(),
      jumlah_hari: jumlahHari,
      tanggal_mulai: tanggalMulai,
      tanggal_selesai
    }

    const { data: insertedRows, error: insertError } = await supabase.from('pengajuan').insert([payload]).select('id').limit(1)

    setButtonLoading(btn, false, '<i class="fa fa-paper-plane"></i> Ajukan Sekarang')

    if (insertError) {
      console.error(insertError)
      showToast('Gagal kirim pengajuan: ' + insertError.message, 'error')
      return
    }

    await logAuditEvent({ action: 'create', entityType: 'pengajuan', entityId: insertedRows?.[0]?.id, after: payload })
    showToast('Pengajuan berhasil dikirim', 'success')
    renderPengajuan(user)
  }
}

function labelJenis(jenis) {
  if (jenis === 'cuti') return '<i class="fa fa-umbrella" style="color: #16a34a;"></i> Cuti'
  if (jenis === 'sakit') return '<i class="fa fa-heartbeat" style="color: #dc2626;"></i> Sakit'
  if (jenis === 'izin') return '<i class="fa fa-file-alt" style="color: #2563eb;"></i> Izin'
  return jenis || '-'
}

window.showApprovalModal = function(id, type) {
  const modal = document.createElement('div')
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center; z-index: 9999;
  `

  const box = document.createElement('div')
  box.style.cssText = `
    background: white; border-radius: 16px; padding: 24px; max-width: 450px; width: 90%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  `

  const title = type === 'approve' ? 'Setujui Pengajuan' : 'Tolak Pengajuan'
  const btnColor = type === 'approve' ? 'btn-primary' : 'btn-danger'
  const btnText = type === 'approve' ? 'Setujui' : 'Tolak'
  const placeholder = type === 'approve' ? 'Tambah catatan (opsional)...' : 'Alasan penolakan (wajib)...'

  box.innerHTML = `
    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 16px;">
      <i class="fa ${type === 'approve' ? 'fa-check-circle' : 'fa-times-circle'}" style="color: ${type === 'approve' ? '#16a34a' : '#dc2626'}; margin-right: 8px;"></i>${title}
    </h3>
    <textarea id="catatanApproval" placeholder="${placeholder}"
      style="width: 100%; padding: 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
        font-size: .85rem; font-family: inherit; outline: none; min-height: 100px; margin-bottom: 16px; resize: vertical;"></textarea>
    <div style="display: flex; gap: 10px;">
      <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn-secondary" style="flex: 1;">Batal</button>
      <button onclick="submitApprovalWithComment('${id}', '${type}', document.getElementById('catatanApproval').value); this.parentElement.parentElement.parentElement.remove();" class="${btnColor}" style="flex: 1;">
        ${btnText}
      </button>
    </div>
  `

  modal.appendChild(box)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove()
  })
  document.body.appendChild(modal)
}

/* ===============================================================
   APPROVE PENGAJUAN
   FIX UTAMA: Loop generate tanggal jadwal sekarang pakai toDateStr()
   agar tidak geser 1 hari akibat konversi UTC dari toISOString().

   Sebelumnya:
     const date = new Date(tanggal_mulai)   ← parse sebagai UTC jam 00:00
     const tgl = date.toISOString().split('T')[0]  ← balik ke UTC → geser!

   Sesudah:
     const [y,m,d] = tanggal_mulai.split('-').map(Number)
     const date = new Date(y, m-1, d)       ← parse sebagai waktu LOKAL
     const tgl = toDateStr(date)            ← format YYYY-MM-DD dari lokal
=============================================================== */
window.submitApprovalWithComment = async function(id, type, catatan) {
  if (type === 'reject' && !catatan.trim()) {
    showToast('Alasan penolakan wajib diisi', 'warning')
    return
  }

  try {
    if (type === 'approve') {
      const { data: pengajuan } = await supabase.from('pengajuan').select('*').eq('id', id).single()
      if (!pengajuan) return

      const { user_id, jenis, tanggal_mulai, jumlah_hari } = pengajuan

      const beforeState = { ...pengajuan }
      await supabase.from('pengajuan').update({
        status: 'approved',
        catatan_approval: catatan || null,
        approved_at: new Date().toISOString()
      }).eq('id', id)

      // ── FIX: Parse tanggal_mulai sebagai waktu lokal, bukan UTC ──────────
      const [y, m, d] = tanggal_mulai.split('-').map(Number)

      // Distribusikan override ke jadwal harian staff
      for (let i = 0; i < (jumlah_hari || 1); i++) {
        const date = new Date(y, m - 1, d)   // new Date(tahun, bulan-1, hari) = waktu LOKAL
        date.setDate(date.getDate() + i)
        const tgl = toDateStr(date)           // FIX: was date.toISOString().split('T')[0]

        console.log(`[APPROVAL] Insert jadwal override: ${tgl} - ${jenis}`)

        const { data: existing } = await supabase
          .from('jadwal')
          .select('id')
          .eq('user_id', user_id)
          .eq('tanggal', tgl)
          .maybeSingle()

        if (existing) {
          await supabase.from('jadwal')
            .update({ status_override: jenis, shift_id: null, pengajuan_id: id })
            .eq('id', existing.id)
        } else {
          await supabase.from('jadwal')
            .insert([{ user_id, tanggal: tgl, shift_id: null, status_override: jenis, pengajuan_id: id }])
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      // Jika jenisnya cuti, sinkronisasi sisa cuti
      if (jenis === 'cuti') {
        const { data: prof } = await supabase.from('profiles').select('tanggal_bergabung').eq('id', user_id).single()
        if (prof) {
          await syncSisaCutiProfile(user_id, prof.tanggal_bergabung)
        }
      }

      await logAuditEvent({
        action: 'approve',
        entityType: 'pengajuan',
        entityId: id,
        before: beforeState,
        after: { ...beforeState, status: 'approved', catatan_approval: catatan || null }
      })
      alert('✅ Pengajuan berhasil disetujui, jadwal harian & kuota jatah cuti karyawan diperbarui otomatis!')

    } else {
      const { data: beforeReject } = await supabase.from('pengajuan').select('*').eq('id', id).single()
      await supabase.from('pengajuan').update({
        status: 'rejected',
        catatan_approval: catatan,
        approved_at: new Date().toISOString()
      }).eq('id', id)

      await logAuditEvent({
        action: 'reject',
        entityType: 'pengajuan',
        entityId: id,
        before: beforeReject || null,
        after: { ...(beforeReject || {}), status: 'rejected', catatan_approval: catatan }
      })
      alert('❌ Pengajuan resmi ditolak')
    }

    renderPengajuan(window.currentUser)

  } catch (err) {
    showToast('Error: ' + err.message, 'error')
  }
}

window.approvePengajuan = function(id) {
  showApprovalModal(id, 'approve')
}

window.rejectPengajuan = function(id) {
  showApprovalModal(id, 'reject')
}

window.showPengajuanTimeline = async function(id) {
  try {
    const rows = await fetchAuditTimeline('pengajuan', id)
    if (!rows.length) return showToast('Belum ada audit trail untuk pengajuan ini', 'info')
    const text = rows.map(r => `• ${new Date(r.created_at).toLocaleString('id-ID')} | ${r.actor_name || '-'} (${r.actor_role || '-'}) → ${r.action}`).join('\n')
    console.log('Timeline Pengajuan\n\n' + text)
    showToast('Timeline ditampilkan di console browser', 'info')
  } catch (err) {
    showToast('Gagal memuat timeline: ' + err.message, 'error')
  }
}
