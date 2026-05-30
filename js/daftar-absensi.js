import { supabase } from './supabase.js'
import { toJamLokal, getDurasiMenit, toTanggalAbsensiLokal } from './timezone.js'
import { getShiftDetailByCode, getShiftDetailByJamMasuk } from './shift-resolver.js'
import { getStatusPulangReminder } from './absensi.js'

export async function renderDaftarAbsensi(user) {
  const content = document.getElementById('content')
  if (!content) return

  const hariIni = new Date()
  const tujuhHariLalu = new Date()
  tujuhHariLalu.setDate(hariIni.getDate() - 7)

  const defaultFilterMulai = tujuhHariLalu.toISOString().split('T')[0]
  const defaultFilterSelesai = hariIni.toISOString().split('T')[0]

  content.innerHTML = `
    <div style="max-width:480px; margin:0 auto; padding: 0 8px;">
      
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
        <button onclick="navigate('dashboard')" style="background:none; border:none; font-size:1.2rem; color:var(--text); cursor:pointer;">
          <i class="fa fa-chevron-left"></i>
        </button>
        <h2 style="font-size:1.25rem; font-weight:800; margin:0;">Data Absensi</h2>
      </div>

      <div class="card" style="padding:12px; margin-bottom:16px; border-radius:12px; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <label style="font-size:.65rem; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Dari Tanggal</label>
            <input type="date" id="filterMulai" value="${defaultFilterMulai}" style="width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:.85rem; font-weight:600; margin-top:4px;">
          </div>
          <div>
            <label style="font-size:.65rem; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Sampai Tanggal</label>
            <input type="date" id="filterSelesai" value="${defaultFilterSelesai}" style="width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:.85rem; font-weight:600; margin-top:4px;">
          </div>
        </div>
      </div>

      <div id="listKartuAbsensi">
        <div style="text-align:center; padding:40px 0;">
          <i class="fa fa-spinner fa-spin" style="font-size:1.5rem; color:var(--primary);"></i>
          <p style="font-size:.8rem; color:var(--text-muted); margin-top:8px;">Memuat data...</p>
        </div>
      </div>

    </div>
  `

  document.getElementById('filterMulai').onchange = () => muatLogAbsensi(user)
  document.getElementById('filterSelesai').onchange = () => muatLogAbsensi(user)

  await muatLogAbsensi(user)
}

