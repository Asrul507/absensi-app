import { supabase } from './supabase.js'
import {
  getTodayLokal,
  getCurrentMonthStartLocal,
  getNextMonthEndLocal,
  toTanggalLokal,
  toTanggalJamLokal,
  validateLeaveDateRangeLocal
} from './timezone.js?v=20260609-2'
import { logAuditEvent, fetchAuditTimeline } from './audit-trail.js'
import {
  STATUS_CUTI_TAHUNAN,
  PROFILE_CUTI_SELECT,
  approveJatahCutiTahunan,
  canManageCutiTahunan,
  deductCutiTahunanOnApproval,
  ensureTidakAdaPengajuanBentrok,
  extendCutiTahunan,
  formatMasaKerja,
  getOrCreateCutiTahunan,
  getSisaCuti,
  hitungMasaKerja,
  hitungTanggalSelesai,
  prosesHangusCutiTahunan,
  syncEligibleCutiTahunanForProfiles,
  toDateStr,
  validatePengajuanRequest,
  validateRentangPengajuan
} from './services/leave-service.js'
import { showToast, setButtonLoading } from './feedback.js'


export async function renderPengajuan(user) {
  const content = document.getElementById('content')
  const isAdmin = canManageCutiTahunan(user)

  let query = supabase.from('pengajuan').select('*').order('created_at', { ascending: false })
  if (!isAdmin) query = query.eq('user_id', user.id)
  const { data: list, error } = await query
  if (error) {
    content.innerHTML = `<div class="card"><p class="text-danger">❌ Gagal load data</p></div>`
    return
  }

  const myList = list || []

  const masaKerja = hitungMasaKerja(user.tanggal_bergabung)
  let saldoCuti = { jatah: 0, terpakai: 0, sisa: 0, status: STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE, periode_mulai: null, periode_selesai: null }
  try {
    saldoCuti = await getSisaCuti(user.id, user.tanggal_bergabung)
  } catch (err) {
    console.error('Gagal memuat saldo cuti tahunan:', err)
    showToast('Gagal memuat saldo cuti tahunan. Pastikan migration Cuti Tahunan V1 sudah dijalankan.', 'warning')
  }
  const { jatah, terpakai, sisa, status: statusCutiTahunan, periode_mulai, periode_selesai } = saldoCuti
  const eligible = statusCutiTahunan === STATUS_CUTI_TAHUNAN.AKTIF
  let adminCutiTahunanRows = []
  if (isAdmin) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select(PROFILE_CUTI_SELECT)
      .order('nama_lengkap')
    if (!profilesError) {
      try {
        adminCutiTahunanRows = await syncEligibleCutiTahunanForProfiles(profiles || [])
      } catch (err) {
        console.error('Gagal memuat cuti tahunan:', err)
        showToast('Gagal memuat cuti tahunan. Pastikan migration Cuti Tahunan V1 sudah dijalankan.', 'warning')
      }
    }
  }

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-file-alt"></i> Pengajuan</h2>
    </div>

    ${!isAdmin ? `
    <div class="card fade-up" style="background:linear-gradient(135deg,#1e3a8a,#0891b2);color:#fff;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:.7rem;opacity:.75;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Status Cuti Anda</div>
          <div style="font-size:1rem;font-weight:800;">Status: ${statusCutiTahunan || STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE}</div>
          <div style="font-size:.85rem;opacity:.85;margin-top:2px;">
            Masa kerja ${formatMasaKerja(masaKerja)} · Periode ${periode_mulai || '-'} s/d ${periode_selesai || '-'}
          </div>
          <div style="font-size:.8rem;opacity:.82;margin-top:2px;">
            ${statusCutiTahunan === STATUS_CUTI_TAHUNAN.AKTIF ? '✅ Jatah cuti aktif dan bisa diajukan' : statusCutiTahunan === STATUS_CUTI_TAHUNAN.TIDAK_ELIGIBLE ? '⚠ Jenis kontrak ini tidak mendapatkan cuti tahunan.' : `⏳ Anda belum eligible. Masa kerja ${formatMasaKerja(masaKerja)}.`}
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

    ${isAdmin ? renderCutiTahunanAdminSection(adminCutiTahunanRows) : ''}

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
          <input type="date" id="tanggalMulai" min="${getCurrentMonthStartLocal()}" max="${getNextMonthEndLocal()}">
        </div>
        <div class="field">
          <label><i class="fa fa-hashtag"></i> Jumlah Hari <span class="req">*</span></label>
          <input type="number" id="jumlahHari" min="1" placeholder="1" oninput="updateTanggalSelesai()">
        </div>
      </div>

      <div class="field">
        <label><i class="fa fa-calendar-check"></i> Tanggal Selesai</label>
        <input type="date" id="tanggalSelesai" min="${getCurrentMonthStartLocal()}" max="${getNextMonthEndLocal()}" disabled style="background:var(--gray-100);">
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
      if (statusCutiTahunan !== STATUS_CUTI_TAHUNAN.AKTIF) {
        infoEl.style.display = 'flex'
        infoEl.className = 'alert warning'
        msgEl.textContent = statusCutiTahunan === STATUS_CUTI_TAHUNAN.TIDAK_ELIGIBLE
          ? 'Jenis kontrak ini tidak mendapatkan cuti tahunan.'
          : statusCutiTahunan === STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR
            ? 'Anda sudah eligible, tetapi jatah cuti tahunan masih menunggu approval HR/admin.'
            : `Anda belum memiliki kontrak aktif/periode cuti aktif. Masa kerja ${formatMasaKerja(masaKerja)}.`
      } else if (sisa <= 0) {
        infoEl.style.display = 'flex'
        infoEl.className = 'alert warning'
        msgEl.textContent = `Sisa cuti Anda ${sisa} hari. Pengajuan cuti tidak bisa dikirim.`
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
    const selesaiEl = document.getElementById('tanggalSelesai')
    if (selesai) selesaiEl.value = selesai
    else if (selesaiEl) selesaiEl.value = ''

    if (mulai && selesai) {
      try {
        validateLeaveDateRangeLocal(mulai, selesai)
      } catch (err) {
        showToast(err.message, 'warning')
      }
    }
  }

  document.getElementById('tanggalMulai').addEventListener('change', window.updateTanggalSelesai)

  document.getElementById('btnSubmit').onclick = async () => {
    const jenis = document.getElementById('jenis').value
    const alasan = document.getElementById('alasan').value.trim()
    const jumlahHariInput = document.getElementById('jumlahHari').value
    const tanggalMulaiInput = document.getElementById('tanggalMulai').value
    const file = document.getElementById('fileSurat').files[0]

    if (!alasan) { showToast('Alasan wajib diisi', 'warning'); return }

    let rentang
    try {
      rentang = await validatePengajuanRequest({ userId: user.id, jenis, tanggalMulai: tanggalMulaiInput, jumlahHari: jumlahHariInput })
    } catch (err) {
      showToast(err.message, 'warning')
      return
    }

    const jumlahHari = rentang.jumlahHari
    const tanggalMulai = rentang.tanggalMulai


    const btn = document.getElementById('btnSubmit')
    setButtonLoading(btn, true, '<i class="fa fa-spinner fa-spin"></i> Mengirim...')

    let fileUrl = null
    if (file) {
      const fileName = `${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('surat').upload(fileName, file)
      if (uploadError) { showToast('Upload surat gagal: ' + uploadError.message, 'error'); setButtonLoading(btn, false, '<i class="fa fa-paper-plane"></i> Ajukan Sekarang'); return }
      fileUrl = supabase.storage.from('surat').getPublicUrl(fileName).data.publicUrl
    }

    const tanggal_selesai = rentang.tanggalSelesai

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


function renderCutiTahunanAdminSection(rows) {
  const today = getTodayLokal()
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {})

  const renderRows = (status) => rows
    .filter(row => row.status === status)
    .map(row => {
      const isExpired = row.periode_selesai && row.periode_selesai < today && row.status === STATUS_CUTI_TAHUNAN.AKTIF
      return `
        <div style="display:grid;grid-template-columns:minmax(150px,1.4fr) repeat(4,minmax(70px,.6fr)) minmax(160px,1fr);gap:8px;align-items:center;padding:10px;border-bottom:1px solid var(--border);">
          <div><strong>${row.nama || '-'}</strong><div style="color:var(--text-muted);font-size:.72rem;">${row.periode_mulai || '-'} s/d ${row.periode_selesai || '-'}</div></div>
          <div>${row.jatah_cuti || 0}</div>
          <div>${row.cuti_terpakai || 0}</div>
          <div>${row.sisa_cuti || 0}</div>
          <div><span class="badge ${row.status === STATUS_CUTI_TAHUNAN.AKTIF ? 'badge-green' : [STATUS_CUTI_TAHUNAN.HANGUS, STATUS_CUTI_TAHUNAN.EXPIRED_KONTRAK, STATUS_CUTI_TAHUNAN.TIDAK_ELIGIBLE].includes(row.status) ? 'badge-red' : 'badge-yellow'}">${row.status}</span></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${row.status === STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR ? `<button class="btn-primary btn-sm" onclick="approveJatahCutiTahunanUI('${row.id}')"><i class="fa fa-check"></i> Approve</button>` : ''}
            ${isExpired ? `<button class="btn-danger btn-sm" onclick="prosesHangusCutiTahunanUI('${row.id}')"><i class="fa fa-ban"></i> Proses Hangus</button>` : ''}
            ${row.status === STATUS_CUTI_TAHUNAN.AKTIF && !isExpired ? `<button class="btn-secondary btn-sm" onclick="showExtendCutiModal('${row.id}')"><i class="fa fa-calendar-plus"></i> Extend</button>` : ''}
            ${[STATUS_CUTI_TAHUNAN.HANGUS, STATUS_CUTI_TAHUNAN.EXPIRED_KONTRAK].includes(row.status) ? `<button class="btn-secondary btn-sm" onclick="showExtendCutiModal('${row.id}')"><i class="fa fa-calendar-plus"></i> Extend</button>` : ''}
            ${row.approved_at ? `<span style="color:var(--text-muted);font-size:.72rem;">Approve: ${toTanggalLokal(row.approved_at)}</span>` : ''}
            ${row.expired_at ? `<span style="color:var(--danger);font-size:.72rem;">Hangus: ${row.sisa_cuti_hangus || 0} hari</span>` : ''}
          </div>
        </div>
      `
    }).join('') || `<div style="padding:12px;color:var(--text-muted);font-size:.82rem;">Tidak ada data.</div>`

  return `
    <div class="card fade-up" style="margin-bottom:16px;">
      <h3 style="font-size:.95rem;font-weight:900;margin-bottom:12px;"><i class="fa fa-umbrella-beach" style="color:var(--primary);"></i> Cuti Tahunan</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:14px;">
        <div class="card" style="padding:10px;background:#f8fafc;"><div style="font-size:.7rem;color:var(--text-muted);font-weight:800;">Belum eligible</div><strong>${counts[STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE] || 0}</strong></div>
        <div class="card" style="padding:10px;background:#fffbeb;"><div style="font-size:.7rem;color:var(--text-muted);font-weight:800;">Menunggu approval</div><strong>${counts[STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR] || 0}</strong></div>
        <div class="card" style="padding:10px;background:#fef2f2;"><div style="font-size:.7rem;color:var(--text-muted);font-weight:800;">Tidak eligible</div><strong>${counts[STATUS_CUTI_TAHUNAN.TIDAK_ELIGIBLE] || 0}</strong></div>
        <div class="card" style="padding:10px;background:#f0fdf4;"><div style="font-size:.7rem;color:var(--text-muted);font-weight:800;">Aktif</div><strong>${counts[STATUS_CUTI_TAHUNAN.AKTIF] || 0}</strong></div>
        <div class="card" style="padding:10px;background:#fef2f2;"><div style="font-size:.7rem;color:var(--text-muted);font-weight:800;">Hangus</div><strong>${counts[STATUS_CUTI_TAHUNAN.HANGUS] || 0}</strong></div>
        <div class="card" style="padding:10px;background:#fff1f2;"><div style="font-size:.7rem;color:var(--text-muted);font-weight:800;">Expired Kontrak</div><strong>${counts[STATUS_CUTI_TAHUNAN.EXPIRED_KONTRAK] || 0}</strong></div>
      </div>
      <div style="overflow:auto;border:1px solid var(--border);border-radius:12px;">
        <div style="display:grid;grid-template-columns:minmax(150px,1.4fr) repeat(4,minmax(70px,.6fr)) minmax(160px,1fr);gap:8px;padding:10px;background:var(--gray-50);font-size:.72rem;font-weight:800;border-bottom:1px solid var(--border);">
          <div>Karyawan / Periode</div><div>Jatah</div><div>Terpakai</div><div>Sisa</div><div>Status</div><div>Aksi / Riwayat</div>
        </div>
        <div style="min-width:760px;">${[
          STATUS_CUTI_TAHUNAN.ELIGIBLE_MENUNGGU_APPROVAL_HR,
          STATUS_CUTI_TAHUNAN.AKTIF,
          STATUS_CUTI_TAHUNAN.BELUM_ELIGIBLE,
          STATUS_CUTI_TAHUNAN.TIDAK_ELIGIBLE,
          STATUS_CUTI_TAHUNAN.HANGUS,
          STATUS_CUTI_TAHUNAN.EXPIRED_KONTRAK
        ].map(renderRows).join('')}</div>
      </div>
    </div>
  `
}

