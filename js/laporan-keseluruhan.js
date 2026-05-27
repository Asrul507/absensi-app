/**
 * js/laporan-keseluruhan.js
 * ============================================================
 * Laporan Absensi Keseluruhan — Genius HR
 * Menampilkan jam masuk, jam pulang, keterlambatan,
 * total keterlambatan per staff, total jam kerja per staff,
 * dan status radius (in/out) secara keseluruhan.
 * Tersedia filter tanggal, nama, dan export Excel.
 * ============================================================
 */

import { supabase } from './supabase.js'
import { toJamLokal, getDurasiMenit } from './timezone.js'
import { showToast } from './feedback.js'

/* ===== HELPER: Format waktu dari ISO string — pakai timezone dari titik radius ===== */
function formatJam(isoStr) {
  return toJamLokal(isoStr)
}

/* ===== HELPER: Hitung durasi kerja dari 2 ISO string ===== */
function hitungDurasiKerja(waktuMasuk, waktuPulang) {
  if (!waktuMasuk || !waktuPulang) return { menit: 0, label: '-' }
  const menit = getDurasiMenit(waktuMasuk, waktuPulang) ?? 0
  return { menit, label: mntToHM(menit) }
}

function mntToReadable(totalMenit) {
  const m = Number.parseInt(totalMenit, 10) || 0
  if (m <= 0) return '0m'
  if (m < 60) return `${m}m`
  const jam = Math.floor(m / 60)
  const menit = m % 60
  return menit ? `${jam}j ${menit}m` : `${jam}j`
}

/* ===== HELPER: Format total menit menjadi jam-menit (mis. 8j 30m) ===== */
const mntToHM = (totalMenit) => {
  const m = Number.parseInt(totalMenit, 10) || 0
  if (m <= 0) return '-'
  const jam = Math.floor(m / 60)
  const menit = m % 60
  if (jam <= 0) return `${menit}m`
  return menit ? `${jam}j ${menit}m` : `${jam}j`
}

// Fallback agar fungsi tetap tersedia jika dipanggil dari konteks global lama
if (typeof window !== 'undefined') {
  window.mntToHM = window.mntToHM || mntToHM
}



