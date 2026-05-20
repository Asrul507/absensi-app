import { supabase } from './supabase.js'

export async function renderRiwayat(user) {
  const content = document.getElementById('content')
  if (!user) { content.innerHTML = `<div class="card"><p>Silakan login dulu</p></div>`; return }

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
          <div style="flex:1;min-width:140px;">
            <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Nama Karyawan</label>
            <input id="filterNama" placeholder="Semua karyawan"
              style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;">
          </div>` : ''}
        <div style="flex:1;min-width:120px;">
          <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Dari Tanggal</label>
          <input type="date" id="filterDari"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;">
        </div>
        <div style="flex:1;min-width:120px;">
          <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Sampai Tanggal</label>
          <input type="date" id="filterSampai"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;">
        </div>
        <button class="btn-primary btn-sm" onclick="loadRiwayat(window.currentUser)" style="align-self:flex-end;">
          <i class="fa fa-search"></i> Filter
        </button>
      </div>
    </div>

    <div id="riwayatList" class="fade-up-1">
      <div class="card" style="text-align:center;padding:24px;">
        <i class="fa fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i>
      </div>
    </div>
  `

  await loadRiwayat(user)
}

window.loadRiwayat = async function(user) {
  const container = document.getElementById('riwayatList')
  if (!container) return

  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  try {
    let query = supabase.from('absensi').select('*').order('tanggal', { ascending: false })

    const nama   = document.getElementById('filterNama')?.value?.trim()
    const dari   = document.getElementById('filterDari')?.value
    const sampai = document.getElementById('filterSampai')?.value

    if (!isAdmin) query = query.eq('nama', user.nama_lengkap)
    else if (nama) query = query.ilike('nama', `%${nama}%`)

    if (dari)   query = query.gte('tanggal', dari)
    if (sampai) query = query.lte('tanggal', sampai)

    const { data, error } = await query

    if (error) { container.innerHTML = `<div class="card"><p class="text-danger">❌ Gagal load riwayat</p></div>`; return }

    // Simpan untuk download
    window._riwayatData = data || []

    if (!data?.length) {
      container.innerHTML = `<div class="empty-state" style="padding:48px 24px;"><i class="fa fa-inbox"></i><p>Tidak ada data absensi</p></div>`
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
              </tr>
            </thead>
            <tbody>
              ${data.map(r => `
                <tr>
                  <td>${r.tanggal || '-'}</td>
                  ${isAdmin ? `<td>${r.nama || '-'}</td>` : ''}
                  <td>${r.waktu_masuk ? new Date(r.waktu_masuk).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '-'}</td>
                  <td>${r.waktu_pulang ? new Date(r.waktu_pulang).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '-'}</td>
                  <td>
                    <span class="badge ${r.status_masuk==='Terlambat'?'badge-red':r.status_masuk?'badge-green':'badge-gray'}">
                      ${r.status_masuk || '-'}
                    </span>
                  </td>
                  <td>
                    <span class="badge ${
                      r.status_absensi==='salah absen'      ? 'badge-red'    :
                      r.status_absensi?.includes('lupa')    ? 'badge-yellow' :
                      r.status_absensi==='approved manual'  ? 'badge-green'  :
                      'badge-blue'
                    }">
                      ${r.status_absensi || 'open'}
                    </span>
                    ${isAdmin && ['salah absen','lupa absen datang','lupa absen pulang'].includes(r.status_absensi)
                      ? `<button class="tbl-btn view" onclick="approveAbsen('${r.id}')" style="margin-left:4px;">✅ Approve</button>`
                      : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="padding:12px 16px;font-size:.78rem;color:var(--text-muted);border-top:1px solid var(--gray-100);">
          Total: <strong>${data.length}</strong> records
        </div>
      </div>
    `
  } catch (err) {
    console.error(err)
    container.innerHTML = `<div class="card"><p class="text-danger">❌ Error sistem</p></div>`
  }
}

/* ================= APPROVE ================= */
window.approveAbsen = async function(id) {
  const note = prompt('Keterangan approval (opsional):') ?? ''
  const { error } = await supabase.from('absensi').update({
    approve_manual: true,
    approve_note: note,
    status_absensi: 'approved manual'
  }).eq('id', id)
  if (error) { alert('Gagal approve'); return }
  alert('✅ Approval berhasil')
  loadRiwayat(window.currentUser)
}

/* ================= DOWNLOAD EXCEL ================= */
window.downloadExcelRiwayat = function() {
  const data = window._riwayatData
  if (!data || data.length === 0) { alert('Tidak ada data untuk didownload'); return }

  if (typeof XLSX === 'undefined') { alert('Library XLSX belum dimuat'); return }

  const rows = data.map(r => ({
    'Tanggal'        : r.tanggal || '-',
    'Nama'           : r.nama || '-',
    'Waktu Masuk'    : r.waktu_masuk  ? new Date(r.waktu_masuk).toLocaleString('id-ID')  : '-',
    'Waktu Pulang'   : r.waktu_pulang ? new Date(r.waktu_pulang).toLocaleString('id-ID') : '-',
    'Status Masuk'   : r.status_masuk   || '-',
    'Status Absensi' : r.status_absensi || 'open',
    'Approve Manual' : r.approve_manual ? 'Ya' : 'Tidak',
    'Catatan Approve': r.approve_note   || '-',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Absensi')

  // Auto column width
  const cols = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, 14) }))
  ws['!cols'] = cols

  const filename = `riwayat-absensi-${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, filename)
}
