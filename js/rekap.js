import { supabase } from './supabase.js'
import { showToast } from './feedback.js'
import { canAccessAllDepartments, getAccessibleProfiles } from './access-control.js'

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
  const isAdmin = user.role === 'admin' || user.role === 'super_admin' || user.role === 'spv' || user.role === 'supervisor'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-chart-bar"></i> Rekap Absensi</h2>
      <button class="btn-primary btn-sm" onclick="downloadExcelRekap()" id="btnDownloadExcel">
        <i class="fa fa-download"></i> Download Excel
      </button>
    </div>

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

    <div class="card fade-up" style="padding: 14px 18px; margin-bottom: 16px;">
      <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
        ${isAdmin ? `
          <div style="flex: 2; min-width: 150px;">
            <label style="font-size: .7rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px;">Nama Karyawan</label>
            <input id="filterNama" placeholder="Ketik nama (kosongkan untuk semua staff)..."
              style="width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md); font-size: .85rem; outline: none; font-family: inherit;">
          </div>
        ` : ''}
        <div style="flex: 1; min-width: 130px;">
          <label style="font-size: .7rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px;">Dari Tanggal</label>
          <input type="date" id="filterDari"
            style="width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md); font-size: .85rem; outline: none; font-family: inherit; color: var(--text);">
        </div>
        <div style="flex: 1; min-width: 130px;">
          <label style="font-size: .7rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px;">Sampai Tanggal</label>
          <input type="date" id="filterSampai"
            style="width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md); font-size: .85rem; outline: none; font-family: inherit; color: var(--text);">
        </div>
        <button class="btn-primary btn-sm" onclick="applyRekapFilter(window.currentUser)" style="align-self: flex-end; white-space: nowrap;">
          <i class="fa fa-search"></i> Cari Data
        </button>
      </div>
    </div>

    <div id="summaryCards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">
      <div class="card fade-up" style="padding: 14px; text-align: center; cursor: pointer;" onclick="showDetailModal('hariKerja')">
        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Total Hari Kerja</div>
        <div style="font-size: 1.6rem; font-weight: 900; color: var(--primary);" id="totalHari">-</div>
        <div style="font-size: .65rem; color: var(--primary); margin-top: 6px;">📋 Klik untuk detail</div>
      </div>
      <div class="card fade-up" style="padding: 14px; text-align: center; cursor: pointer;" onclick="showDetailModal('jamKerja')">
        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Total Jam Kerja</div>
        <div style="font-size: 1.4rem; font-weight: 900; color: var(--success);" id="totalJamKerja">-</div>
        <div style="font-size: .65rem; color: var(--success); margin-top: 6px;">📋 Klik untuk detail</div>
      </div>
      <div class="card fade-up" style="padding: 14px; text-align: center; cursor: pointer;" onclick="showDetailModal('terlambat')">
        <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Total Terlambat</div>
        <div style="font-size: 1.4rem; font-weight: 900; color: var(--warning);" id="totalTerlambat">-</div>
        <div style="font-size: .65rem; color: var(--warning); margin-top: 6px;">📋 Klik untuk detail</div>
      </div>
    </div>

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

  // Store variables global
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

  // Toggle summary cards & download button layout
  const summaryEl = document.getElementById('summaryCards')
  if (summaryEl) summaryEl.style.display = tab === 'absensi' ? 'grid' : 'none'

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
  let accessibleIds = []

  try {
    if (isAdmin && !canAccessAllDepartments(user)) {
      const profiles = await getAccessibleProfiles(user, { activeOnly: false, select: 'id, nama_lengkap, departemen, role, status_akun' })
      accessibleIds = profiles.map(p => p.id).filter(Boolean)
    }
    if (tab === 'absensi') {
      let query = supabase.from('absensi').select('*').eq('status_absensi', 'COMPLETE').order('tanggal', { ascending: false })
      if (isAdmin && !canAccessAllDepartments(user)) {
        query = accessibleIds.length ? query.in('user_id', accessibleIds) : null
      }

      if (!query) {
        window._currentRekapData = []
        renderRekapTable([], isAdmin)
        return
      }
      if (!isAdmin) {
        query = query.eq('user_id', user.id)
      } else if (namaPencarian) {
        // FITUR UTAMA: Filter nama spesifik secara realtime ke database
        query = query.ilike('nama', `%${namaPencarian}%`)
      }

      if (dari) query = query.gte('tanggal', dari)
      if (sampai) query = query.lte('tanggal', sampai)

      const { data: absensiData, error } = await query
      if (error) throw error

      const rekap = calculateRekapAbsensi(absensiData || [], isAdmin, user.nama_lengkap)
      window._currentRekapData = rekap.detail

      // Update widget summary angka
      const elHari      = document.getElementById('totalHari')
      const elJamKerja  = document.getElementById('totalJamKerja')
      const elTerlambat = document.getElementById('totalTerlambat')
      if (elHari)      elHari.textContent      = rekap.summary.totalHari
      if (elJamKerja)  elJamKerja.textContent  = rekap.summary.totalJamKerja
      if (elTerlambat) elTerlambat.textContent = rekap.summary.totalTerlambat

      renderRekapTable(rekap, isAdmin)
    } else {
      // Load pengajuan data (izin/sakit/cuti) yang sudah approved
      let queryPengajuan = supabase
        .from('pengajuan')
        .select('id, nama, user_id, tanggal_pengajuan, tanggal_mulai, tanggal_selesai, jumlah_hari, jenis, status, alasan')
        .eq('jenis', tab)
        .eq('status', 'approved')
        .order('tanggal_pengajuan', { ascending: false })

      if (!isAdmin) {
        queryPengajuan = queryPengajuan.eq('user_id', user.id)
      } else if (!canAccessAllDepartments(user)) {
        queryPengajuan = accessibleIds.length ? queryPengajuan.in('user_id', accessibleIds) : null
      }
      if (!queryPengajuan) {
        window._currentPengajuanData = []
        renderPengajuanTable([], tab, isAdmin)
        return
      }
      if (isAdmin && namaPencarian) {
        queryPengajuan = queryPengajuan.ilike('nama', `%${namaPencarian}%`)
      }

      if (dari) queryPengajuan = queryPengajuan.gte('tanggal_pengajuan', dari)
      if (sampai) queryPengajuan = queryPengajuan.lte('tanggal_pengajuan', sampai)

      const { data: pengajuanData, error: errPengajuan } = await queryPengajuan
      if (errPengajuan) throw errPengajuan

      window._currentPengajuanData = pengajuanData || []
      renderPengajuanTable(window._currentPengajuanData, tab, isAdmin)
    }
  } catch (err) {
    console.error('Error load rekap:', err)
    const elRekapDetail = document.getElementById('rekapDetail')
    if (elRekapDetail) elRekapDetail.innerHTML = `
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
      if (a.waktu_masuk && a.waktu_pulang) {
        const masuk = new Date(a.waktu_masuk)
        const pulang = new Date(a.waktu_pulang)
        const durationMs = pulang - masuk
        jamKerjaMinutes += Math.round(durationMs / 60000)
      }

      if (a.status_masuk === 'Terlambat') {
        // Ambil data keterlambatan riil dari kolom menit_terlambat di DB
        terlambatMinutes += (parseInt(a.menit_terlambat) || 0)
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
              ${isAdmin ? '<th style="text-align: left; padding: 12px;">Nama Karyawan</th>' : ''}
              <th>Hari Kerja</th>
              <th>Total Jam Kerja</th>
              <th>Total Terlambat (Jam:Min:Det)</th>
            </tr>
          </thead>
          <tbody>
            ${rekap.detail.map(r => `
              <tr>
                ${isAdmin ? `<td style="font-weight: 600; text-align: left; padding: 12px;">${r.nama}</td>` : ''}
                <td style="text-align: center; font-weight: 700;">${r.hariKerja} Hari</td>
                <td style="font-weight: 700; color: var(--success); text-align: center;">${r.jamKerja}</td>
                <td style="font-weight: 700; color: ${r.terlambatMinutes > 0 ? 'var(--danger)' : 'var(--text-muted)'}; text-align: center;">${r.terlambat}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding: 12px 16px; font-size: .75rem; color: var(--text-muted); border-top: 1px solid var(--gray-100);">
        Total Ringkasan: <strong>${rekap.detail.length}</strong> Karyawan Terfilter | Total Jam Kerja Kelompok: <strong>${rekap.summary.totalJamKerja}</strong>
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
        <p>Tidak ada data ${jenis.toUpperCase()} untuk filter yang dipilih</p>
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
              ${isAdmin ? '<th style="text-align: left; padding: 12px;">Nama Karyawan</th>' : ''}
              <th>Tanggal Pengajuan</th>
              <th>Rentang Waktu</th>
              <th>Jumlah Hari</th>
              <th style="text-align: left;">Alasan Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${pengajuanData.map(p => `
              <tr>
                ${isAdmin ? `<td style="font-weight: 600; text-align: left; padding: 12px;">${p.nama || '-'}</td>` : ''}
                <td style="text-align: center;">${p.tanggal_pengajuan || '-'}</td>
                <td style="text-align: center; font-size: 0.8rem;">${p.tanggal_mulai || '-'} s/d ${p.tanggal_selesai || '-'}</td>
                <td style="text-align: center; font-weight: 700; color: var(--primary);">${p.jumlah_hari || 1} Hari</td>
                <td style="text-align: left; color: var(--text-muted); font-size: 0.8rem;">${p.alasan || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding: 12px 16px; font-size: .75rem; color: var(--text-muted); border-top: 1px solid var(--gray-100);">
        Total: <strong>${pengajuanData.length}</strong> Record data ${jenis} yang disetujui.
      </div>
    </div>
  `

  el.innerHTML = tableHtml
}

/* ===============================================================
   DOWNLOAD EXCEL MULTI-TAB & MULTI-FILTER
=============================================================== */
window.downloadExcelRekap = function () {
  if (typeof XLSX === 'undefined') {
    showToast('Library Excel (XLSX) belum siap dimuat.', 'warning')
    return
  }

  const tab = window._currentRekapTab || 'absensi'
  const tglDari = document.getElementById('filterDari')?.value || 'Mulai'
  const tglSampai = document.getElementById('filterSampai')?.value || 'Selesai'
  const namaInput = document.getElementById('filterNama')?.value?.trim() || 'Semua-Karyawan'

  if (tab === 'absensi') {
    if (!window._currentRekapData || !window._currentRekapData.length) {
      showToast('Tidak ada data absensi untuk didownload', 'info')
      return
    }

    const dataExcel = window._currentRekapData.map(r => ({
      'Nama Karyawan': r.nama,
      'Total Hari Kerja': r.hariKerja,
      'Total Jam Kerja (HH:MM:SS)': r.jamKerja,
      'Total Durasi Terlambat': r.terlambat,
    }))

    const ws = XLSX.utils.json_to_sheet(dataExcel)
    const wb = XLSX.utils.book_new()
    ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 25 }, { wch: 22 }]

    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Jam Kerja')
    XLSX.writeFile(wb, `Rekap_Absensi_${namaInput}_(${tglDari}_to_${tglSampai}).xlsx`)
  } else {
    // Jalankan download laporan bulk khusus Tab Izin/Cuti/Sakit
    if (!window._currentPengajuanData || !window._currentPengajuanData.length) {
      showToast(`Tidak ada record data ${tab} untuk diunduh.`, 'info');
      return
    }

    const dataExcel = window._currentPengajuanData.map(p => ({
      'Nama Karyawan': p.nama,
      'Tanggal Input Dokumen': p.tanggal_pengajuan,
      'Mulai Izin': p.tanggal_mulai,
      'Selesai Izin': p.tanggal_selesai,
      'Durasi (Hari)': p.jumlah_hari,
      'Keterangan Alasan': p.alasan,
    }))

    const ws = XLSX.utils.json_to_sheet(dataExcel)
    const wb = XLSX.utils.book_new()
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 35 }]

    XLSX.utils.book_append_sheet(wb, ws, `Data ${tab}`)
    XLSX.writeFile(wb, `Laporan_Pengajuan_${tab.toUpperCase()}_${namaInput}_(${tglDari}_to_${tglSampai}).xlsx`)
  }
}