window.approveJatahCutiTahunanUI = async function(rowId) {
  try {
    const { data: row, error } = await supabase.from('cuti_tahunan').select('*').eq('id', rowId).single()
    if (error) throw error
    await approveJatahCutiTahunan(row, window.currentUser)
    showToast('Jatah cuti tahunan 12 hari berhasil diaktifkan', 'success')
    renderPengajuan(window.currentUser)
  } catch (err) {
    showToast('Gagal approve jatah cuti: ' + err.message, 'error')
  }
}

window.prosesHangusCutiTahunanUI = async function(rowId) {
  if (!confirm('Proses hangus sisa cuti periode ini? Saldo lama akan dicatat sebagai hangus.')) return
  try {
    await prosesHangusCutiTahunan(rowId, window.currentUser)
    showToast('Sisa cuti lama berhasil diproses hangus', 'success')
    renderPengajuan(window.currentUser)
  } catch (err) {
    showToast('Gagal proses hangus: ' + err.message, 'error')
  }
}


window.showExtendCutiModal = async function(rowId) {
  try {
    const { data: row, error } = await supabase.from('cuti_tahunan').select('*').eq('id', rowId).single()
    if (error) throw error
    if ([STATUS_CUTI_TAHUNAN.HANGUS, STATUS_CUTI_TAHUNAN.EXPIRED_KONTRAK].includes(row.status)) {
      showToast('Periode cuti sudah expired/hangus dan tidak bisa di-extend.', 'warning')
      return
    }
    if (row.status !== STATUS_CUTI_TAHUNAN.AKTIF) {
      showToast('Extend hanya bisa dilakukan untuk periode cuti yang masih AKTIF.', 'warning')
      return
    }

    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'
    modal.innerHTML = `
      <div class="card" style="width:100%;max-width:420px;padding:18px;">
        <h3 style="font-size:1rem;font-weight:900;margin-bottom:12px;"><i class="fa fa-calendar-plus" style="color:var(--primary);"></i> Extend Cuti</h3>
        <div class="field"><label>Extend berapa bulan <span class="req">*</span></label><input type="number" min="1" id="extendCutiBulan" value="1"></div>
        <div class="field"><label>Keterangan/alasan extend <span class="req">*</span></label><textarea id="extendCutiReason" placeholder="Tuliskan alasan extend..." style="min-height:90px;"></textarea></div>
        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">Batal</button>
          <button class="btn-primary" style="flex:1;" onclick="submitExtendCuti('${rowId}', document.getElementById('extendCutiBulan').value, document.getElementById('extendCutiReason').value, this)">Simpan</button>
        </div>
      </div>
    `
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
    document.body.appendChild(modal)
  } catch (err) {
    showToast('Gagal membuka extend cuti: ' + err.message, 'error')
  }
}

