import { supabase } from './supabase.js'
import { openCamera, takePhoto, getLocation, checkStatus, getTodayAbsen, getTodayShift, checkStatusPulang } from './absensi.js'
import { submitAbsen } from './submit_absensi.js'
import { dapatkanLokasiAbsenAktif } from './geolocation.js'

window.activeVideoStream = null

function stopCamera(video) {
  const stream = video?.srcObject || window.activeVideoStream
  if (stream) stream.getTracks().forEach(t => t.stop())
  if (video) video.srcObject = null
  window.activeVideoStream = null
}

function hitungKeterangan(absen, shift) {
  const shiftSpecial = ['OFF', 'CUTI', 'SAKIT', 'IZIN'].includes(shift?.nama_shift)

  if (absen?.status_absensi === 'salah absen') {
    return {
      label: 'Salah Absen',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-circle-xmark'
    }
  }

  if (shiftSpecial) {
    return {
      label: `Complete · ${shift.nama_shift}`,
      color: '#16a34a',
      bg:    '#f0fdf4',
      border:'#86efac',
      icon:  'fa-circle-check'
    }
  }

  if (absen?.waktu_masuk && absen?.waktu_pulang) {
    return {
      label: 'Complete',
      color: '#16a34a',
      bg:    '#f0fdf4',
      border:'#86efac',
      icon:  'fa-circle-check'
    }
  }

  if (absen?.waktu_masuk && !absen?.waktu_pulang) {
    return {
      label: 'Belum Absen Pulang',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-right-from-bracket'
    }
  }

  if (!absen?.waktu_masuk && absen?.waktu_pulang) {
    return {
      label: 'Tidak Absen Masuk',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-right-to-bracket'
    }
  }

  if (absen && absen.status_absensi === 'open') {
    return {
      label: 'Open',
      color: '#d97706',
      bg:    '#fffbeb',
      border:'#fcd34d',
      icon:  'fa-clock'
    }
  }

  // VALIDASI BARU: Dukungan status Lupa Absen Pulang dari Otomatisasi Dashboard
  if (absen?.status_absensi === 'lupa absen pulang') {
    return {
      label: 'Lupa Absen Pulang',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-triangle-exclamation'
    }
  }
  if (absen?.status_absensi === 'lupa absen datang') {
    return {
      label: 'Lupa Absen Datang',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-triangle-exclamation'
    }
  }
  if (absen?.status_absensi === 'approved manual') {
    return {
      label: 'Approved Manual',
      color: '#16a34a',
      bg:    '#f0fdf4',
      border:'#86efac',
      icon:  'fa-circle-check'
    }
  }

  if (!absen && shift) {
    return {
      label: 'Tidak Absen',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-user-xmark'
    }
  }

  return {
    label: 'Open',
    color: '#d97706',
    bg:    '#fffbeb',
    border:'#fcd34d',
    icon:  'fa-clock'
  }
}

