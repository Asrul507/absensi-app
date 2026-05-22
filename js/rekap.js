import { supabase } from './supabase.js'

/* ===============================================================
   HELPER: Konversi menit ke HH:MM:SS
=============================================================== */
function minutesToHMS(minutes) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const secs = 0
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/* ===============================================================
   RENDER REKAP ABSENSI
=============================================================== */
export async function renderRekap(user) {
  const content = document.getElementById('content')
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-chart-bar"></i> Rekap Absensi</h2>
      <button class="btn-primary btn-sm" onclick="downloadExcelRekap()" id="btnDownloadExcel">
        <i class="fa fa-download"></i> Download Excel
      </button>
    </div>

    <!-- TABS -->
    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
      <button id="tabAbsensi" class="btn-primary btn-sm" onclick="switchRekapTab('absensi')">
        <i class="fa fa-clock"></i> Absensi
      </button>
      <button id="tabIzin" class="btn-secondary btn-sm" onclick="switchRekapTab('izin')">
        <i class="fa fa-hand-paper"></i> Izin
      </button>
      <button id="tabCuti" class="btn-secondary btn-sm" onclick="switchRekapTab('cuti')">
        <i class="fa fa-umbrella-beach"></i> Cuti
      </button>
      <button id="tabSakit" class="btn-secondary btn-sm" onclick="switchRekapTab('sakit')">
        <i class="fa fa-heartbeat"></i> Sakit
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
        <button class="btn-primary btn-sm" onclick="applyRekapFilter(window.currentUser)" style="align-self: flex-end; white-space: nowrap;">
          <i class="fa fa-search"></i> Cari
        </button>
      </div>
    </div>

    <!-- SUMMARY CARDS (untuk tab absensi) -->
    <div id="summaryCar ds" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">
      <div class="card fade-up" style="padding: 14px; text-align: center;">
        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Total Hari Kerja</div>
        <div style="font-size: 1.6rem; font-weight: 900; color: var(--primary);" id="totalHari">-</div>
      </div>
      <div class="card fade-up" style="padding: 14px; text-align: center;">
        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Total Jam Kerja</div>
        <div style="font-size: 1.4rem; font-weight: 900; color: var(--success);" id="totalJamKerja">-</div>
      </div>
      <div class="card fade-up" style="padding: 14px; text-align: center;">
        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Total Terlambat</div>
        <div style="font-size: 1.4rem; font-weight: 900; color: var(--warning);" id="totalTerlambat">-</div>
      </div>
    </div>

    <!-- DETAIL TABLE -->
    <div id="rekapDetail" class="fade-up-1">
      <div class="card" style="text-align: center; padding: 28px;">
        <i class="fa fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
        <p style="color: var(--text-muted); margin-top: 8px; font-size: .85rem;">Memuat rekap...</p>
      </div>
    </div>
  `

  // Set default date range (current month)
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  document.getElementById('filterDari').value = firstDay.toISOString().split('T')[0]
  document.getElementById('filterSampai').value = lastDay.toISOString().split('T')[0]

  // Store for download
  window._currentRekapTab = 'absensi'
  window._currentUser = user
  window._isAdminRekap = isAdmin

  await applyRekapFilter(user)
}

/* ===============================================================
   SWITCH TAB
=============================================================== */
window.switchRekapTab = async function (tab) {
  window._currentRekapTab = tab

  // Update button styles
  document.getElementById('tabAbsensi').className = tab === 'absensi' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  document.getElementById('tabIzin').className = tab === 'izin' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  document.getElementById('tabCuti').className = tab === 'cuti' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  document.getElementById('tabSakit').className = tab === 'sakit' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'

  // Toggle summary cards (hanya untuk absensi)
  const summaryEl = document.getElementById('summaryCar ds')
  if (summaryEl) summaryEl.style.display = tab === 'absensi' ? 'grid' : 'none'

  // Hide download button untuk non-absensi
  const btnDl = document.getElementById('btnDownloadExcel')
  if (btnDl) btnDl.style.display = tab === 'absensi' ? 'block' : 'none'

  await applyRekapFilter(window._currentUser)
}

/* ===============================================================
   APPLY FILTER & LOAD REKAP
=============================================================== */
window.applyRekapFilter = async function (user) {
  const isAdmin = window._isAdminRekap
  const namaPencarian = document.getElementById('filterNama')?.value?.trim() || ''
  const dari = document.getElementById('filterDari')?.value
  const sampai = document.getElementById('filterSampai')?.value
  const tab = window._currentRekapTab || 'absensi'

  try {
    if (tab === 'absensi') {
      // Load absensi data
      let query = supabase.from('absensi').select('*').order('tanggal', { ascending: false })

      if (!isAdmin) {
        query = query.eq('nama', user.nama_lengkap)
      } else if (namaPencarian) {
        query = query.ilike('nama', `%${namaPencarian}%`)
      }

      if (dari) query = query.gte('tanggal', dari)
      if (sampai) query = query.lte('tanggal', sampai)

      const { data: absensiData, error } = await query
      if (error) throw error

      // Calculate summary
      const rekap = calculateRekapAbsensi(absensiData || [], isAdmin, user.nama_lengkap)
      window._currentRekapData = rekap.detail

      // Update summary
      document.getElementById('totalHari').textContent = rekap.summary.totalHari
      document.getElementById('totalJamKerja').textContent = rekap.summary.totalJamKerja
      document.getElementById('totalTerlambat').textContent = rekap.summary.totalTerlambat

      renderRekapTable(rekap, isAdmin)
    } else {
      // Load pengajuan data (izin/sakit/cuti)
      let queryPengajuan = supabase
        .from('pengajuan')
        .select('*')
        .eq('jenis', tab)
        .eq('status', 'approved')
        .order('tanggal_pengajuan', { ascending: false })

      if (!isAdmin) {
        queryPengajuan = queryPengajuan.eq('user_id', user.id)
      } else if (namaPencarian) {
        // Akan fetch semua then filter by nama (simplified)
      }

      if (dari) queryPengajuan = queryPengajuan.gte('tanggal_pengajuan', dari)
      if (sampai) queryPengajuan = queryPengajuan.lte('tanggal_pengajuan', sampai)

      const { data: pengajuanData, error: errPengajuan } = await queryPengajuan
      if (errPengajuan) throw errPengajuan

      renderPengajuanTable(pengajuanData || [], tab, isAdmin)
    }
  } catch (err) {
    console.error('Error load rekap:', err)
    document.getElementById('rekapDetail').innerHTML = `
      <div class="card"><p class="text-danger">Error: ${err.message}</p></div>
    `
  }
}

/* ===============================================================
   CALCULATE REKAP ABSENSI
=============================================================== */
function calculateRekapAbsensi(absensiData, isAdmin, currentUserName) {
  const detail = []
  const summary = {
    totalHari: 0,
    totalJamKerja: '00:00:00',
    totalTerlambat: '00:00:00'
  }

  const groupedByName = {}
  absensiData.forEach(a => {
    if (!groupedByName[a.nama]) groupedByName[a.nama] = []
    groupedByName[a.nama].push(a)
  })

  let totalJamKerjaMinutes = 0
  let totalTerlambatMinutes = 0
  let totalHariKerja = 0

  Object.keys(groupedByName).forEach(nama => {
    const absenList = groupedByName[nama]
    let hariKerja = absenList.length
    let jamKerjaMinutes = 0
    let terlambatMinutes = 0

    absenList.forEach(a => {
      // Hitung jam kerja (jam_masuk - jam_pulang)
      if (a.waktu_masuk && a.waktu_pulang) {
        const masuk = new Date(a.waktu_masuk)
        const pulang = new Date(a.waktu_pulang)
        const durationMs = pulang - masuk
        jamKerjaMinutes += Math.round(durationMs / 60000)
      }

      // Hitung terlambat
      if (a.status_masuk === 'Terlambat') {
        // Extract menit dari format "Terlambat X menit" atau use default
        terlambatMinutes += 15 // default assumption, ideally simpan di DB
      }
    })

    totalJamKerjaMinutes += jamKerjaMinutes
    totalTerlambatMinutes += terlambatMinutes
    totalHariKerja += hariKerja

    detail.push({
      nama,
      hariKerja,
      jamKerja: minutesToHMS(jamKerjaMinutes),
      jamKerjaMinutes,
      terlambat: minutesToHMS(terlambatMinutes),
      terlambatMinutes
    })
  })

  summary.totalHari = totalHariKerja
  summary.totalJamKerja = minutesToHMS(totalJamKerjaMinutes)
  summary.totalTerlambat = minutesToHMS(totalTerlambatMinutes)

  return { detail, summary }
}

/* ===============================================================
   RENDER REKAP TABLE (ABSENSI)
=============================================================== */
function renderRekapTable(rekap, isAdmin) {
  const el = document.getElementById('rekapDetail')

  if (!rekap.detail.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding: 52px 24px;">
        <i class="fa fa-inbox"></i>
        <p>Tidak ada data absensi untuk filter yang dipilih</p>
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
              <th>Hari Kerja</th>
              <th>Total Jam Kerja</th>
              <th>Total Terlambat</th>
            </tr>
          </thead>
          <tbody>
            ${rekap.detail.map(r => `
              <tr>
                ${isAdmin ? `<td style="font-weight: 600;">${r.nama}</td>` : ''}
                <td style="text-align: center; font-weight: 700;">${r.hariKerja}</td>
                <td style="font-weight: 700; color: var(--success);">${r.jamKerja}</td>
                <td style="font-weight: 700; color: var(--warning);">${r.terlambat}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding: 10px 16px; font-size: .75rem; color: var(--text-muted);
        border-top: 1px solid var(--gray-100);">
        Total: <strong>${rekap.detail.length}</strong> karyawan | 
        Jam kerja: <strong>${rekap.summary.totalJamKerja}</strong> | 
        Terlambat: <strong>${rekap.summary.totalTerlambat}</strong>
      </div>
    </div>
  `

  el.innerHTML = tableHtml
}

/* ===============================================================
   RENDER PENGAJUAN TABLE (IZIN/SAKIT/CUTI)
=============================================================== */
function renderPengajuanTable(pengajuanData, jenis, isAdmin) {
  const el = document.getElementById('rekapDetail')

  if (!pengajuanData.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding: 52px 24px;">
        <i class="fa fa-inbox"></i>
        <p>Tidak ada data ${jenis} untuk filter yang dipilih</p>
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
              <th>Jumlah Hari</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${pengajuanData.map(p => `
              <tr>
                ${isAdmin ? `<td style="font-weight: 600;">${p.user_name || '-'}</td>` : ''}
                <td>${p.tanggal_pengajuan || '-'}</td>
                <td style="text-align: center; font-weight: 700;">${p.jumlah_hari || 1}</td>
                <td style="font-size: .85rem; color: var(--text-muted);">${p.keterangan || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding: 10px 16px; font-size: .75rem; color: var(--text-muted);
        border-top: 1px solid var(--gray-100);">
        Total: <strong>${pengajuanData.length}</strong> record
      </div>
    </div>
  `

  el.innerHTML = tableHtml
}

/* ===============================================================
   DOWNLOAD EXCEL REKAP ABSENSI
=============================================================== */
window.downloadExcelRekap = function () {
  if (!window._currentRekapData || !window._currentRekapData.length) {
    alert('Tidak ada data untuk didownload')
    return
  }

  if (typeof XLSX === 'undefined') {
    alert('Library XLSX belum dimuat')
    return
  }

  const data = window._currentRekapData.map(r => ({
    'Nama': r.nama,
    'Total Hari Kerja': r.hariKerja,
    'Total Jam Kerja': r.jamKerja,
    'Total Terlambat': r.terlambat,
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()

  // Auto column width
  ws['!cols'] = [
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absensi')
  XLSX.writeFile(wb, `rekap-absensi-${new Date().toISOString().split('T')[0]}.xlsx`)
}