/* ===== HELPER: Badge radius HTML ===== */
function badgeRadius(status) {
  if (!status) return '<span style="font-size:.72rem;color:var(--text-muted);">-</span>'
  const s = status.toLowerCase()
  if (s.includes('dalam') || s === 'in' || s.includes('valid') || s.includes('ok')) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:.7rem;font-weight:800;background:var(--success-light);color:#14532d;border:1px solid var(--success-mid);">
      <i class="fa fa-circle-check"></i> IN
    </span>`
  }
  if (s.includes('luar') || s === 'out' || s.includes('jauh') || s.includes('radius')) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:.7rem;font-weight:800;background:var(--danger-light);color:#7f1d1d;border:1px solid var(--danger-mid);">
      <i class="fa fa-circle-xmark"></i> OUT
    </span>`
  }
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:.7rem;font-weight:800;background:var(--warning-light);color:var(--warning-dark);border:1px solid var(--warning-mid);">
    <i class="fa fa-circle-question"></i> ${status}
  </span>`
}

/* ===== HELPER: Badge status keterangan ===== */
function badgeStatus(a) {
  const hasMasuk  = !!a.waktu_masuk
  const hasPulang = !!a.waktu_pulang
  const terlambat = a.status_masuk === 'Terlambat' && (parseInt(a.menit_terlambat) || 0) > 0

  if (!hasMasuk) {
    return `<span style="padding:3px 9px;border-radius:20px;font-size:.7rem;font-weight:800;background:var(--danger-light);color:#7f1d1d;border:1px solid var(--danger-mid);">Tidak Hadir</span>`
  }
  if (!hasPulang) {
    return `<span style="padding:3px 9px;border-radius:20px;font-size:.7rem;font-weight:800;background:var(--warning-light);color:var(--warning-dark);border:1px solid var(--warning-mid);">Belum Pulang</span>`
  }
  if (terlambat) {
    return `<span style="padding:3px 9px;border-radius:20px;font-size:.7rem;font-weight:800;background:var(--danger-light);color:#7f1d1d;border:1px solid var(--danger-mid);">Terlambat ${a.menit_terlambat}m</span>`
  }
  return `<span style="padding:3px 9px;border-radius:20px;font-size:.7rem;font-weight:800;background:var(--success-light);color:#14532d;border:1px solid var(--success-mid);">Tepat Waktu</span>`
}

/* ================================================================
   RENDER UTAMA — Dipanggil dari navigate()
================================================================ */
export async function renderLaporanKeseluruhan(user) {
  const content = document.getElementById('content')
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  // Default bulan ini
  const now      = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const fdStr    = firstDay.toISOString().split('T')[0]
  const ldStr    = lastDay.toISOString().split('T')[0]

  content.innerHTML = `
    <!-- ===== HEADER ===== -->
    <div class="page-header fade-up">
      <h2><i class="fa fa-file-lines"></i> Laporan Absensi Keseluruhan</h2>
      <button class="btn-primary btn-sm" onclick="window.downloadLaporanExcel()">
        <i class="fa fa-download"></i> Excel
      </button>
    </div>

    <!-- ===== FILTER ===== -->
    <div class="card fade-up" style="padding:14px 18px;margin-bottom:14px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        ${isAdmin ? `
          <div style="flex:2;min-width:150px;">
            <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Nama Karyawan</label>
            <input id="lkFilterNama" placeholder="Ketik nama (kosong = semua)…"
              style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;color:var(--text);background:var(--white);">
          </div>
        ` : ''}
        <div style="flex:1;min-width:130px;">
          <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Dari Tanggal</label>
          <input type="date" id="lkFilterDari" value="${fdStr}"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;color:var(--text);">
        </div>
        <div style="flex:1;min-width:130px;">
          <label style="font-size:.7rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px;">Sampai Tanggal</label>
          <input type="date" id="lkFilterSampai" value="${ldStr}"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;color:var(--text);">
        </div>
        <button class="btn-primary btn-sm" onclick="window.applyLaporanFilter()" style="align-self:flex-end;white-space:nowrap;">
          <i class="fa fa-search"></i> Tampilkan
        </button>
      </div>
    </div>

    <!-- ===== TAB SWITCH ===== -->
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;" class="fade-up">
      <button id="lkTabRinci" class="btn-primary btn-sm" onclick="window.switchLaporanTab('rinci')">
        <i class="fa fa-table-list"></i> Detail Per Hari
      </button>
      <button id="lkTabRekap" class="btn-secondary btn-sm" onclick="window.switchLaporanTab('rekap')">
        <i class="fa fa-chart-bar"></i> Rekap Per Staff
      </button>
    </div>

    <!-- ===== SUMMARY CARDS ===== -->
    <div id="lkSummaryCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:14px;" class="fade-up">
      <div class="card" style="padding:14px;text-align:center;">
        <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px;">Total Records</div>
        <div id="lkSumTotal" style="font-size:1.7rem;font-weight:900;color:var(--primary);">-</div>
      </div>
      <div class="card" style="padding:14px;text-align:center;">
        <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px;">Tepat Waktu</div>
        <div id="lkSumTepatWaktu" style="font-size:1.7rem;font-weight:900;color:var(--success);">-</div>
      </div>
      <div class="card" style="padding:14px;text-align:center;">
        <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px;">Terlambat</div>
        <div id="lkSumTerlambat" style="font-size:1.7rem;font-weight:900;color:var(--danger);">-</div>
      </div>
      <div class="card" style="padding:14px;text-align:center;">
        <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px;">Tidak Hadir</div>
        <div id="lkSumTidakHadir" style="font-size:1.7rem;font-weight:900;color:var(--warning);">-</div>
      </div>
      <div class="card" style="padding:14px;text-align:center;">
        <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px;">Radius OUT</div>
        <div id="lkSumRadiusOut" style="font-size:1.7rem;font-weight:900;color:#7c3aed;">-</div>
      </div>
    </div>

    <!-- ===== AREA TABEL ===== -->
    <div id="lkTableArea" class="fade-up-1">
      <div class="card" style="text-align:center;padding:32px;">
        <i class="fa fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i>
        <p style="color:var(--text-muted);margin-top:8px;font-size:.85rem;">Memuat data laporan…</p>
      </div>
    </div>
  `

  // State global modul ini
  window._lkUser      = user
  window._lkIsAdmin   = isAdmin
  window._lkTabAktif  = 'rinci'
  window._lkDataRaw   = []

  await window.applyLaporanFilter()
}

/* ================================================================
   SWITCH TAB
================================================================ */
window.switchLaporanTab = function (tab) {
  window._lkTabAktif = tab
  document.getElementById('lkTabRinci').className = tab === 'rinci' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  document.getElementById('lkTabRekap').className = tab === 'rekap' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
  renderLaporanArea()
}

