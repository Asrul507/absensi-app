import { supabase } from './supabase.js'

/* ===============================================================
   RENDER REKAP ABSENSI
   Admin: lihat semua karyawan + filter
   Staff: lihat diri sendiri
=============================================================== */
export async function renderRekap(user) {
  const content = document.getElementById('content')
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-chart-bar"></i> Rekap Absensi</h2>
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

    <!-- SUMMARY CARDS -->
    <div id="summaryCards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px;">
      <div class="card fade-up" style="padding: 16px; text-align: center;">
        <div style="font-size: .7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Total Absensi</div>
        <div style="font-size: 1.8rem; font-weight: 900; color: var(--primary);" id="totalAbsensi">-</div>
      </div>
      <div class="card fade-up" style="padding: 16px; text-align: center;">
        <div style="font-size: .7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Hadir</div>
        <div style="font-size: 1.8rem; font-weight: 900; color: var(--success);" id="totalHadir">-</div>
      </div>
      <div class="card fade-up" style="padding: 16px; text-align: center;">
        <div style="font-size: .7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Terlambat</div>
        <div style="font-size: 1.8rem; font-weight: 900; color: var(--warning);" id="totalTerlambat">-</div>
      </div>
      <div class="card fade-up" style="padding: 16px; text-align: center;">
        <div style="font-size: .7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Ijin/Sakit/Cuti</div>
        <div style="font-size: 1.8rem; font-weight: 900; color: var(--info);" id="totalIzin">-</div>
      </div>
      <div class="card fade-up" style="padding: 16px; text-align: center;">
        <div style="font-size: .7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Tidak Absen</div>
        <div style="font-size: 1.8rem; font-weight: 900; color: var(--danger);" id="totalTidakAbsen">-</div>
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

  // Load initial data
  await applyRekapFilter(user)
}

/* ===============================================================
   APPLY FILTER & LOAD REKAP
=============================================================== */
window.applyRekapFilter = async function (user) {
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  const namaPencarian = document.getElementById('filterNama')?.value?.trim() || ''
  const dari = document.getElementById('filterDari')?.value
  const sampai = document.getElementById('filterSampai')?.value

  try {
    // Ambil data absensi sesuai filter
    let query = supabase
      .from('absensi')
      .select('*')
      .order('tanggal', { ascending: false })

    if (!isAdmin) {
      query = query.eq('nama', user.nama_lengkap)
    } else if (namaPencarian) {
      query = query.ilike('nama', `%${namaPencarian}%`)
    }

    if (dari) query = query.gte('tanggal', dari)
    if (sampai) query = query.lte('tanggal', sampai)

    const { data: absensiData, error } = await query

    if (error) throw error

    // Ambil data pengajuan (cuti/sakit/izin) sesuai filter
    let queryPengajuan = supabase
      .from('pengajuan')
      .select('*')
      .eq('status', 'approved')
      .in('jenis', ['cuti', 'sakit', 'izin'])

    if (!isAdmin) {
      queryPengajuan = queryPengajuan.eq('user_id', user.id)
    } else if (namaPencarian) {
      // Filter by user name (perlu join, tapi simplified: fetch semua then filter)
    }

    if (dari) queryPengajuan = queryPengajuan.gte('tanggal_pengajuan', dari)
    if (sampai) queryPengajuan = queryPengajuan.lte('tanggal_pengajuan', sampai)

    const { data: pengajuanData } = await queryPengajuan

    // Hitung summary & detail
    const rekap = calculateRekap(absensiData || [], pengajuanData || [], isAdmin, user.nama_lengkap)

    // Update summary cards
    document.getElementById('totalAbsensi').textContent = rekap.summary.total
    document.getElementById('totalHadir').textContent = rekap.summary.hadir
    document.getElementById('totalTerlambat').textContent = rekap.summary.terlambat
    document.getElementById('totalIzin').textContent = rekap.summary.izinSakitCuti
    document.getElementById('totalTidakAbsen').textContent = rekap.summary.tidakAbsen

    // Render detail table
    renderRekapTable(rekap, isAdmin)

  } catch (err) {
    console.error('Error load rekap:', err)
    document.getElementById('rekapDetail').innerHTML = `
      <div class="card"><p class="text-danger">Error: ${err.message}</p></div>
    `
  }
}

/* ===============================================================
   CALCULATE REKAP
=============================================================== */
function calculateRekap(absensiData, pengajuanData, isAdmin, currentUserName) {
  const detail = []
  const summary = {
    total: 0,
    hadir: 0,
    terlambat: 0,
    izinSakitCuti: 0,
    tidakAbsen: 0
  }

  // Group by karyawan (for admin) or keep single record (for staff)
  const groupedByName = {}
  absensiData.forEach(a => {
    if (!groupedByName[a.nama]) groupedByName[a.nama] = []
    groupedByName[a.nama].push(a)
  })

  // Count pengajuan by user/date range
  const pengajuanByName = {}
  pengajuanData.forEach(p => {
    if (!pengajuanByName[p.user_id]) pengajuanByName[p.user_id] = []
    pengajuanByName[p.user_id].push(p)
  })

  // Process each karyawan
  Object.keys(groupedByName).forEach(nama => {
    const absenList = groupedByName[nama]
    let hadir = 0, terlambat = 0, tidakAbsen = 0

    absenList.forEach(a => {
      summary.total++
      if (a.status_masuk === 'Terlambat') {
        terlambat++
        summary.terlambat++
      } else if (a.waktu_masuk) {
        hadir++
        summary.hadir++
      } else {
        tidakAbsen++
        summary.tidakAbsen++
      }
    })

    detail.push({
      nama,
      hadir,
      terlambat,
      tidakAbsen,
      total: absenList.length
    })
  })

  // Count izin/sakit/cuti (simplified: count by status)
  summary.izinSakitCuti = pengajuanData.length

  return { detail, summary }
}

/* ===============================================================
   RENDER REKAP TABLE
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
              <th>Hadir</th>
              <th>Terlambat</th>
              <th>Tidak Absen</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rekap.detail.map(r => `
              <tr>
                ${isAdmin ? `<td style="font-weight: 600;">${r.nama}</td>` : ''}
                <td>
                  <span class="badge badge-green">${r.hadir}</span>
                </td>
                <td>
                  <span class="badge badge-yellow">${r.terlambat}</span>
                </td>
                <td>
                  <span class="badge badge-red">${r.tidakAbsen}</span>
                </td>
                <td style="font-weight: 700;">${r.total}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding: 10px 16px; font-size: .75rem; color: var(--text-muted);
        border-top: 1px solid var(--gray-100);">
        Total Karyawan: <strong>${rekap.detail.length}</strong>
      </div>
    </div>
  `

  el.innerHTML = tableHtml
}
