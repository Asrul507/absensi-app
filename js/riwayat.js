import { supabase } from './supabase.js'
import { toJamLokal, getTodayLokal, toTanggalAbsensiLokal } from './timezone.js'
import { showToast, promptAction } from './feedback.js'
import { getStatusPulangReminder } from './absensi.js'

/* ================= HELPER BADGE KETERANGAN ================= */
function normalizeStatusAbsensiLabel(status) {
  return String(status || '').trim().toUpperCase()
}

function badgeKeterangan(status_absensi, waktu_masuk, waktu_pulang, row = null) {
  const status = normalizeStatusAbsensiLabel(status_absensi)

  if (status === 'COMPLETE') {
    return `<span class="badge badge-green"><i class="fa fa-circle-check"></i> Complete</span>`
  }

  if (status === 'REJECTED') {
    return `<span class="badge badge-red"><i class="fa fa-circle-xmark"></i> Rejected</span>`
  }

  // salah absen, tidak absen, lupa → merah
  if (status_absensi === 'salah absen') {
    return `<span class="badge badge-red"><i class="fa fa-circle-xmark"></i> Salah Absen</span>`
  }
  if (!waktu_pulang && waktu_masuk) {
    const reminder = getStatusPulangReminder(row || { waktu_masuk, waktu_pulang, tanggal: row?.tanggal, jam_jadwal_masuk: row?.jam_jadwal_masuk, jam_jadwal_pulang: row?.jam_jadwal_pulang }, { jam_masuk: row?.jam_jadwal_masuk, jam_pulang: row?.jam_jadwal_pulang })
    const label = reminder.status === 'Lupa Absen Pulang' ? 'Lupa Absen Pulang' : 'Belum Pulang'
    return `<span class="badge badge-red"><i class="fa fa-triangle-exclamation"></i> ${label}</span>`
  }
  if (status_absensi === 'lupa absen datang' || (!waktu_masuk && waktu_pulang)) {
    return `<span class="badge badge-red"><i class="fa fa-triangle-exclamation"></i> Tidak Absen Masuk</span>`
  }

  // open → kuning
  if (status === 'OPEN' || !status_absensi) {
    return `<span class="badge badge-yellow"><i class="fa fa-clock"></i> Open</span>`
  }

  // fallback
  return `<span class="badge badge-gray">${status_absensi}</span>`
}

/* ================= RENDER ================= */
export async function renderRiwayat(user) {
  const content = document.getElementById('content')
  if (!user) {
    content.innerHTML = `<div class="card"><p>Silakan login dulu</p></div>`
    return
  }

  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-list-alt"></i> Riwayat Absensi</h2>
      <button class="btn-primary btn-sm" onclick="downloadExcelRiwayat()">
        <i class="fa fa-download"></i> Download Excel
      </button>
    </div>

    <div class="card fade-up" style="padding:14px 18px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        ${isAdmin ? `
          <div style="flex:2;min-width:150px;">
            <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Nama Karyawan</label>
            <input id="filterNama" placeholder="Semua karyawan"
              style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);
                font-size:.85rem;outline:none;font-family:inherit;">
          </div>` : ''}
        <div style="flex:1;min-width:130px;">
          <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Dari Tanggal</label>
          <input type="date" id="filterDari"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);
              font-size:.85rem;outline:none;font-family:inherit;color:var(--text);">
        </div>
        <div style="flex:1;min-width:130px;">
          <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Sampai Tanggal</label>
          <input type="date" id="filterSampai"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);
              font-size:.85rem;outline:none;font-family:inherit;color:var(--text);">
        </div>
        <div style="flex:1;min-width:120px;">
          <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Status</label>
          <select id="filterStatus"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);
              font-size:.85rem;outline:none;font-family:inherit;color:var(--text);background:var(--white);">
            <option value="">Semua</option>
            <option value="COMPLETE">Complete</option>
            <option value="OPEN">Open</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <button class="btn-primary btn-sm" onclick="loadRiwayat(window.currentUser)" style="align-self:flex-end;white-space:nowrap;">
          <i class="fa fa-search"></i> Tampilkan
        </button>
      </div>
    </div>

    <div id="riwayatList" class="fade-up-1">
      <div class="card" style="text-align:center;padding:28px;">
        <i class="fa fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i>
        <p style="color:var(--text-muted);margin-top:8px;font-size:.85rem;">Memuat data...</p>
      </div>
    </div>
  `

  await loadRiwayat(user)
}

