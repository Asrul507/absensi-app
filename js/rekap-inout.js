import { supabase } from './supabase.js'

export async function renderRekapInOut(user) {
  const content = document.getElementById('content')
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-clock"></i> Rekap In/Out</h2>
      <button class="btn-primary btn-sm" onclick="downloadExcelRekapInOut()">
        <i class="fa fa-download"></i> Download Excel
      </button>
    </div>

    <!-- FILTER -->
    <div class="card fade-up" style="padding: 14px 18px; margin-bottom: 16px;">
      <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
        ${isAdmin ? `
          <div style="flex: 2; min-width: 150px;">
            <label style="font-size: .7rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px;">Nama Karyawan</label>
            <input id="filterNama" placeholder="Semua karyawan"
              style="width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                font-size: .85rem; outline: none; font-family: inherit;">
          </div>
        ` : ''}
        <div style="flex: 1; min-width: 130px;">
          <label style="font-size: .7rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px;">Dari Tanggal</label>
          <input type="date" id="filterDari"
            style="width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
              font-size: .85rem; outline: none; font-family: inherit; color: var(--text);">
        </div>
        <div style="flex: 1; min-width: 130px;">
          <label style="font-size: .7rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px;">Sampai Tanggal</label>
          <input type="date" id="filterSampai"
            style="width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
              font-size: .85rem; outline: none; font-family: inherit; color: var(--text);">
        </div>
        <button class="btn-primary btn-sm" onclick="applyRekapInOutFilter(window.currentUser)" style="align-self: flex-end; white-space: nowrap;">
          <i class="fa fa-search"></i> Cari
        </button>
      </div>
    </div>

    <!-- SUMMARY CARDS -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">
      <div class="card fade-up" style="padding: 14px; text-align: center;">
        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Total Records</div>
        <div style="font-size: 1.6rem; font-weight: 900; color: var(--primary);" id="totalRecords">-</div>
      </div>
      <div class="card fade-up" style="padding: 14px; text-align: center;">
        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Masuk</div>
        <div style="font-size: 1.6rem; font-weight: 900; color: var(--success);" id="totalMasuk">-</div>
      </div>
      <div class="card fade-up" style="padding: 14px; text-align: center;">
        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Tidak Masuk</div>
        <div style="font-size: 1.6rem; font-weight: 900; color: var(--danger);" id="totalTidakMasuk">-</div>
      </div>
    </div>

    <!-- DETAIL TABLE -->
    <div id="rekapInOutDetail" class="fade-up-1">
      <div class="card" style="text-align: center; padding: 28px;">
        <i class="fa fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
        <p style="color: var(--text-muted); margin-top: 8px; font-size: .85rem;">Memuat data...</p>
      </div>
    </div>
  `

  // Set default date range (current month)
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  document.getElementById('filterDari').value = firstDay.toISOString().split('T')[0]
  document.getElementById('filterSampai').value = lastDay.toISOString().split('T')[0]

  window._isAdminRekapInOut = isAdmin

  await applyRekapInOutFilter(user)
}

window.applyRekapInOutFilter = async function (user) {
  const isAdmin = window._isAdminRekapInOut
  const namaPencarian = document.getElementById('filterNama')?.value?.trim() || ''
  const dari = document.getElementById('filterDari')?.value
  const sampai = document.getElementById('filterSampai')?.value

  try {
    // Fetch absensi data
    let query = supabase
      .from('absensi')
      .select('*')
      .order('tanggal', { ascending: false })
      .order('waktu_masuk', { ascending: false })

    if (!isAdmin) {
      query = query.eq('nama', user.nama_lengkap)
    } else if (namaPencarian) {
      query = query.ilike('nama', `%${namaPencarian}%`)
    }

    if (dari) query = query.gte('tanggal', dari)
    if (sampai) query = query.lte('tanggal', sampai)

    const { data: absensiData, error } = await query

    if (error) throw error

    // Calculate summary & render
    const hasil = calculateRekapInOut(absensiData || [], isAdmin, user.nama_lengkap)

    // Store for download
    window._rekapInOutDetail = hasil.detail

    // Update summary cards
    document.getElementById('totalRecords').textContent = hasil.summary.total
    document.getElementById('totalMasuk').textContent = hasil.summary.masuk
    document.getElementById('totalTidakMasuk').textContent = hasil.summary.tidakMasuk

    renderRekapInOutTable(hasil.detail, isAdmin)

  } catch (err) {
    console.error('Error load rekap in/out:', err)
    document.getElementById('rekapInOutDetail').innerHTML = `
      <div class="card"><p style="color: var(--danger);">Error: ${err.message}</p></div>
    `
  }
}

function calculateRekapInOut(absensiData, isAdmin, currentUserName) {
  const detail = []
  const summary = { total: 0, masuk: 0, tidakMasuk: 0 }

  absensiData.forEach(a => {
    summary.total++

    if (a.waktu_masuk) {
      summary.masuk++
    } else {
      summary.tidakMasuk++
    }

    const jamMasuk = a.waktu_masuk ? new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
    const jamPulang = a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'

    let totalJam = '-'
    if (a.waktu_masuk && a.waktu_pulang) {
      const masuk = new Date(a.waktu_masuk)
      const pulang = new Date(a.waktu_pulang)
      const durationMinutes = Math.round((pulang - masuk) / 60000)
      const jam = Math.floor(durationMinutes / 60)
      const menit = durationMinutes % 60
      totalJam = `${jam}h ${menit}m`
    }

    const status = a.waktu_masuk ? (a.waktu_pulang ? 'Complete' : 'Belum Pulang') : 'Tidak Absen'

    detail.push({
      nama: a.nama,
      tanggal: a.tanggal,
      jamMasuk,
      jamPulang,
      totalJam,
      status
    })
  })

  return { detail, summary }
}

function renderRekapInOutTable(detail, isAdmin) {
  const el = document.getElementById('rekapInOutDetail')

  if (!detail.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding: 52px 24px;">
        <i class="fa fa-inbox"></i>
        <p>Tidak ada data untuk filter yang dipilih</p>
      </div>
    `
    return
  }

  const tableHtml = `
    <div class="card" style="padding: 0; overflow: hidden;">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              ${isAdmin ? '<th>Nama</th>' : ''}
              <th>Tanggal</th>
              <th>Jam Masuk</th>
              <th>Jam Pulang</th>
              <th>Total Jam</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${detail.map(d => {
              let keteranganDetail = d.status
              
              // Tambah info terlambat jika ada
              if (d.status === 'Belum Pulang' && d.jamMasuk !== '-') {
                const lateMin = Math.abs(new Date(d.jamMasuk).getHours() * 60 + new Date(d.jamMasuk).getMinutes() - (7 * 60))
                if (lateMin > 5) keteranganDetail += ` (Terlambat ${lateMin}m)`
              }
              
              return `
              <tr>
                ${isAdmin ? `<td style="font-weight: 600;">${d.nama}</td>` : ''}
                <td>${d.tanggal}</td>
                <td style="font-weight: 700;">${d.jamMasuk}</td>
                <td style="font-weight: 700;">${d.jamPulang}</td>
                <td>${d.totalJam}</td>
                <td>
                  <span style="
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: .75rem;
                    font-weight: 700;
                    ${d.status === 'Complete' ? 'background: #dcfce7; color: #166534;' : ''}
                    ${d.status === 'Belum Pulang' ? 'background: #fef3c7; color: #92400e;' : ''}
                    ${d.status === 'Tidak Absen' ? 'background: #fee2e2; color: #991b1b;' : ''}
                  ">
                    ${keteranganDetail}
                  </span>
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  el.innerHTML = tableHtml
}

window.downloadExcelRekapInOut = function () {
  if (!window._rekapInOutDetail || !window._rekapInOutDetail.length) {
    alert('Tidak ada data untuk didownload')
    return
  }

  if (typeof XLSX === 'undefined') {
    alert('Library XLSX belum dimuat')
    return
  }

  const rows = window._rekapInOutDetail.map(d => ({
    'Nama': d.nama,
    'Tanggal': d.tanggal,
    'Jam Masuk': d.jamMasuk,
    'Jam Pulang': d.jamPulang,
    'Total Jam': d.totalJam,
    'Status': d.status
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()

  ws['!cols'] = [
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 }
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Rekap In/Out')
  XLSX.writeFile(wb, `rekap-inout-${new Date().toISOString().split('T')[0]}.xlsx`)
}
