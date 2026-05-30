import { supabase } from './supabase.js'
import { toJamLokal, getTodayLokal, getDurasiMenit } from './timezone.js'
import { showToast } from './feedback.js'
import { canApproveAttendance, formatAttendanceStatus, RADIUS_STATUS } from './attendance-approval.js'

export async function renderRekapInOut(user) {
  const content = document.getElementById('content')
  const isAdmin = canApproveAttendance(user)

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-clock"></i> Rekap In/Out</h2>
      <button class="btn-primary btn-sm" onclick="downloadExcelRekapInOut()" style="display: ${isAdmin ? 'inline-block' : 'none'};">
        <i class="fa fa-download"></i> Excel
      </button>
    </div>

    <div id="rekapInOutView">
      <div id="namaListRekap" style="display: ${isAdmin ? 'block' : 'none'};" class="fade-up">
        <div class="card" style="padding: 16px; margin-bottom: 12px;">
          <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">
            Pilih Karyawan
          </div>
          <div id="namaListRekapContainer" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="card" style="text-align: center; padding: 28px;">
              <i class="fa fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
            </div>
          </div>
        </div>
      </div>

      <div id="detailViewRekap" style="display: ${isAdmin ? 'none' : 'block'};">
        ${isAdmin ? `<button onclick="backToNamaListRekap()" class="btn-secondary btn-sm" style="margin-bottom: 12px;"><i class="fa fa-arrow-left"></i> Kembali</button>` : ''}

        <div class="card fade-up" style="padding: 14px 18px; margin-bottom: 16px;">
          <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
            <div style="flex: 1; min-width: 130px;">
              <label style="font-size: .7rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px;">Dari Tanggal</label>
              <input type="date" id="filterDariRekap"
                style="width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                  font-size: .85rem; outline: none; font-family: inherit; color: var(--text);">
            </div>
            <div style="flex: 1; min-width: 130px;">
              <label style="font-size: .7rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px;">Sampai Tanggal</label>
              <input type="date" id="filterSampaiRekap"
                style="width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                  font-size: .85rem; outline: none; font-family: inherit; color: var(--text);">
            </div>
            <button class="btn-primary btn-sm" onclick="applyRekapInOutFilter(window.currentUser)" style="align-self: flex-end; white-space: nowrap;">
              <i class="fa fa-search"></i> Cari
            </button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div class="card fade-up" style="padding: 14px; text-align: center;">
            <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Total Records</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: var(--primary);" id="totalRecordsRekap">-</div>
          </div>
          <div class="card fade-up" style="padding: 14px; text-align: center;">
            <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Masuk</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: var(--success);" id="totalMasukRekap">-</div>
          </div>
          <div class="card fade-up" style="padding: 14px; text-align: center;">
            <div style="font-size: .68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Tidak Masuk</div>
            <div style="font-size: 1.6rem; font-weight: 900; color: var(--danger);" id="totalTidakMasukRekap">-</div>
          </div>
        </div>

        <div id="rekapInOutDetail" class="fade-up">
          <div class="card" style="text-align: center; padding: 28px;">
            <i class="fa fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
            <p style="color: var(--text-muted); margin-top: 8px; font-size: .85rem;">Memuat data...</p>
          </div>
        </div>
      </div>
    </div>
  `

  window._isAdminRekapInOut = isAdmin
  window._selectedRekapKaryawan = null

  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  if (isAdmin) {
    await loadNamaListRekap()
  } else {
    document.getElementById('filterDariRekap').value = firstDay.toISOString().split('T')[0]
    document.getElementById('filterSampaiRekap').value = lastDay.toISOString().split('T')[0]
    window._selectedRekapKaryawan = user.nama_lengkap
    await applyRekapInOutFilter(user)
  }
}

async function loadNamaListRekap() {
  const container = document.getElementById('namaListRekapContainer')
  if (!container) return

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, nama_lengkap')
      .eq('status_akun', 'Aktif')
      .order('nama_lengkap', { ascending: true })

    if (error) throw error

    if (!profiles?.length) {
      container.innerHTML = `<div class="empty-state" style="padding: 28px;"><i class="fa fa-inbox"></i><p>Tidak ada karyawan aktif</p></div>`
      return
    }

    let html = ''
    profiles.forEach(p => {
      html += `
        <button onclick="selectKaryawanRekap('${p.nama_lengkap}')" 
          style="padding: 12px 16px; background: #fff; border: 1.5px solid var(--border); border-radius: var(--r-md);
            text-align: left; font-weight: 600; color: var(--text); cursor: pointer; transition: all 0.2s;
            display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span>${p.nama_lengkap}</span>
          <i class="fa fa-chevron-right" style="color: var(--text-muted); font-size: .85rem;"></i>
        </button>
      `
    })

    container.innerHTML = html

  } catch (err) {
    container.innerHTML = `<div class="card"><p style="color: var(--danger);">Error: ${err.message}</p></div>`
  }
}

window.selectKaryawanRekap = async function (namaKaryawan) {
  window._selectedRekapKaryawan = namaKaryawan

  document.getElementById('namaListRekap').style.display = 'none'
  document.getElementById('detailViewRekap').style.display = 'block'

  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  document.getElementById('filterDariRekap').value = firstDay.toISOString().split('T')[0]
  document.getElementById('filterSampaiRekap').value = lastDay.toISOString().split('T')[0]

  await applyRekapInOutFilter(window.currentUser)
}

window.backToNamaListRekap = function () {
  document.getElementById('namaListRekap').style.display = 'block'
  document.getElementById('detailViewRekap').style.display = 'none'
  window._selectedRekapKaryawan = null
}

window.applyRekapInOutFilter = async function (user) {
  const isAdmin = window._isAdminRekapInOut
  const dari = document.getElementById('filterDariRekap')?.value
  const sampai = document.getElementById('filterSampaiRekap')?.value

  try {
    let query = supabase
      .from('absensi')
      .select('*')
      .eq('status_absensi', 'COMPLETE')
      .order('tanggal', { ascending: false })

    if (window._selectedRekapKaryawan) {
      query = query.eq('nama', window._selectedRekapKaryawan)
    } else if (!isAdmin) {
      query = query.eq('nama', user.nama_lengkap)
    }

    if (dari) query = query.gte('tanggal', dari)
    if (sampai) query = query.lte('tanggal', sampai)

    const { data: absensiData, error } = await query
    if (error) throw error

    const hasil = calculateRekapInOut(absensiData || [], isAdmin, user.nama_lengkap)

    document.getElementById('totalRecordsRekap').textContent = hasil.summary.total
    document.getElementById('totalMasukRekap').textContent = hasil.summary.masuk
    document.getElementById('totalTidakMasukRekap').textContent = hasil.summary.tidakMasuk

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

    const jamMasuk = a.waktu_masuk ? toJamLokal(a.waktu_masuk) : '-'
    const jamPulang = a.waktu_pulang ? toJamLokal(a.waktu_pulang) : '-'

    let totalJam = '-'
    if (a.waktu_masuk && a.waktu_pulang) {
      const durationMinutes = getDurasiMenit(a.waktu_masuk, a.waktu_pulang)
      if (durationMinutes !== null) {
        const jam = Math.floor(durationMinutes / 60)
        const menit = durationMinutes % 60
        totalJam = `${jam}h ${menit}m`
      }
    }

    const approvalStatus = a.status_absensi || 'OPEN'
    const statusKehadiran = a.status_kehadiran || (approvalStatus === 'COMPLETE' ? 'HADIR' : 'MENUNGGU_VERIFIKASI')
    const radiusStatus = a.radius_status || 'VALID'
    const shiftLabel = a.nama_shift || a.shift_code || a.kode_shift || `${a.jam_jadwal_masuk || '-'} - ${a.jam_jadwal_pulang || '-'}`

    // Buat keterangan dinamis berdasarkan data menit riil Supabase
    let keteranganDetail = approvalStatus === 'OPEN' ? 'Menunggu Approval' : (a.waktu_masuk ? (a.waktu_pulang ? 'Complete' : 'Belum Pulang') : 'Tidak Absen')
    
    if (a.status_masuk === 'Terlambat' && a.menit_terlambat > 0) {
      keteranganDetail += ` (Terlambat ${a.menit_terlambat}m)`
    }
    if (a.status_pulang === 'Pulang Cepat' && a.menit_pulang_cepat > 0) {
      keteranganDetail += ` (Pulang Cepat ${a.menit_pulang_cepat}m)`
    }

    detail.push({
      nama: a.nama,
      tanggal: a.tanggal,
      shift: shiftLabel,
      jamMasuk,
      jamPulang,
      totalJam,
      status: approvalStatus === 'COMPLETE' ? 'Complete' : 'Menunggu Approval',
      approvalStatus,
      statusKehadiran,
      radiusStatus,
      keteranganText: keteranganDetail
    })
  })

  return { detail, summary }
}

function approvalBadge(status) {
  if (status === 'COMPLETE') return '<span style="padding:4px 10px;border-radius:20px;font-size:.75rem;font-weight:800;background:#dcfce7;color:#166534;">COMPLETE</span>'
  return '<span style="padding:4px 10px;border-radius:20px;font-size:.75rem;font-weight:800;background:#fffbeb;color:#92400e;">Menunggu Approval</span>'
}

function radiusBadge(status) {
  if (status === RADIUS_STATUS.OUT_RADIUS) return '<span style="padding:4px 10px;border-radius:20px;font-size:.75rem;font-weight:800;background:#fee2e2;color:#991b1b;">OUT_RADIUS</span>'
  return '<span style="padding:4px 10px;border-radius:20px;font-size:.75rem;font-weight:800;background:#e8f5e9;color:#166534;">VALID</span>'
}

function renderRekapInOutTable(detail, isAdmin) {
  const el = document.getElementById('rekapInOutDetail')
  if (!el) return

  window._rekapInOutDetail = detail

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
              <th>Shift</th>
              <th>Jam CI</th>
              <th>Jam CO</th>
              <th>Status Approval</th>
              <th>Status Kehadiran</th>
              <th>Radius</th>
              <th>Total Jam</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${detail.map(d => `
              <tr>
                ${isAdmin ? `<td style="font-weight: 600;">${d.nama}</td>` : ''}
                <td>${d.tanggal}</td>
                <td>${d.shift}</td>
                <td style="font-weight: 700; color: var(--success);">${d.jamMasuk}</td>
                <td style="font-weight: 700; color: var(--primary);">${d.jamPulang}</td>
                <td>${approvalBadge(d.approvalStatus)}</td>
                <td>${formatAttendanceStatus(d.statusKehadiran)}</td>
                <td>${radiusBadge(d.radiusStatus)}</td>
                <td>${d.totalJam}</td>
                <td>${d.keteranganText}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  el.innerHTML = tableHtml
}

window.downloadExcelRekapInOut = function () {
  if (!window._rekapInOutDetail || !window._rekapInOutDetail.length) {
    showToast('Tidak ada data untuk didownload', 'info')
    return
  }

  if (typeof XLSX === 'undefined') {
    showToast('Library XLSX belum dimuat', 'warning')
    return
  }

  const rows = window._rekapInOutDetail.map(d => ({
    'Nama': d.nama,
    'Tanggal': d.tanggal,
    'Shift': d.shift,
    'Jam CI': d.jamMasuk,
    'Jam CO': d.jamPulang,
    'Status Approval': d.approvalStatus,
    'Status Kehadiran': formatAttendanceStatus(d.statusKehadiran),
    'Radius Status': d.radiusStatus,
    'Total Jam': d.totalJam,
    'Keterangan': d.keteranganText
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()

  ws['!cols'] = [
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 28 }
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Rekap In Out')
  XLSX.writeFile(wb, `rekap-inout-${window._selectedRekapKaryawan || 'all'}-${getTodayLokal()}.xlsx`)
}