/* ================= LOAD DATA ================= */
window.loadRiwayat = async function (user) {
  const container = document.getElementById('riwayatList')
  if (!container) return

  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  try {
    let query = supabase.from('absensi').select('*').order('tanggal', { ascending: false })

    const nama    = document.getElementById('filterNama')?.value?.trim()
    const dari    = document.getElementById('filterDari')?.value
    const sampai  = document.getElementById('filterSampai')?.value
    const status  = document.getElementById('filterStatus')?.value

    if (!isAdmin) {
      query = query.eq('nama', user.nama_lengkap)
    } else if (nama) {
      query = query.ilike('nama', `%${nama}%`)
    }

    if (dari)   query = query.gte('tanggal', dari)
    if (sampai) query = query.lte('tanggal', sampai)
    if (status) query = query.eq('status_absensi', status)

    const { data, error } = await query

    if (error) {
      container.innerHTML = `<div class="card"><p class="text-danger">❌ Gagal load riwayat</p></div>`
      return
    }

    window._riwayatData = data || []

    if (!data?.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding:52px 24px;">
          <i class="fa fa-inbox"></i>
          <p>Tidak ada data absensi</p>
        </div>`
      return
    }

    container.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                ${isAdmin ? '<th>Nama</th>' : ''}
                <th>Masuk</th>
                <th>Pulang</th>
                <th>Status Masuk</th>
                <th>Keterangan</th>
                ${isAdmin ? '<th class="td-action">Aksi</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${data.map(r => {
                const tanggalAbsensi = toTanggalAbsensiLokal(r?.tanggal, r?.waktu_masuk || r?.waktu_pulang)

                // FIX AUDIT 1: Tampilkan durasi menit keterlambatan riil jika ada datanya
                let statusMasukHtml = '-'
                if (r.status_masuk === 'Terlambat') {
                  const mLat = r.menit_terlambat ? ` (${r.menit_terlambat}m)` : ''
                  statusMasukHtml = `<span class="badge badge-red"><i class="fa fa-clock"></i> Terlambat${mLat}</span>`
                } else if (r.status_masuk) {
                  statusMasukHtml = `<span class="badge badge-green">${r.status_masuk}</span>`
                } else {
                  statusMasukHtml = `<span class="badge badge-gray">-</span>`
                }

                return `
                <tr>
                  <td>${tanggalAbsensi}</td>
                  ${isAdmin ? `<td style="font-weight:600;">${r.nama || '-'}</td>` : ''}
                  <td style="font-weight:700;color:var(--success);">
                    ${r.waktu_masuk
                      ? toJamLokal(r.waktu_masuk)
                      : '<span style="color:var(--gray-400);">-</span>'}
                  </td>
                 <td style="font-weight:700;color:var(--primary);">
                    ${r.waktu_pulang
                      ? toJamLokal(r.waktu_pulang)
                      : '<span style="color:var(--gray-400);">-</span>'}
                    ${r.status_pulang === 'Pulang Cepat' 
                      ? `<div style="font-size:.65rem; color:var(--danger); font-weight:700; margin-top:2px;">
                          ⚠️ Pulang Cepat (${r.menit_pulang_cepat || 0}m)
                         </div>` 
                      : ''}
                  </td>
                  <td>
                    ${statusMasukHtml}
                  </td>
                  <td>
                    ${badgeKeterangan(r.status_absensi, r.waktu_masuk, r.waktu_pulang, r)}
                  </td>
                  ${isAdmin ? `
                    <td class="td-action">
                      ${['salah absen','lupa absen pulang','lupa absen datang'].includes(r.status_absensi)
                        ? `<button class="tbl-btn view" onclick="approveAbsen('${r.id}')">
                            <i class="fa fa-check"></i> Approve
                           </button>`
                        : ''}
                    </td>` : ''}
                </tr>`}).join('')}
            </tbody>
          </table>
        </div>
        <div style="padding:10px 16px;font-size:.75rem;color:var(--text-muted);
          border-top:1px solid var(--gray-100);display:flex;justify-content:space-between;align-items:center;">
          <span>Total: <strong>${data.length}</strong> record</span>
          <button class="btn-secondary btn-sm" onclick="downloadExcelRiwayat()">
            <i class="fa fa-download"></i> Download Excel
          </button>
        </div>
      </div>
    `
  } catch (err) {
    console.error(err)
    container.innerHTML = `<div class="card"><p class="text-danger">❌ Error sistem</p></div>`
  }
}

/* ================= APPROVE ================= */
window.approveAbsen = async function (id) {
  const note = (await promptAction('Keterangan approval (opsional):', 'Tambahkan catatan jika diperlukan', 'Approve')) ?? ''
  const payload = {
    status_absensi: 'COMPLETE',
    status_kehadiran: 'HADIR',
    approval_note: note || null
  }

  console.log('[RIWAYAT APPROVE] before update', { id, payload })
  const updateResult = await supabase
    .from('absensi')
    .update(payload)
    .eq('id', id)
    .select('id,status_absensi,status_kehadiran,approval_note')
    .maybeSingle()
  console.log('[RIWAYAT APPROVE] update response', updateResult)

  if (updateResult.error) { showToast('Gagal approve: ' + updateResult.error.message, 'error'); return }
  if (!updateResult.data) { showToast('Gagal approve: record tidak ditemukan / tidak ter-update.', 'error'); return }

  const verifyResult = await supabase
    .from('absensi')
    .select('id,status_absensi,status_kehadiran,approval_note')
    .eq('id', id)
    .maybeSingle()
  console.log('[RIWAYAT APPROVE] verify from DB', verifyResult)

  if (verifyResult.error) { showToast('Gagal cek ulang approve: ' + verifyResult.error.message, 'error'); return }
  if (verifyResult.data?.status_absensi !== 'COMPLETE') { showToast('Approval belum tersimpan sebagai COMPLETE.', 'error'); return }

  showToast('Approval berhasil', 'success')
  await loadRiwayat(window.currentUser)
}

/* ================= DOWNLOAD EXCEL ================= */
window.downloadExcelRiwayat = function () {
  const data = window._riwayatData
  if (!data?.length) { showToast('Tidak ada data untuk didownload', 'info'); return }
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum dimuat', 'warning'); return }

  const rows = data.map(r => {
    let keterangan = normalizeStatusAbsensiLabel(r.status_absensi || 'OPEN')
    if (keterangan === 'COMPLETE') keterangan = 'Complete'
    else if (keterangan === 'OPEN') keterangan = 'Open'
    else if (keterangan === 'REJECTED') keterangan = 'Rejected'

    return {
      'Tanggal':           toTanggalAbsensiLokal(r?.tanggal, r?.waktu_masuk || r?.waktu_pulang),
      'Nama':              r.nama || '-',
      'Waktu Masuk':       r.waktu_masuk  ? toJamLokal(r.waktu_masuk)  : '-',
      'Waktu Pulang':      r.waktu_pulang ? toJamLokal(r.waktu_pulang) : '-',
      'Status Masuk':      r.status_masuk   || '-',
      // FIX AUDIT 2: Ekspor data total menit terlambat ke Excel laporan riwayat
      'Menit Terlambat':   r.status_masuk === 'Terlambat' ? (r.menit_terlambat || 0) : 0, 
      'Keterangan':        keterangan,
      'Approve Manual':    r.status_absensi === 'COMPLETE' ? 'Ya' : 'Tidak',
      'Catatan Approve':   r.approval_note || r.approve_note || '-',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()

  // Auto column width
  ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 16) }))

  XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Absensi')
  XLSX.writeFile(wb, `riwayat-absensi-${getTodayLokal()}.xlsx`)
}
