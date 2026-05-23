import { supabase } from './supabase.js'

function calculateLateDuration(waktu_masuk, jam_masuk_seharusnya) {
  if (!waktu_masuk || !jam_masuk_seharusnya) return 0
  const masuk = new Date(waktu_masuk)
  const jamMasuk = jam_masuk_seharusnya.split(':')
  const jamMasukDate = new Date(masuk.getFullYear(), masuk.getMonth(), masuk.getDate(), jamMasuk[0], jamMasuk[1])
  const diffMs = masuk - jamMasukDate
  return Math.max(0, Math.floor(diffMs / 60000))
}

function calculateEarlyDuration(waktu_pulang, jam_pulang_seharusnya) {
  if (!waktu_pulang || !jam_pulang_seharusnya) return 0
  const pulang = new Date(waktu_pulang)
  const jamPulang = jam_pulang_seharusnya.split(':')
  const jamPulangDate = new Date(pulang.getFullYear(), pulang.getMonth(), pulang.getDate(), jamPulang[0], jamPulang[1])
  const diffMs = jamPulangDate - pulang
  return Math.max(0, Math.floor(diffMs / 60000))
}

export async function renderDaftarAbsensi(user) {
  const content = document.getElementById('content')
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-list-check"></i> Daftar Absensi</h2>
    </div>

    <div id="daftarAbsensiView">
      <!-- INITIAL: List Nama Karyawan -->
      <div id="namaList" class="fade-up">
        <div class="card" style="padding: 16px; margin-bottom: 12px;">
          <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">
            Pilih Karyawan
          </div>
          <div id="namaListContainer" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="card" style="text-align: center; padding: 28px;">
              <i class="fa fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary);"></i>
              <p style="color: var(--text-muted); margin-top: 8px; font-size: .85rem;">Memuat data...</p>
            </div>
          </div>
        </div>
      </div>

      <!-- DETAIL: Filter & Cards -->
      <div id="detailView" style="display: none;">
        <div style="margin-bottom: 12px;">
          <button onclick="backToDaftarList()" class="btn-secondary btn-sm" style="margin-bottom: 12px;">
            <i class="fa fa-arrow-left"></i> Kembali
          </button>
        </div>

        <div class="card fade-up" style="padding: 14px 18px; margin-bottom: 16px;">
          <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
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
            <div style="flex: 1; min-width: 130px;">
              <label style="font-size: .7rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 5px;">Status</label>
              <select id="filterStatus"
                style="width: 100%; padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--r-md);
                  font-size: .85rem; outline: none; font-family: inherit;">
                <option value="">Semua</option>
                <option value="complete">Complete</option>
                <option value="tepat_waktu">Tepat Waktu</option>
                <option value="terlambat">Terlambat</option>
                <option value="belum_pulang">Belum Pulang</option>
                <option value="tidak_absen">Tidak Absen</option>
              </select>
            </div>
            <button class="btn-primary btn-sm" onclick="applyDaftarAbsensiFilter(window.currentUser)" style="align-self: flex-end; white-space: nowrap;">
              <i class="fa fa-search"></i> Cari
            </button>
            <button class="btn-primary btn-sm" onclick="downloadExcelDaftarAbsensi()" style="align-self: flex-end; white-space: nowrap;">
              <i class="fa fa-download"></i> Excel
            </button>
          </div>
        </div>

        <div id="daftarAbsensiCards" style="display: flex; flex-direction: column; gap: 12px;"></div>
      </div>
    </div>
  `

  // Set default date range (current month)
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  window._isAdminDaftarAbsensi = isAdmin
  window._currentDaftarUser = user
  window._daftarAbsensiAllData = []
  window._selectedKaryawan = null

  // Load nama list
  await loadNamaList(isAdmin, user)
}

async function loadNamaList(isAdmin, user) {
  const container = document.getElementById('namaListContainer')

  try {
    let query = supabase.from('profiles').select('id, nama_lengkap').eq('status_akun', 'Aktif')

    if (!isAdmin) {
      query = query.eq('id', user.id)
    }

    const { data: profiles, error } = await query.order('nama_lengkap', { ascending: true })

    if (error) throw error

    if (!profiles?.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 28px;">
          <i class="fa fa-inbox"></i>
          <p>Tidak ada karyawan</p>
        </div>
      `
      return
    }

    let html = ''
    profiles.forEach(p => {
      html += `
        <button onclick="selectKaryawan('${p.nama_lengkap}')" class="btn-list" 
          style="padding: 12px 16px; background: #fff; border: 1.5px solid var(--border); border-radius: var(--r-md);
            text-align: left; font-weight: 600; color: var(--text); cursor: pointer; transition: all 0.2s;
            display: flex; justify-content: space-between; align-items: center;">
          <span>${p.nama_lengkap}</span>
          <i class="fa fa-chevron-right" style="color: var(--text-muted); font-size: .85rem;"></i>
        </button>
      `
    })

    container.innerHTML = html

    // Add hover effect
    document.querySelectorAll('.btn-list').forEach(btn => {
      btn.addEventListener('hover', function() {
        this.style.background = '#f8fafc'
        this.style.borderColor = 'var(--primary)'
      })
    })

  } catch (err) {
    container.innerHTML = `<div class="card"><p style="color: var(--danger);">Error: ${err.message}</p></div>`
  }
}

