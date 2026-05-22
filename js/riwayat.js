import { supabase } from './supabase.js'

/* ================= HELPER BADGE KETERANGAN ================= */
function badgeKeterangan(status_absensi, waktu_masuk, waktu_pulang) {
  // complete / approved manual → hijau
  if (status_absensi === 'complete' || status_absensi === 'approved manual') {
    return `<span class="badge badge-green"><i class="fa fa-circle-check"></i> ${status_absensi === 'complete' ? 'Complete' : 'Approved Manual'}</span>`
  }

  // salah absen, tidak absen, lupa → merah
  if (status_absensi === 'salah absen') {
    return `<span class="badge badge-red"><i class="fa fa-circle-xmark"></i> Salah Absen</span>`
  }
  if (status_absensi === 'lupa absen pulang' || (!waktu_pulang && waktu_masuk)) {
    return `<span class="badge badge-red"><i class="fa fa-triangle-exclamation"></i> Belum Pulang</span>`
  }
  if (status_absensi === 'lupa absen datang' || (!waktu_masuk && waktu_pulang)) {
    return `<span class="badge badge-red"><i class="fa fa-triangle-exclamation"></i> Tidak Absen Masuk</span>`
  }

  // open → kuning
  if (status_absensi === 'open' || !status_absensi) {
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
            <option value="complete">Complete</option>
            <option value="open">Open</option>
            <option value="salah absen">Salah Absen</option>
            <option value="lupa absen pulang">Lupa Absen Pulang</option>
            <option value="lupa absen datang">Lupa Absen Datang</option>
            <option value="approved manual">Approved Manual</option>
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
                  <td>${r.tanggal || '-'}</td>
                  ${isAdmin ? `<td style="font-weight:600;">${r.nama || '-'}</td>` : ''}
                  <td style="font-weight:700;color:var(--success);">
                    ${r.waktu_masuk
                      ? new Date(r.waktu_masuk).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })
                      : '<span style="color:var(--gray-400);">-</span>'}
                  </td>
                 <td style="font-weight:700;color:var(--primary);">
                    ${r.waktu_pulang
                      ? new Date(r.waktu_pulang).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })
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
                    ${badgeKeterangan(r.status_absensi, r.waktu_masuk, r.waktu_pulang)}
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
  const note = prompt('Keterangan approval (opsional):') ?? ''
  const { error } = await supabase.from('absensi').update({
    approve_manual:  true,
    approve_note:    note,
    status_absensi:  'approved manual'
  }).eq('id', id)

  if (error) { alert('Gagal approve'); return }
  alert('✅ Approval berhasil')
  loadRiwayat(window.currentUser)
}

/* ================= DOWNLOAD EXCEL ================= */
window.downloadExcelRiwayat = function () {
  const data = window._riwayatData
  if (!data?.length) { alert('Tidak ada data untuk didownload'); return }
  if (typeof XLSX === 'undefined') { alert('Library XLSX belum dimuat'); return }

  const rows = data.map(r => {
    let keterangan = r.status_absensi || 'open'
    if (keterangan === 'complete') keterangan = 'Complete'
    else if (keterangan === 'open') keterangan = 'Open'
    else if (keterangan === 'salah absen') keterangan = 'Salah Absen'
    else if (keterangan === 'lupa absen pulang') keterangan = 'Belum Pulang'
    else if (keterangan === 'lupa absen datang') keterangan = 'Tidak Absen Masuk'
    else if (keterangan === 'approved manual') keterangan = 'Approved Manual'

    return {
      'Tanggal':           r.tanggal || '-',
      'Nama':              r.nama || '-',
      'Waktu Masuk':       r.waktu_masuk  ? new Date(r.waktu_masuk).toLocaleString('id-ID')  : '-',
      'Waktu Pulang':      r.waktu_pulang ? new Date(r.waktu_pulang).toLocaleString('id-ID') : '-',
      'Status Masuk':      r.status_masuk   || '-',
      // FIX AUDIT 2: Ekspor data total menit terlambat ke Excel laporan riwayat
      'Menit Terlambat':   r.status_masuk === 'Terlambat' ? (r.menit_terlambat || 0) : 0, 
      'Keterangan':        keterangan,
      'Approve Manual':    r.approve_manual ? 'Ya' : 'Tidak',
      'Catatan Approve':   r.approve_note   || '-',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()

  // Auto column width
  ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 16) }))

  XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Absensi')
  XLSX.writeFile(wb, `riwayat-absensi-${new Date().toISOString().split('T')[0]}.xlsx`)
}