/* ================================================================
   APPLY FILTER & LOAD DATA
================================================================ */
window.applyLaporanFilter = async function () {
  const isAdmin = window._lkIsAdmin
  const user    = window._lkUser
  const dari    = document.getElementById('lkFilterDari')?.value
  const sampai  = document.getElementById('lkFilterSampai')?.value
  const nama    = document.getElementById('lkFilterNama')?.value?.trim() || ''

  const tableArea = document.getElementById('lkTableArea')
  if (tableArea) {
    tableArea.innerHTML = `
      <div class="card" style="text-align:center;padding:32px;">
        <i class="fa fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i>
        <p style="color:var(--text-muted);margin-top:8px;font-size:.85rem;">Memuat data…</p>
      </div>`
  }

  try {
    let query = supabase
      .from('absensi')
      .select('*')
      .order('tanggal', { ascending: false })
      .order('waktu_masuk', { ascending: true })

    if (!isAdmin) {
      query = query.eq('nama', user.nama_lengkap)
    } else if (nama) {
      query = query.ilike('nama', `%${nama}%`)
    }

    if (dari)   query = query.gte('tanggal', dari)
    if (sampai) query = query.lte('tanggal', sampai)

    const { data, error } = await query
    if (error) throw error

    window._lkDataRaw = data || []
    updateSummaryCards(window._lkDataRaw)
    renderLaporanArea()

  } catch (err) {
    console.error('Laporan filter error:', err)
    if (tableArea) {
      tableArea.innerHTML = `<div class="card"><p style="color:var(--danger);padding:16px;">Error: ${err.message}</p></div>`
    }
  }
}

/* ================================================================
   UPDATE SUMMARY CARDS
================================================================ */
function updateSummaryCards(data) {
  let tepatWaktu = 0, terlambat = 0, tidakHadir = 0, radiusOut = 0

  data.forEach(a => {
    if (!a.waktu_masuk) {
      tidakHadir++
    } else if (a.status_masuk === 'Terlambat' && (parseInt(a.menit_terlambat) || 0) > 0) {
      terlambat++
    } else {
      tepatWaktu++
    }

    // Cek radius OUT — periksa kolom status_lokasi / lokasi_masuk / radius_masuk
    const radiusStatus = (a.status_lokasi || a.radius_status || a.lokasi_status || '').toLowerCase()
    if (radiusStatus.includes('luar') || radiusStatus === 'out') radiusOut++
  })

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }
  set('lkSumTotal',      data.length)
  set('lkSumTepatWaktu', tepatWaktu)
  set('lkSumTerlambat',  terlambat)
  set('lkSumTidakHadir', tidakHadir)
  set('lkSumRadiusOut',  radiusOut)
}

/* ================================================================
   RENDER AREA: pilih tab rinci / rekap
================================================================ */
function renderLaporanArea() {
  if (window._lkTabAktif === 'rinci') {
    renderTabRinci(window._lkDataRaw, window._lkIsAdmin)
  } else {
    renderTabRekap(window._lkDataRaw, window._lkIsAdmin)
  }
}