async function muatLogAbsensi(user) {
  const listContainer = document.getElementById('listKartuAbsensi')
  if (!listContainer) return

  const tglMulai = document.getElementById('filterMulai').value
  const tglSelesai = document.getElementById('filterSelesai').value

  try {
    const { data: listAbsen, error } = await supabase
      .from('absensi')
      .select('*')
      .eq('nama', user.nama_lengkap)
      .eq('status_absensi', 'COMPLETE')
      .gte('tanggal', tglMulai)
      .lte('tanggal', tglSelesai)
      .order('tanggal', { ascending: false })

    if (error) {
      if (String(error.message || '').includes('status_absensi')) {
        listContainer.innerHTML = `
          <div style="text-align:center; padding:32px 20px; background:#fff; border-radius:12px; border:1px dashed #fbbf24;">
            <i class="fa fa-database" style="font-size:1.8rem; color:#d97706; margin-bottom:8px; display:block;"></i>
            <p style="font-size:.85rem; color:#92400e; font-weight:700; margin:0;">Kolom status_absensi belum tersedia. Jalankan migration Attendance Approval terlebih dahulu.</p>
          </div>`
        return
      }
      throw error
    }

    if (!listAbsen || listAbsen.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center; padding:40px 20px; background:#fff; border-radius:12px; border:1px dashed #e2e8f0;">
          <i class="fa fa-calendar-xmark" style="font-size:2rem; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
          <p style="font-size:.85rem; color:var(--text-muted); font-weight:600; margin:0;">Belum ada absensi COMPLETE pada rentang tanggal ini.</p>
        </div>
      `
      return
    }

    const rowsWithShift = await Promise.all(listAbsen.map(async (absen) => {
      const shiftByCode = await getShiftDetailByCode(absen.shift_code)
      const shiftByJamMasuk = !shiftByCode ? await getShiftDetailByJamMasuk(absen.jam_jadwal_masuk) : null
      const shiftRef = shiftByCode || shiftByJamMasuk

      const jamJadwalMasuk = absen.jam_jadwal_masuk || shiftRef?.jam_masuk || '--:--'
      const jamJadwalPulang = absen.jam_jadwal_pulang || shiftRef?.jam_pulang || '--:--'
      return { absen, jamJadwalMasuk, jamJadwalPulang, shiftRef }
    }))

    listContainer.innerHTML = rowsWithShift.map(({ absen, jamJadwalMasuk, jamJadwalPulang, shiftRef }) => {
      const tanggalAbsensi = absen?.tanggal || null
      const formatHari = toTanggalAbsensiLokal(tanggalAbsensi, absen?.waktu_masuk || absen?.waktu_pulang)

      let teksJamKerja = ''
      if (absen.waktu_masuk && CorelJamLengkap(absen)) {
        const durasiMenit = getDurasiMenit(absen.waktu_masuk, absen.waktu_pulang)
        if (durasiMenit !== null) {
          const totalJam = durasiMenit / 60
          teksJamKerja = `<span style="font-size:.78rem; color:var(--text-muted); font-weight:600;">${totalJam.toFixed(2)} Jam Kerja <i class="fa fa-chevron-right" style="font-size:.65rem; margin-left:2px;"></i></span>`
        }
      }

      // LOGIKA VALIDASI BADGE RADIUS MASUK (MENGUNCI ATURAN JATAH)
      let badgeMasuk = ''
      if (absen.waktu_masuk) {
        const isLuarRadius = (absen.lokasi_masuk || '').includes('Luar Radius') || (absen.lokasi_masuk || '').includes('Testing')
        const isSalahTitik = user.titik_radius && absen.lokasi_masuk !== user.titik_radius

        if (absen.radius_status === 'OUT_RADIUS' || isLuarRadius || isSalahTitik || absen.status_absensi === 'salah absen') {
          badgeMasuk = `<span style="padding:4px 10px; font-size:.7rem; font-weight:800; border-radius:999px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;">Out Radius</span>`
        } else {
          badgeMasuk = `<span style="padding:4px 10px; font-size:.7rem; font-weight:800; border-radius:999px; background:#e8f5e9; color:#2e7d32; border:1px solid #c8e6c9;">Hadir (In Radius)</span>`
        }
      }

      // LOGIKA VALIDASI BADGE RADIUS PULANG (MENGUNCI ATURAN JATAH)
      let badgePulang = ''
      if (absen.waktu_pulang) {
        const isLuarPulang = (absen.lokasi_pulang || '').includes('Luar Radius') || (absen.lokasi_pulang || '').includes('Testing')
        const isSalahTitikPulang = user.titik_radius && absen.lokasi_pulang !== user.titik_radius

        if (absen.radius_status === 'OUT_RADIUS' || isLuarPulang || isSalahTitikPulang || absen.status_absensi === 'salah absen') {
          badgePulang = `<span style="padding:4px 10px; font-size:.7rem; font-weight:800; border-radius:999px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;">Out Radius</span>`
        } else {
          badgePulang = `<span style="padding:4px 10px; font-size:.7rem; font-weight:800; border-radius:999px; background:#e8f5e9; color:#2e7d32; border:1px solid #c8e6c9;">Out (In Radius)</span>`
        }
      }

      const jamMasuk = absen.waktu_masuk ? toJamLokal(absen.waktu_masuk) : '-'
      const jamPulang = absen.waktu_pulang ? toJamLokal(absen.waktu_pulang) : '-'
      const approvalBadge = absen.status_absensi === 'OPEN'
        ? '<span style="padding:4px 10px;border-radius:999px;background:#fffbeb;color:#b45309;font-size:.68rem;font-weight:900;">MENUNGGU APPROVAL</span>'
        : absen.status_absensi === 'COMPLETE'
          ? '<span style="padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:.68rem;font-weight:900;">COMPLETE</span>'
          : absen.status_absensi === 'REJECTED'
            ? '<span style="padding:4px 10px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:.68rem;font-weight:900;">REJECTED</span>'
            : ''

      return `
        <div style="margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #f1f5f9;">
          
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div>
              <div style="font-weight:800; font-size:.9rem; color:var(--text);">${formatHari}</div>
              <div style="font-size:.72rem; color:var(--text-muted); font-weight:600; margin-top:2px;">
                Shift: ${jamJadwalMasuk} - ${jamJadwalPulang}
              </div>
            </div>
            <div style="text-align:right;display:flex;flex-direction:column;gap:5px;align-items:flex-end;">${approvalBadge}${teksJamKerja}</div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:${absen.waktu_masuk ? '#f8fafc' : '#f1f5f9'}; border-radius:10px; margin-bottom:8px; opacity:${absen.waktu_masuk ? '1' : '0.65'}">
            <div style="display:flex; align-items:center; gap:10px;">
              <i class="fa fa-arrow-right-to-bracket" style="color:#16a34a; font-size:.95rem;"></i>
              <span style="font-family:monospace; font-weight:700; font-size:.9rem; color:${absen.waktu_masuk ? 'var(--text)' : 'var(--text-muted)'}">${jamMasuk}</span>
            </div>
            <div>${badgeMasuk}</div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:${absen.waktu_pulang ? '#f8fafc' : '#f1f5f9'}; border-radius:10px; opacity:${absen.waktu_pulang ? '1' : '0.65'}">
            <div style="display:flex; align-items:center; gap:10px;">
              <i class="fa fa-arrow-right-from-bracket" style="color:#ea580c; font-size:.95rem;"></i>
              <span style="font-family:monospace; font-weight:700; font-size:.9rem; color:${absen.waktu_pulang ? 'var(--text)' : 'var(--text-muted)'}">${jamJamPulang(absen, jamPulang, { jam_masuk: jamJadwalMasuk, jam_pulang: jamJadwalPulang, ...shiftRef })}</span>
            </div>
            <div>${badgePulang}</div>
          </div>

        </div>
      `
    }).join('')

  } catch (err) {
    listContainer.innerHTML = `<p style="color:var(--danger); text-align:center; font-size:.82rem;">Gagal memuat log riwayat: ${err.message}</p>`
  }
}

function CorelJamLengkap(absen) {
  return Boolean(absen.waktu_pulang)
}

function jamJamPulang(absen, jamPulang, shiftInfo) {
  if (absen.waktu_pulang) return jamPulang

  const reminder = getStatusPulangReminder(absen, shiftInfo)
  if (reminder.status === 'Lupa Absen Pulang') return 'Lupa Absen Pulang'
  if (reminder.status === 'Belum Absen Pulang') return 'Belum Absen Pulang'

  return '-'
}
