import { supabase } from './supabase.js'

export async function renderDaftarAbsensi(user) {
  const content = document.getElementById('content')
  if (!content) return

  // 1. TENTUKAN DEFAULT RENTANG TANGGAL (7 Hari Terakhir s/id Hari Ini)
  const hariIni = new Date()
  const tujuhHariLalu = new Date()
  tujuhHariLalu.setDate(hariIni.getDate() - 7)

  const defaultFilterMulai = tujuhHariLalu.toISOString().split('T')[0]
  const defaultFilterSelesai = hariIni.toISOString().split('T')[0]

  // 2. RENDER STRUKTUR DASHBOARD & FILTER ATAS
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

  // Hubungkan event trigger filter tanggal
  document.getElementById('filterMulai').onchange = () => muatLogAbsensi(user)
  document.getElementById('filterSelesai').onchange = () => muatLogAbsensi(user)

  // Jalankan fungsi penarik data
  await muatLogAbsensi(user)
}

// ====================================================================
// FUNGSI UTAMA AMBIL DATA & KONTROL LAYOUT KARTU ESTETIK
// ====================================================================
async function muatLogAbsensi(user) {
  const listContainer = document.getElementById('listKartuAbsensi')
  if (!listContainer) return

  const tglMulai = document.getElementById('filterMulai').value
  const tglSelesai = document.getElementById('filterSelesai').value

  try {
    // AMBIL DATA DARI SUPABASE BERDASARKAN RENTANG TANGGAL USER
    const { data: listAbsen, error } = await supabase
      .from('absensi')
      .select('*')
      .eq('nama', user.nama_lengkap)
      .gte('tanggal', tglMulai)
      .lte('tanggal', tglSelesai)
      .order('tanggal', { ascending: false })

    if (error) throw error

    if (!listAbsen || listAbsen.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center; padding:40px 20px; background:#fff; border-radius:12px; border:1px dashed #e2e8f0;">
          <i class="fa fa-calendar-xmark" style="font-size:2rem; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
          <p style="font-size:.85rem; color:var(--text-muted); font-weight:600; margin:0;">Tidak ada riwayat absensi pada rentang tanggal ini.</p>
        </div>
      `
      return
    }

    // RENDER ARRAY DATA MENJADI GRID KARTU KREATIF
    listContainer.innerHTML = listAbsen.map(absen => {
      // 1. FORMAT TANGGAL KE INDONESIA (Contoh: Minggu, 24 Mei 2026)
      const opt = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      const formatHari = new Date(absen.tanggal).toLocaleDateString('id-ID', opt)

      // 2. HITUNG TOTAL JAM KERJA DESIMAL (Jika masuk & pulang lengkap)
      let teksJamKerja = ''
      if (absen.waktu_masuk && absen.waktu_pulang) {
        const selisihMs = new Date(absen.waktu_pulang) - new Date(absen.waktu_masuk)
        const totalJam = selisihMs / (1000 * 60 * 60)
        teksJamKerja = `<span style="font-size:.78rem; color:var(--text-muted); font-weight:600;">${totalJam.toFixed(2)} Jam Kerja <i class="fa fa-chevron-right" style="font-size:.65rem; margin-left:2px;"></i></span>`
      }

      // 3. LOGIKA DETEKSI BADGE RADIUS MASUK
      let badgeMasuk = ''
      if (absen.waktu_masuk) {
        const isOutMasuk = (absen.lokasi_masuk || '').includes('Luar Radius') || (absen.lokasi_masuk || '').includes('Testing')
        if (isOutMasuk) {
          badgeMasuk = `<span style="padding:4px 10px; font-size:.7rem; font-weight:800; border-radius:999px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;">Out Radius</span>`
        } else {
          badgeMasuk = `<span style="padding:4px 10px; font-size:.7rem; font-weight:800; border-radius:999px; background:#e8f5e9; color:#2e7d32; border:1px solid #c8e6c9;">Hadir (In Radius)</span>`
        }
      }

      // 4. LOGIKA DETEKSI BADGE RADIUS PULANG
      let badgePulang = ''
      if (absen.waktu_pulang) {
        const isOutPulang = (absen.lokasi_pulang || '').includes('Luar Radius') || (absen.lokasi_pulang || '').includes('Testing')
        if (isOutPulang) {
          badgePulang = `<span style="padding:4px 10px; font-size:.7rem; font-weight:800; border-radius:999px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;">Out Radius</span>`
        } else {
          badgePulang = `<span style="padding:4px 10px; font-size:.7rem; font-weight:800; border-radius:999px; background:#e8f5e9; color:#2e7d32; border:1px solid #c8e6c9;">Out (In Radius)</span>`
        }
      }

      // 5. FORMAT JAM RIIL (HH:MM:SS)
      const jamMasuk = absen.waktu_masuk ? new Date(absen.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'
      const jamPulang = absen.waktu_pulang ? new Date(absen.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'

      // COMPILING TEMPLATE KARTU PER HARI
      return `
        <div style="margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #f1f5f9;">
          
          <div style="display:flex; justify-content:between; align-items:flex-start; justify-content:space-between; margin-bottom:10px;">
            <div>
              <div style="font-weight:800; font-size:.9rem; color:var(--text);">${formatHari}</div>
              <div style="font-size:.72rem; color:var(--text-muted); font-weight:600; margin-top:2px;">
                Shift: ${absen.jam_jadwal_masuk || '--:--'} - ${absen.jam_jadwal_pulang || '--:--'}
              </div>
            </div>
            <div>${teksJamKerja}</div>
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
              <span style="font-family:monospace; font-weight:700; font-size:.9rem; color:${absen.waktu_pulang ? 'var(--text)' : 'var(--text-muted)'}">${jamJamPulang(absen, jamPulang)}</span>
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

// Fungsi pembantu validasi teks jam pulang kosong
function jamJamPulang(absen, jamPulang) {
  if (absen.status_absensi === 'lupa absen pulang') return 'Lupa Absen Pulang'
  return jamPulang
}