window.submitExtendCuti = async function(rowId, months, reason, btn) {
  try {
    if (!String(reason || '').trim()) {
      showToast('Alasan extend wajib diisi', 'warning')
      return
    }
    setButtonLoading(btn, true, '<i class="fa fa-spinner fa-spin"></i> Menyimpan...')
    await extendCutiTahunan(rowId, { months, reason }, window.currentUser)
    btn.closest('.modal-overlay')?.remove()
    showToast('Periode cuti berhasil diperpanjang. Sisa cuti tidak berubah.', 'success')
    renderPengajuan(window.currentUser)
  } catch (err) {
    setButtonLoading(btn, false, 'Simpan Extend')
    showToast(err.message, 'error')
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
      const { data: pengajuan, error: loadError } = await supabase
        .from('pengajuan')
        .select('*')
        .eq('id', id)
        .eq('status', 'pending')
        .single()
      if (loadError) throw loadError
      if (!pengajuan) throw new Error('Pengajuan tidak ditemukan atau sudah diproses.')

      const { user_id, jenis, tanggal_mulai, jumlah_hari } = pengajuan
      const rentang = await validatePengajuanRequest({ userId: user_id, jenis, tanggalMulai: tanggal_mulai, jumlahHari: jumlah_hari, excludeId: id, allowPast: true })

      const beforeState = { ...pengajuan }
      const approvedAt = new Date().toISOString()
      const afterState = { ...beforeState, status: 'approved', catatan_approval: catatan || null, approved_at: approvedAt }
      const { data: approvedRow, error: approveError } = await supabase
        .from('pengajuan')
        .update({
          status: 'approved',
          catatan_approval: catatan || null,
          approved_at: approvedAt
        })
        .eq('id', id)
        .eq('status', 'pending')
        .select('*')
        .single()
      if (approveError) throw approveError
      if (!approvedRow) throw new Error('Pengajuan sudah diproses oleh admin/HR lain.')

      const jadwalSnapshots = []
      try {
        // ── FIX: Parse tanggal_mulai sebagai waktu lokal, bukan UTC ──────────
        const [y, m, d] = rentang.tanggalMulai.split('-').map(Number)

        // Distribusikan override ke jadwal harian staff
        for (let i = 0; i < rentang.jumlahHari; i++) {
          const date = new Date(y, m - 1, d)   // new Date(tahun, bulan-1, hari) = waktu LOKAL
          date.setDate(date.getDate() + i)
          const tgl = toDateStr(date)           // FIX: was date.toISOString().split('T')[0]

          console.log(`[APPROVAL] Insert jadwal override: ${tgl} - ${jenis}`)

          const { data: existing } = await supabase
            .from('jadwal')
            .select('id, shift_id, status_override, pengajuan_id')
            .eq('user_id', user_id)
            .eq('tanggal', tgl)
            .maybeSingle()

          if (existing) {
            jadwalSnapshots.push({ ...existing, inserted: false })
            await supabase.from('jadwal')
              .update({ status_override: jenis, shift_id: null, pengajuan_id: id })
              .eq('id', existing.id)
          } else {
            const { data: insertedJadwal, error: insertJadwalError } = await supabase.from('jadwal')
              .insert([{ user_id, tanggal: tgl, shift_id: null, status_override: jenis, pengajuan_id: id }])
              .select('id')
              .single()
            if (insertJadwalError) throw insertJadwalError
            if (insertedJadwal?.id) jadwalSnapshots.push({ id: insertedJadwal.id, inserted: true })
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        // Jika jenisnya cuti, kurangi saldo dari sumber utama cuti_tahunan.
        if (jenis === 'cuti') {
          await deductCutiTahunanOnApproval(user_id, rentang.jumlahHari)
        }
      } catch (postApproveError) {
        for (const snapshot of jadwalSnapshots.reverse()) {
          if (snapshot.inserted) {
            await supabase.from('jadwal').delete().eq('id', snapshot.id)
          } else {
            await supabase
              .from('jadwal')
              .update({
                shift_id: snapshot.shift_id,
                status_override: snapshot.status_override,
                pengajuan_id: snapshot.pengajuan_id
              })
              .eq('id', snapshot.id)
          }
        }
        await supabase
          .from('pengajuan')
          .update({ status: 'pending', catatan_approval: null, approved_at: null })
          .eq('id', id)
        throw postApproveError
      }

      await logAuditEvent({ action: 'approve', entityType: 'pengajuan', entityId: id, before: beforeState, after: afterState })
      showToast('Pengajuan disetujui, jadwal & kuota cuti diperbarui', 'success')
    } else {
      const { data: beforeReject } = await supabase.from('pengajuan').select('*').eq('id', id).single()
      await supabase.from('pengajuan').update({
        status: 'rejected',
        catatan_approval: catatan,
        approved_at: new Date().toISOString()
      }).eq('id', id).eq('status', 'pending')

      await logAuditEvent({ action: 'reject', entityType: 'pengajuan', entityId: id, before: beforeReject || null, after: { ...(beforeReject || {}), status: 'rejected', catatan_approval: catatan } })
      showToast('Pengajuan ditolak', 'info')
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
    const text = rows.map(r => `• ${toTanggalJamLokal(r.created_at)} | ${r.actor_name || '-'} (${r.actor_role || '-'}) → ${r.action}`).join('\n')
    console.log('Timeline Pengajuan\n\n' + text)
    showToast('Timeline ditampilkan di console browser', 'info')
  } catch (err) {
    showToast('Gagal memuat timeline: ' + err.message, 'error')
  }
}
