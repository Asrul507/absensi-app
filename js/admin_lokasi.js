import { supabase } from './supabase.js'
import { showToast, confirmAction } from './feedback.js'
import { resetTimezoneCache } from './timezone.js'

export async function renderPengaturanLokasi() {
  const content = document.getElementById('content')
  
  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-map-location-dot"></i> Manajemen Titik Absensi</h2>
    </div>

    <div class="card fade-up" style="padding: 16px; margin-bottom: 16px;">
      <h3 style="font-size: .95rem; margin-bottom: 12px; font-weight:800;"><i class="fa fa-plus" style="color:var(--primary);"></i> Tambah Titik Koordinat Baru</h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
        <div class="field" style="margin-bottom:0; flex: 2; min-width: 180px;">
          <label style="font-size: .75rem; margin-bottom: 4px;">Nama Lokasi / Unit Kerja</label>
          <input type="text" id="txtNamaTitik" placeholder="Contoh: Kantor HK, Kantor FO" style="width:100%; padding:8px 10px; border-radius:var(--r-md); border:1.5px solid var(--border); font-size:.85rem;">
        </div>
        <div class="field" style="margin-bottom:0; flex: 1; min-width: 100px;">
          <label style="font-size: .75rem; margin-bottom: 4px;">Radius (Meter)</label>
          <input type="number" id="numRadius" value="50" style="width:100%; padding:8px 10px; border-radius:var(--r-md); border:1.5px solid var(--border); font-size:.85rem;">
        </div>
        <button class="btn-primary" onclick="window.tangkapDanSimpanLokasi()" id="btnAmbilGps" style="padding: 9px 16px; font-size:.85rem; cursor:pointer;">
          <i class="fa fa-crosshairs"></i> Tentukan Di Sini
        </button>
      </div>
      <p id="geoAdminStatus" style="font-size: .75rem; margin-top: 8px; font-weight: 700; min-height: 16px;"></p>
    </div>

    <div class="card fade-up-1" style="padding: 16px; overflow-x: auto;">
      <h3 style="font-size: .95rem; margin-bottom: 12px; font-weight:800;"><i class="fa fa-list"></i> Daftar Titik Aktif</h3>
      <div id="tabelLokasiContainer"></div>
    </div>
  `
  await muatDaftarLokasiAdmin()
}

async function muatDaftarLokasiAdmin() {
  const container = document.getElementById('tabelLokasiContainer')
  try {
    const { data: list, error } = await supabase.from('lokasi_absen').select('*').order('created_at', { ascending: false })
    if (error) throw error

    if (!list?.length) {
      container.innerHTML = `<p style="font-size:.85rem; color:var(--text-muted); text-align:center; padding:15px;">Belum ada titik absensi yang dikonfigurasi.</p>`
      return
    }

    let html = `
      <table style="width:100%; border-collapse:collapse; font-size:.8rem; text-align:left;">
        <thead>
          <tr style="background:var(--gray-100); border-bottom:2px solid var(--border);">
            <th style="padding:10px;">Nama Titik</th>
            <th style="padding:10px;">Latitude</th>
            <th style="padding:10px;">Longitude</th>
            <th style="padding:10px; text-align:center;">Radius</th>
            <th style="padding:10px; text-align:center;">Aksi</th>
          </tr>
        </thead>
        <tbody>`

    list.forEach(item => {
      html += `
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:10px; font-weight:700;">${item.nama_titik}</td>
          <td style="padding:10px; color:var(--text-muted);">${Number(item.latitude).toFixed(5)}</td>
          <td style="padding:10px; color:var(--text-muted);">${Number(item.longitude).toFixed(5)}</td>
          <td style="padding:10px; text-align:center; font-weight:700;">${item.radius_meter}m</td>
          <td style="padding:10px; text-align:center;">
            <button class="btn-danger btn-sm" onclick="window.hapusTitikLokasi(${item.id})" style="padding:4px 8px; font-size:.7rem; cursor:pointer;"><i class="fa fa-trash"></i> Hapus</button>
          </td>
        </tr>`
    })
    html += `</tbody></table>`
    container.innerHTML = html
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger); font-size:.8rem;">Gagal memuat data: ${err.message}</p>`
  }
}

window.tangkapDanSimpanLokasi = function() {
  const nama = document.getElementById('txtNamaTitik').value.trim()
  const radius = document.getElementById('numRadius').value
  const statusTxt = document.getElementById('geoAdminStatus')
  const btn = document.getElementById('btnAmbilGps')

  if (!nama) {
    statusTxt.style.color = 'var(--danger)'
    statusTxt.textContent = '⚠ Masukkan nama lokasi terlebih dahulu!'
    return
  }

  statusTxt.style.color = 'var(--primary)'
  statusTxt.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Sedang mengunci sinyal GPS HP Anda...'
  btn.disabled = true

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { error } = await supabase.from('lokasi_absen').insert([{
        nama_titik: nama,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        radius_meter: parseInt(radius) || 50
      }])
      if (error) throw error

      resetTimezoneCache()
      statusTxt.style.color = 'var(--success)'
      statusTxt.innerHTML = `✅ Sukses menyimpan titik "${nama}" pada koordinat Anda saat ini!`
      document.getElementById('txtNamaTitik').value = ''
      await muatDaftarLokasiAdmin()
    } catch (err) {
      statusTxt.style.color = 'var(--danger)'
      statusTxt.textContent = `❌ Gagal menyimpan: ${err.message}`
    } finally {
      btn.disabled = false
    }
  }, (err) => {
    statusTxt.style.color = 'var(--danger)'
    statusTxt.textContent = '❌ GPS Error: Pastikan GPS perangkat aktif & beri izin browser.'
    btn.disabled = false
  }, { enableHighAccuracy: true })
}

window.hapusTitikLokasi = async function(id) {
  if (!(await confirmAction('Hapus titik lokasi patokan ini?', 'Ya, hapus'))) return
  try {
    const { error } = await supabase.from('lokasi_absen').delete().eq('id', id)
    if (error) throw error
    resetTimezoneCache()
    await muatDaftarLokasiAdmin()
  } catch (err) { showToast('Gagal menghapus: ' + err.message, 'error') }
}
