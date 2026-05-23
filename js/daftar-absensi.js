import { supabase } from './supabase.js'

export async function renderDaftarAbsensi(user) {
  const content = document.getElementById('content')
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-list-check"></i> Daftar Absensi</h2>
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
        <button class="btn-primary btn-sm" onclick="applyDaftarAbsensiFilter(window.currentUser)" style="align-self: flex-end; white-space: nowrap;">
          <i class="fa fa-search"></i> Cari
        </button>
      </div>
    </div>

    <!-- CARDS LIST -->
    <div id="daftarAbsensiCards" style="display: flex; flex-direction: column; gap: 12px;">
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

  window._isAdminDaftarAbsensi = isAdmin

  await applyDaftarAbsensiFilter(user)
}

window.applyDaftarAbsensiFilter = async function (user) {
  const isAdmin = window._isAdminDaftarAbsensi
  const namaPencarian = document.getElementById('filterNama')?.value?.trim() || ''
  const dari = document.getElementById('filterDari')?.value
  const sampai = document.getElementById('filterSampai')?.value

  try {
    // Fetch absensi + jadwal data
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

    // Render cards
    renderDaftarAbsensiCards(absensiData || [], isAdmin, user)

  } catch (err) {
    console.error('Error load daftar absensi:', err)
    document.getElementById('daftarAbsensiCards').innerHTML = `
      <div class="card"><p style="color: var(--danger);">Error: ${err.message}</p></div>
    `
  }
}

async function renderDaftarAbsensiCards(absensiData, isAdmin, user) {
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
    // Get shift info from jadwal
    const { data: jadwal } = await supabase
      .from('jadwal')
      .select('shift_code, nama_shift')
      .eq('user_id', absen.user_id || user.id)
      .eq('tanggal', absen.tanggal)
      .maybeSingle()

    const shiftName = jadwal?.nama_shift || 'Regular'
    const jamMasuk = absen.waktu_masuk ? new Date(absen.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
    const jamPulang = absen.waktu_pulang ? new Date(absen.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'

    // Determine status badge
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

    html += `
      <div class="card fade-up" style="padding: 16px; display: flex; gap: 16px; align-items: flex-start;">
        <!-- Foto -->
        <div style="flex-shrink: 0;">
          <img src="${absen.foto_masuk || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 48 48%22%3E%3Ccircle cx=%2224%22 cy=%2224%22 r=%2220%22 fill=%22%23e5e7eb%22/%3E%3C/svg%3E'}" 
            style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border);">
        </div>

        <!-- Content -->
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 800; font-size: .95rem; margin-bottom: 4px;">${absen.nama}</div>
              <div style="font-size: .75rem; color: var(--text-muted);">${absen.tanggal}</div>
            </div>
            <span style="
              padding: 4px 10px;
              border-radius: 20px;
              font-size: .7rem;
              font-weight: 700;
              background: ${statusColor};
              color: ${statusTextColor};
            ">
              ${statusText}
            </span>
          </div>

          <!-- Shift & Times -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--gray-200);">
            <div>
              <div style="font-size: .7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 3px;">Shift</div>
              <div style="font-weight: 700; font-size: .9rem;">${shiftName}</div>
            </div>
            <div>
              <div style="font-size: .7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 3px;">Masuk</div>
              <div style="font-weight: 700; font-size: .9rem; color: var(--success);">${jamMasuk}</div>
            </div>
            <div>
              <div style="font-size: .7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 3px;">Pulang</div>
              <div style="font-weight: 700; font-size: .9rem; color: var(--warning);">${jamPulang}</div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  el.innerHTML = html
}