export async function renderAbsensi(user) {
  const content    = document.getElementById('content')
  const absen      = await getTodayAbsen(user.nama_lengkap)
  const todayShift = await getTodayShift(user.id)

  const shiftSpecial = ['CUTI', 'SAKIT', 'IZIN', 'OFF'].includes(todayShift?.nama_shift)
  const ket          = hitungKeterangan(absen, todayShift)

  let statusLabel = 'Belum Absen'
  let statusColor = 'var(--gray-400)'
  let statusIcon  = 'fa-circle-minus'

  if (shiftSpecial && ket.label.startsWith('Complete')) {
    statusLabel = 'Hari Libur / Izin'
    statusColor = 'var(--success)'
    statusIcon  = 'fa-umbrella-beach'
  } else if (absen?.waktu_masuk && absen?.waktu_pulang) {
    statusLabel = 'Selesai Hari Ini'
    statusColor = 'var(--success)'
    statusIcon  = 'fa-circle-check'
  } else if (absen?.waktu_masuk && !absen?.waktu_pulang) {
    statusLabel = 'Sedang Bekerja'
    statusColor = 'var(--warning)'
    statusIcon  = 'fa-spinner fa-spin'
  } else if (absen?.status_absensi === 'salah absen') {
    statusLabel = 'Salah Absen'
    statusColor = 'var(--danger)'
    statusIcon  = 'fa-circle-xmark'
  }

  content.innerHTML = `
    <div style="max-width:480px;margin:0 auto;">

      <div class="card fade-up" style="text-align:center;padding:24px 20px 20px;">
        <i class="fa ${statusIcon}" style="font-size:2.4rem;color:${statusColor};margin-bottom:10px;display:block;"></i>
        <div style="font-size:1rem;font-weight:800;color:${statusColor};">${statusLabel}</div>
        <div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">
          ${new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </div>

        <div style="margin-top:14px;display:inline-flex;align-items:center;gap:8px; padding:8px 16px;border-radius:999px; background:${ket.bg};border:1.5px solid ${ket.border};">
          <i class="fa ${ket.icon}" style="color:${ket.color};font-size:.9rem;"></i>
          <span style="font-size:.82rem;font-weight:800;color:${ket.color};">${ket.label}</span>
        </div>

        ${todayShift ? `
          <div style="margin-top:14px;background:var(--gray-50);border-radius:var(--r-md); padding:12px 16px;display:inline-flex;gap:20px;align-items:center;">
            <div style="text-align:left;">
              <div style="font-size:.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;">Shift</div>
              <div style="font-weight:800;font-size:.9rem;">${todayShift.nama_shift}</div>
            </div>
            ${!shiftSpecial ? `
              <div style="text-align:left;">
                <div style="font-size:.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;">Jam</div>
                <div style="font-weight:700;font-size:.85rem;">${todayShift.jam_masuk} – ${todayShift.jam_pulang}</div>
              </div>` : ''}
          </div>` : `
          <div style="margin-top:14px;background:var(--warning-light);border-radius:var(--r-md); padding:10px 16px;font-size:.82rem;color:var(--warning-dark);">
            ⚠ Tidak ada jadwal hari ini
          </div>`}

        ${absen?.waktu_masuk ? `
          <div style="margin-top:16px;display:flex;justify-content:center;gap:28px;">
            <div style="text-align:center;">
              <div style="font-size:.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Masuk</div>
              <div style="font-weight:900;font-size:1.1rem;color:var(--success);">
                ${new Date(absen.waktu_masuk).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })}
              </div>
              ${absen.status_masuk ? `<div style="font-size:.65rem;font-weight:700;margin-top:2px; color:${absen.status_masuk==='Terlambat'?'var(--danger)':'var(--success)'};">
                ${absen.status_masuk}</div>` : ''}
            </div>
            ${absen.waktu_pulang ? `
              <div style="width:1px;background:var(--gray-200);"></div>
              <div style="text-align:center;">
                <div style="font-size:.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Pulang</div>
                <div style="font-weight:900;font-size:1.1rem;color:var(--primary);">
                  ${new Date(absen.waktu_pulang).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })}
                </div>
              </div>` : `
              <div style="text-align:center;opacity:.4;">
                <div style="font-size:.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Pulang</div>
                <div style="font-weight:700;font-size:.9rem;color:var(--text-muted);">--:--</div>
              </div>`}
          </div>` : ''}
      </div>

      <div class="card fade-up-1" id="absensiActionCard"></div>

    </div>
  `

  const actionCard = document.getElementById('absensiActionCard')

  if (shiftSpecial && absen?.status_absensi !== 'salah absen') {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:18px 12px;">
        <i class="fa fa-circle-check" style="font-size:2rem;color:var(--success);margin-bottom:8px;display:block;"></i>
        <p style="font-weight:800;color:var(--success);font-size:.95rem;">Tidak perlu absen hari ini</p>
        <p style="color:var(--text-muted);font-size:.8rem;margin-top:4px;">Jadwal: ${todayShift.nama_shift}</p>
      </div>`
    return
  }

  if (!todayShift) {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:18px 12px;">
        <i class="fa fa-calendar-xmark" style="font-size:1.8rem;color:var(--gray-300);margin-bottom:8px;display:block;"></i>
        <p style="color:var(--text-muted);font-size:.88rem;">Tidak ada jadwal hari ini</p>
      </div>`
    return
  }

  if (absen?.waktu_masuk && absen?.waktu_pulang) {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:18px 12px;">
        <i class="fa fa-circle-check" style="font-size:2rem;color:var(--success);margin-bottom:8px;display:block;"></i>
        <p style="font-weight:800;color:var(--success);font-size:.95rem;">Absensi hari ini sudah lengkap</p>
      </div>`
    return
  }

  actionCard.innerHTML = `
    <div style="position:relative;border-radius:var(--r-md);overflow:hidden;background:#000;margin-bottom:14px;" id="camWrap">
      <video id="video" autoplay playsinline style="width:100%;display:block;max-height:260px;object-fit:cover;"></video>
    </div>
    <canvas id="canvas" style="display:none;"></canvas>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" id="actionBox"></div>
    <p id="photoStatus" style="text-align:center;font-size:.75rem;font-weight:700;color:var(--danger);margin-top:8px;min-height:18px;">
      <i class="fa fa-info-circle"></i> Ambil foto terlebih dahulu untuk membuka tombol absen
    </p>
  `

  const video       = document.getElementById('video')
  const canvas      = document.getElementById('canvas')
  const actionBox   = document.getElementById('actionBox')
  const photoStatus = document.getElementById('photoStatus')

  try {
    await openCamera(video)
  } catch {
    document.getElementById('camWrap').innerHTML = `
      <div style="background:var(--gray-100);border-radius:var(--r-md);padding:20px; text-align:center;color:var(--text-muted);font-size:.82rem;">
        <i class="fa fa-camera-slash"></i> Kamera tidak tersedia
      </div>`
  }

  function makeBtn(id, icon, label, primary = false, disabled = false) {
    return `<button id="${id}" class="${primary ? 'btn-primary' : 'btn-secondary'}" style="width:100%;" ${disabled ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
      <i class="fa ${icon}"></i> ${label}
    </button>`
  }

  window.photo = null

  if (!absen) {
    actionBox.innerHTML =
      makeBtn('btnFoto', 'fa-camera', 'Ambil Foto') +
      makeBtn('btnMasuk', 'fa-sign-in-alt', 'Absen Masuk', true, true)

    document.getElementById('btnFoto').onclick = () => {
      window.photo = takePhoto(video, canvas)
      photoStatus.style.color = 'var(--success)'
      photoStatus.innerHTML = '<i class="fa fa-check-circle"></i> Foto berhasil disimpan! Tombol absen telah terbuka.'
      document.getElementById('btnMasuk').disabled = false
      document.getElementById('btnMasuk').style.opacity = '1'
      document.getElementById('btnMasuk').style.cursor = 'pointer'
    }

    document.getElementById('btnMasuk').onclick = async () => {
      const btn = document.getElementById('btnMasuk')
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'

      let loc = { lat: null, lng: null }
      try { loc = await getLocation() } catch {}

      let status_absensi = 'open'

      if (['OFF', 'CUTI', 'SAKIT', 'IZIN'].includes(todayShift.nama_shift)) {
        status_absensi = 'salah absen'
      }

      if (status_absensi === 'open') {
        const yDate = new Date()
        yDate.setDate(yDate.getDate() - 1)
        const { data: lastAbsen } = await supabase.from('absensi').select('*')
          .eq('nama', user.nama_lengkap)
          .eq('tanggal', yDate.toISOString().split('T')[0])
          .maybeSingle()
        if (lastAbsen?.waktu_masuk && !lastAbsen?.waktu_pulang) {
          status_absensi = 'lupa absen pulang'
        }
      }

      const hasilCheck = checkStatus(todayShift.jam_masuk)

      await submitAbsen({
        nama:           user.nama_lengkap,
        tanggal:        new Date().toISOString().split('T')[0],
        waktu_masuk:    new Date().toISOString(),
        lat_masuk:      loc.lat,
        lng_masuk:      loc.lng,
        foto_masuk:     window.photo || null,
        status_masuk:   hasilCheck.status,
        menit_terlambat: hasilCheck.status === 'Terlambat' ? hasilCheck.minutesLate : 0,
        jam_jadwal_masuk: todayShift.jam_masuk,
        status_absensi
      })

      stopCamera(video)
      renderAbsensi(user)
    }
    return
  }

  if (absen && !absen.waktu_pulang) {
    actionBox.innerHTML =
      makeBtn('btnFoto2', 'fa-camera', 'Ambil Foto') +
      makeBtn('btnPulang', 'fa-sign-out-alt', 'Absen Pulang', true, true)

    document.getElementById('btnFoto2').onclick = () => {
      window.photo = takePhoto(video, canvas)
      photoStatus.style.color = 'var(--success)'
      photoStatus.innerHTML = '<i class="fa fa-check-circle"></i> Foto berhasil disimpan! Tombol absen telah terbuka.'
      document.getElementById('btnPulang').disabled = false
      document.getElementById('btnPulang').style.opacity = '1'
      document.getElementById('btnPulang').style.cursor = 'pointer'
    }

    document.getElementById('btnPulang').onclick = async () => {
      const btn = document.getElementById('btnPulang')
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'

      let loc = { lat: null, lng: null }
      try { loc = await getLocation() } catch {}

      const status_absensi = absen.status_absensi === 'open' ? 'complete' : absen.status_absensi
      const hasilPulang = checkStatusPulang(todayShift.jam_pulang)

      await supabase.from('absensi').update({
        waktu_pulang:   new Date().toISOString(),
        lat_pulang:     loc.lat,
        lng_pulang:     loc.lng,
        foto_pulang:    window.photo || null,
        status_absensi,
        status_pulang:  hasilPulang.status,
        menit_pulang_cepat: hasilPulang.minutesEarly
      }).eq('id', absen.id)

      stopCamera(video)
      renderAbsensi(user)
    }
  }
}

export async function renderRiwayat() {
  const { renderRiwayat: rr } = await import('./riwayat.js')
  rr(window.currentUser)
}

window.previewImageFullScreen = function(urlSrc) {
  if (!urlSrc) return
  
  let existingOverlay = document.getElementById('imagePreviewOverlay')
  if (existingOverlay) existingOverlay.remove()
  
  const overlay = document.createElement('div')
  overlay.id = 'imagePreviewOverlay'
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 10000;
    cursor: zoom-out;
    opacity: 0;
    transition: opacity 0.25s ease;
  `
  
  const img = document.createElement('img')
  img.src = urlSrc
  img.style.cssText = `
    max-width: 90%;
    max-height: 85vh;
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    transform: scale(0.9);
    transition: transform 0.25s ease;
  `
  
  overlay.appendChild(img)
  document.body.appendChild(overlay)
  
  setTimeout(() => {
    overlay.style.opacity = '1'
    img.style.transform = 'scale(1)'
  }, 10)
  
  const closeHandler = () => {
    overlay.style.opacity = '0'
    img.style.transform = 'scale(0.9)'
    setTimeout(() => overlay.remove(), 250)
  }
  
  overlay.onclick = closeHandler
  document.addEventListener('keydown', function escClose(e) {
    if (e.key === 'Escape') {
      closeHandler()
      document.removeEventListener('keydown', escClose)
    }
  })
}