/* ================================================================
   TAB 1 — DETAIL PER HARI
================================================================ */
function renderTabRinci(data, isAdmin) {
  const el = document.getElementById('lkTableArea')
  if (!el) return

  if (!data.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:52px 24px;">
        <i class="fa fa-inbox"></i><p>Tidak ada data untuk filter yang dipilih</p>
      </div>`
    return
  }

  // Simpan referensi untuk export
  window._lkExportRinci = data.map(a => {
    const durasi = hitungDurasiKerja(a.waktu_masuk, a.waktu_pulang)
    const terlambatMnt = (a.status_masuk === 'Terlambat') ? (parseInt(a.menit_terlambat) || 0) : 0
    const radiusM = a.status_lokasi || a.radius_status || a.lokasi_status || '-'
    const radiusP = a.status_lokasi_pulang || a.radius_status_pulang || '-'
    return {
      nama: a.nama || '-',
      tanggal: a.tanggal || '-',
      jamMasuk: formatJam(a.waktu_masuk),
      jamPulang: formatJam(a.waktu_pulang),
      statusMasuk: a.status_masuk || (a.waktu_masuk ? 'Tepat Waktu' : 'Tidak Hadir'),
      menit_terlambat: terlambatMnt,
      totalJamKerja: durasi.label,
      totalMenitKerja: durasi.menit,
      radiusMasuk: radiusM,
      radiusPulang: radiusP
    }
  })

  el.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>No</th>
              ${isAdmin ? '<th>Nama</th>' : ''}
              <th>Tanggal</th>
              <th>Jam Masuk</th>
              <th>Jam Pulang</th>
              <th>Keterangan</th>
              <th>Terlambat</th>
              <th>Jam Kerja</th>
              <th>Radius Masuk</th>
              <th>Radius Pulang</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((a, idx) => {
              const durasi = hitungDurasiKerja(a.waktu_masuk, a.waktu_pulang)
              const terlambatMnt = (a.status_masuk === 'Terlambat') ? (parseInt(a.menit_terlambat) || 0) : 0
              const radiusM = a.status_lokasi || a.radius_status || a.lokasi_status || null
              const radiusP = a.status_lokasi_pulang || a.radius_status_pulang || null
              return `
                <tr>
                  <td class="td-num">${idx + 1}</td>
                  ${isAdmin ? `<td style="font-weight:700;">${a.nama || '-'}</td>` : ''}
                  <td style="white-space:nowrap;">${a.tanggal || '-'}</td>
                  <td style="font-weight:700;color:var(--success);">${formatJam(a.waktu_masuk)}</td>
                  <td style="font-weight:700;color:var(--primary);">${formatJam(a.waktu_pulang)}</td>
                  <td>${badgeStatus(a)}</td>
                  <td style="font-weight:700;color:${terlambatMnt > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
                    ${terlambatMnt > 0 ? mntToReadable(terlambatMnt) : '-'}
                  </td>
                  <td style="font-weight:700;color:${durasi.menit > 0 ? 'var(--primary)' : 'var(--text-muted)'};">
                    ${durasi.label}
                  </td>
                  <td>${badgeRadius(radiusM)}</td>
                  <td>${badgeRadius(radiusP)}</td>
                </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:10px 16px;font-size:.74rem;color:var(--text-muted);border-top:1px solid var(--gray-100);">
        Menampilkan <strong>${data.length}</strong> record absensi
      </div>
    </div>`
}

/* ================================================================
   TAB 2 — REKAP PER STAFF
================================================================ */
function renderTabRekap(data, isAdmin) {
  const el = document.getElementById('lkTableArea')
  if (!el) return

  if (!data.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:52px 24px;">
        <i class="fa fa-inbox"></i><p>Tidak ada data untuk filter yang dipilih</p>
      </div>`
    return
  }

  // Kelompokkan per staff
  const grouped = {}
  data.forEach(a => {
    const key = a.nama || 'Unknown'
    if (!grouped[key]) {
      grouped[key] = {
        nama: key,
        totalHari: 0,
        hadir: 0,
        tidakHadir: 0,
        tepatWaktu: 0,
        terlambatCount: 0,
        totalTerlambatMnt: 0,
        totalKerjaMnt: 0,
        radiusInMasuk: 0,
        radiusOutMasuk: 0,
        radiusInPulang: 0,
        radiusOutPulang: 0,
      }
    }
    const g = grouped[key]
    g.totalHari++

    if (!a.waktu_masuk) {
      g.tidakHadir++
    } else {
      g.hadir++
      const terlambatMnt = (a.status_masuk === 'Terlambat') ? (parseInt(a.menit_terlambat) || 0) : 0
      if (terlambatMnt > 0) {
        g.terlambatCount++
        g.totalTerlambatMnt += terlambatMnt
      } else {
        g.tepatWaktu++
      }

      if (a.waktu_masuk && a.waktu_pulang) {
        const d = hitungDurasiKerja(a.waktu_masuk, a.waktu_pulang)
        g.totalKerjaMnt += d.menit
      }
    }

    // Radius masuk
    const rm = (a.status_lokasi || a.radius_status || a.lokasi_status || '').toLowerCase()
    if (rm.includes('dalam') || rm === 'in' || rm.includes('valid') || rm.includes('ok')) g.radiusInMasuk++
    else if (rm.includes('luar') || rm === 'out') g.radiusOutMasuk++

    // Radius pulang
    const rp = (a.status_lokasi_pulang || a.radius_status_pulang || '').toLowerCase()
    if (rp.includes('dalam') || rp === 'in' || rp.includes('valid') || rp.includes('ok')) g.radiusInPulang++
    else if (rp.includes('luar') || rp === 'out') rp && g.radiusOutPulang++
  })

  const rows = Object.values(grouped).sort((a, b) => a.nama.localeCompare(b.nama))

  // Simpan untuk export
  window._lkExportRekap = rows

  el.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th style="min-width:140px;">Nama Staff</th>
              <th>Total Hari</th>
              <th>Hadir</th>
              <th>Tdk Hadir</th>
              <th>Tepat Waktu</th>
              <th>Terlambat</th>
              <th>Total Terlambat</th>
              <th>Total Jam Kerja</th>
              <th>Radius IN Masuk</th>
              <th>Radius OUT Masuk</th>
              <th>Radius IN Pulang</th>
              <th>Radius OUT Pulang</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, idx) => `
              <tr>
                <td class="td-num">${idx + 1}</td>
                <td style="font-weight:800;">${r.nama}</td>
                <td style="text-align:center;font-weight:700;">${r.totalHari}</td>
                <td style="text-align:center;font-weight:700;color:var(--success);">${r.hadir}</td>
                <td style="text-align:center;font-weight:700;color:${r.tidakHadir > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${r.tidakHadir}</td>
                <td style="text-align:center;font-weight:700;color:var(--success);">${r.tepatWaktu}</td>
                <td style="text-align:center;font-weight:700;color:${r.terlambatCount > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${r.terlambatCount}</td>
                <td style="text-align:center;font-weight:700;color:${r.totalTerlambatMnt > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
                  ${r.totalTerlambatMnt > 0 ? mntToReadable(r.totalTerlambatMnt) : '-'}
                </td>
                <td style="text-align:center;font-weight:700;color:var(--primary);">
                  ${r.totalKerjaMnt > 0 ? mntToHM(r.totalKerjaMnt) : '-'}
                </td>
                <td style="text-align:center;">
                  <span style="font-weight:700;color:var(--success);">${r.radiusInMasuk}</span>
                </td>
                <td style="text-align:center;">
                  <span style="font-weight:700;color:${r.radiusOutMasuk > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${r.radiusOutMasuk}</span>
                </td>
                <td style="text-align:center;">
                  <span style="font-weight:700;color:var(--success);">${r.radiusInPulang}</span>
                </td>
                <td style="text-align:center;">
                  <span style="font-weight:700;color:${r.radiusOutPulang > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${r.radiusOutPulang}</span>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:10px 16px;font-size:.74rem;color:var(--text-muted);border-top:1px solid var(--gray-100);">
        Total <strong>${rows.length}</strong> staff | Total keseluruhan jam kerja: <strong>${mntToHM(rows.reduce((s, r) => s + r.totalKerjaMnt, 0))}</strong>
      </div>
    </div>`
}