/* ===============================================================
   SHOW DETAIL MODAL INDIVIDU (POPUP DIAGRAM KARYAWAN)
=============================================================== */
window.showDetailModal = function (tipe) {
  const data = window._currentRekapData || []
  if (!data.length) {
    showToast('Tidak ada ringkasan data yang bisa ditampilkan.', 'info')
    return
  }

  let modalTitle = ''
  let tableHtml = ''

  if (tipe === 'hariKerja') {
    modalTitle = '📅 Detail Kehadiran Hari Kerja per Staff'
    tableHtml = `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid var(--primary); background: #f8fafc;">
            <th style="padding: 10px; text-align: left; font-weight: 800;">Nama Karyawan</th>
            <th style="padding: 10px; text-align: center; font-weight: 800;">Hari Kerja</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(r => `
            <tr style="border-bottom: 1px solid var(--gray-200);">
              <td style="padding: 10px; font-weight:600;">${r.nama}</td>
              <td style="padding: 10px; text-align: center; font-weight: 700; color: var(--primary);">${r.hariKerja} Hari</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  } else if (tipe === 'jamKerja') {
    modalTitle = '⏰ Akumulasi Jam Kerja Efektif Karyawan'
    tableHtml = `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid var(--success); background: #f8fafc;">
            <th style="padding: 10px; text-align: left; font-weight: 800;">Nama Karyawan</th>
            <th style="padding: 10px; text-align: center; font-weight: 800;">Total Waktu</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(r => `
            <tr style="border-bottom: 1px solid var(--gray-200);">
              <td style="padding: 10px; font-weight:600;">${r.nama}</td>
              <td style="padding: 10px; text-align: center; font-weight: 700; color: var(--success);">${r.jamKerja}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  } else if (tipe === 'terlambat') {
    modalTitle = '⏳ Log Pelanggaran Menit Keterlambatan'
    tableHtml = `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid var(--warning); background: #f8fafc;">
            <th style="padding: 10px; text-align: left; font-weight: 800;">Nama Karyawan</th>
            <th style="padding: 10px; text-align: center; font-weight: 800;">Durasi Terlambat</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(r => `
            <tr style="border-bottom: 1px solid var(--gray-200);">
              <td style="padding: 10px; font-weight:600;">${r.nama}</td>
              <td style="padding: 10px; text-align: center; font-weight: 700; color: ${r.terlambatMinutes > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${r.terlambat}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  }

  let modal = document.getElementById('rekapDetailModal')
  if (modal) modal.remove()

  const modalBg = document.createElement('div')
  modalBg.id = 'rekapDetailModal'
  modalBg.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;
  `

  const modalBox = document.createElement('div')
  modalBox.style.cssText = `
    background: white; border-radius: 16px; padding: 24px; max-width: 600px;
    width: 90%; max-height: 70vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  `

  modalBox.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="font-size: 1.1rem; font-weight: 800; margin: 0;">${modalTitle}</h3>
      <button onclick="document.getElementById('rekapDetailModal').remove()"
        style="background: none; border: none; font-size: 1.4rem; cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
        ✕
      </button>
    </div>
    <div style="border-top: 1px solid var(--gray-200); padding-top: 16px;">
      ${tableHtml}
    </div>
  `

  modalBg.appendChild(modalBox)
  modalBg.addEventListener('click', (e) => {
    if (e.target === modalBg) modalBg.remove()
  })

  document.body.appendChild(modalBg)
}