window.selectKaryawan = async function (namaKaryawan) {
  window._selectedKaryawan = namaKaryawan

  // Hide list, show detail
  document.getElementById('namaList').style.display = 'none'
  document.getElementById('detailView').style.display = 'block'

  // Set date range
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  document.getElementById('filterDari').value = firstDay.toISOString().split('T')[0]
  document.getElementById('filterSampai').value = lastDay.toISOString().split('T')[0]

  // Load data
  await applyDaftarAbsensiFilter(window.currentUser)
}

window.backToDaftarList = function () {
  document.getElementById('namaList').style.display = 'block'
  document.getElementById('detailView').style.display = 'none'
  window._selectedKaryawan = null
}

window.applyDaftarAbsensiFilter = async function (user) {
  const dari = document.getElementById('filterDari')?.value
  const sampai = document.getElementById('filterSampai')?.value
  const statusFilter = document.getElementById('filterStatus')?.value || ''

  try {
    let query = supabase
      .from('absensi')
      .select('*')
      .eq('nama', window._selectedKaryawan)
      .order('tanggal', { ascending: false })

    if (dari) query = query.gte('tanggal', dari)
    if (sampai) query = query.lte('tanggal', sampai)

    const { data: absensiData, error } = await query

    if (error) throw error

    window._daftarAbsensiAllData = absensiData || []

    let filtered = window._daftarAbsensiAllData
    if (statusFilter) {
      filtered = filtered.filter(a => {
        if (statusFilter === 'complete') return a.status_absensi === 'complete'
        if (statusFilter === 'tepat_waktu') return a.status_masuk === 'Tepat Waktu' && a.waktu_masuk
        if (statusFilter === 'terlambat') return a.status_masuk === 'Terlambat'
        if (statusFilter === 'belum_pulang') return a.waktu_masuk && !a.waktu_pulang
        if (statusFilter === 'tidak_absen') return !a.waktu_masuk
        return true
      })
    }

    await renderDaftarAbsensiCards(filtered, user)

  } catch (err) {
    console.error('Error:', err)
    document.getElementById('daftarAbsensiCards').innerHTML = `
      <div class="card"><p style="color: var(--danger);">Error: ${err.message}</p></div>
    `
  }
}