/* ================================================================
   DOWNLOAD EXCEL
================================================================ */
window.downloadLaporanExcel = function () {
  if (typeof XLSX === 'undefined') {
    showToast('Library Excel (XLSX) belum dimuat.', 'warning')
    return
  }

  const dari   = document.getElementById('lkFilterDari')?.value   || ''
  const sampai = document.getElementById('lkFilterSampai')?.value || ''
  const nama   = document.getElementById('lkFilterNama')?.value?.trim() || 'Semua'
  const tab    = window._lkTabAktif || 'rinci'

  const wb = XLSX.utils.book_new()

  if (tab === 'rinci') {
    const src = window._lkExportRinci || []
    if (!src.length) { showToast('Tidak ada data untuk didownload.', 'info'); return }

    const dataExcel = src.map((r, i) => ({
      'No':                i + 1,
      'Nama':              r.nama,
      'Tanggal':           r.tanggal,
      'Jam Masuk':         r.jamMasuk,
      'Jam Pulang':        r.jamPulang,
      'Keterangan':        r.statusMasuk,
      'Terlambat (menit)': r.menit_terlambat || 0,
      'Total Jam Kerja':   r.totalJamKerja,
      'Radius Masuk':      r.radiusMasuk,
      'Radius Pulang':     r.radiusPulang
    }))

    const ws = XLSX.utils.json_to_sheet(dataExcel)
    ws['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 }
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Detail Per Hari')

  } else {
    const src = window._lkExportRekap || []
    if (!src.length) { showToast('Tidak ada data untuk didownload.', 'info'); return }

    const dataExcel = src.map((r, i) => ({
      'No':                   i + 1,
      'Nama Staff':           r.nama,
      'Total Hari':           r.totalHari,
      'Hadir':                r.hadir,
      'Tidak Hadir':          r.tidakHadir,
      'Tepat Waktu':          r.tepatWaktu,
      'Jumlah Terlambat':     r.terlambatCount,
      'Total Terlambat':      mntToReadable(r.totalTerlambatMnt),
      'Total Jam Kerja':      mntToHM(r.totalKerjaMnt),
      'Radius IN Masuk':      r.radiusInMasuk,
      'Radius OUT Masuk':     r.radiusOutMasuk,
      'Radius IN Pulang':     r.radiusInPulang,
      'Radius OUT Pulang':    r.radiusOutPulang,
    }))

    const ws = XLSX.utils.json_to_sheet(dataExcel)
    ws['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 10 },
      { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Per Staff')
  }

  const filename = `Laporan_Absensi_${nama}_(${dari}_sd_${sampai}).xlsx`
  XLSX.writeFile(wb, filename)
}