async function renderDaftarAbsensiCards(absensiData, user) {
  const el = document.getElementById('daftarAbsensiCards')

  if (!absensiData.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding: 52px 24px;">
        <i class="fa fa-inbox"></i>
        <p>Tidak ada data untuk filter yang dipilih</p>
      </div>
    `
    return
  }

  let html = ''

  for (const absen of absensiData) {
    // Get shift info
    const { data: jadwal } = await supabase
      .from('jadwal')
      .select('shift_id')
      .eq('tanggal', absen.tanggal)
      .maybeSingle()

    const { data: shiftData } = jadwal?.shift_id
      ? await supabase.from('shift').select('nama_shift, jam_masuk, jam_pulang').eq('id', jadwal.shift_id).maybeSingle()
      : { data: null }

    const shiftName = shiftData?.nama_shift || 'Regular'
    const jamMasukSeharusnya = shiftData?.jam_masuk || '07:00'
    const jamPulangSeharusnya = shiftData?.jam_pulang || '15:00'

    const jamMasuk = absen.waktu_masuk ? new Date(absen.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
    const jamPulang = absen.waktu_pulang ? new Date(absen.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'

    let statusColor = '#f3f4f6'
    let statusTextColor = '#6b7280'
    let statusText = 'Open'

    if (!absen.waktu_masuk) {
      statusColor = '#fee2e2'
      statusTextColor = '#991b1b'
      statusText = 'Tidak Masuk'
    } else if (absen.status_masuk === 'Terlambat') {
      statusColor = '#fef3c7'
      statusTextColor = '#92400e'
      statusText = 'Terlambat'
    } else if (absen.status_masuk === 'Tepat Waktu') {
      statusColor = '#dcfce7'
      statusTextColor = '#166534'
      statusText = 'Tepat Waktu'
    }

    if (!absen.waktu_pulang && absen.waktu_masuk) {
      statusColor = '#dbeafe'
      statusTextColor = '#0284c7'
      statusText = 'Belum Pulang'
    }

    let detailInfo = ''
    if (absen.status_masuk === 'Terlambat' && absen.waktu_masuk) {
      const lateMinutes = calculateLateDuration(absen.waktu_masuk, jamMasukSeharusnya)
      if (lateMinutes > 0) {
        detailInfo += `<div style="font-size: .75rem; color: #dc2626; margin-top: 6px;"><strong><i class="fa fa-clock"></i> Terlambat ${lateMinutes} menit</strong></div>`
      }
    }

    if (absen.waktu_pulang && absen.waktu_masuk) {
      const earlyMinutes = calculateEarlyDuration(absen.waktu_pulang, jamPulangSeharusnya)
      if (earlyMinutes > 0) {
        detailInfo += `<div style="font-size: .75rem; color: #f59e0b; margin-top: 4px;"><strong><i class="fa fa-hourglass-end"></i> Pulang ${earlyMinutes} menit lebih awal</strong></div>`
      }
    }

    html += `
      <div class="card fade-up" style="padding: 14px; display: flex; gap: 12px;">
        <div style="flex-shrink: 0;">
          <img src="${absen.foto_masuk || 'https://via.placeholder.com/40?text=No+Image'}" 
            style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover; border: 1.5px solid var(--border);">
        </div>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 700; font-size: .9rem;">${absen.tanggal}</div>
              <div style="font-size: .7rem; color: var(--text-muted); margin-top: 2px;">${shiftName}</div>
            </div>
            <span style="padding: 2px 8px; border-radius: 12px; font-size: .65rem; font-weight: 700; background: ${statusColor}; color: ${statusTextColor};">
              ${statusText}
            </span>
          </div>
          <div style="display: flex; gap: 12px; font-size: .8rem; color: var(--text-muted); margin: 6px 0;">
            <div><strong>Masuk:</strong> <span style="color: var(--text); font-weight: 600;">${jamMasuk}</span></div>
            <div><strong>Pulang:</strong> <span style="color: var(--text); font-weight: 600;">${jamPulang}</span></div>
          </div>
          ${detailInfo}
        </div>
      </div>
    `
  }

  el.innerHTML = html
}

window.downloadExcelDaftarAbsensi = function () {
  const data = window._daftarAbsensiAllData || []
  if (!data.length) {
    alert('Tidak ada data untuk didownload')
    return
  }

  if (typeof XLSX === 'undefined') {
    alert('Library XLSX belum dimuat')
    return
  }

  const rows = data.map(a => {
    let status = a.status_absensi || 'open'
    let terlambat = ''
    let pulangCepat = ''

    if (a.status_masuk === 'Terlambat') {
      const lateMin = calculateLateDuration(a.waktu_masuk, '07:00')
      terlambat = lateMin > 0 ? `${lateMin} menit` : ''
    }

    if (a.waktu_pulang && a.waktu_masuk) {
      const earlyMin = calculateEarlyDuration(a.waktu_pulang, '15:00')
      pulangCepat = earlyMin > 0 ? `${earlyMin} menit` : ''
    }

    return {
      'Tanggal': a.tanggal,
      'Nama': a.nama,
      'Jam Masuk': a.waktu_masuk ? new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
      'Jam Pulang': a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
      'Status Masuk': a.status_masuk || '-',
      'Terlambat': terlambat,
      'Pulang Cepat': pulangCepat,
      'Keterangan': status
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()

  ws['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 }
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Absensi')
  XLSX.writeFile(wb, `daftar-absensi-${window._selectedKaryawan}-${new Date().toISOString().split('T')[0]}.xlsx`)
}
