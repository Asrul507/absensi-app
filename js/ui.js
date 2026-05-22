import { supabase } from './supabase.js'
import { openCamera, takePhoto, getLocation, checkStatus } from './absensi.js'
import { submitAbsen } from './submit_absensi.js'
//import { validateAbsenRadius } from './geolocation.js'

window.activeVideoStream = null

function stopCamera(video) {
  const stream = video?.srcObject || window.activeVideoStream
  if (stream) stream.getTracks().forEach(t => t.stop())
  if (video) video.srcObject = null
  window.activeVideoStream = null
}

async function getTodayAbsen(nama) {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('absensi').select('*')
    .eq('nama', nama).eq('tanggal', today).maybeSingle()
  return data
}

async function getTodayShift(user_id) {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('jadwal').select('*')
    .eq('user_id', user_id).eq('tanggal', today).maybeSingle()
  if (!data) return null

  if (data.status_override === 'cuti')  return { nama_shift: 'CUTI',        jam_masuk: '-', jam_pulang: '-' }
  if (data.status_override === 'sakit') return { nama_shift: 'SAKIT',       jam_masuk: '-', jam_pulang: '-' }
  if (data.status_override === 'izin')  return { nama_shift: 'IZIN',        jam_masuk: '-', jam_pulang: '-' }
  if (data.shift_code == '2') return { nama_shift: 'Shift Pagi',  jam_masuk: '07:00', jam_pulang: '15:00' }
  if (data.shift_code == '3') return { nama_shift: 'Shift Sore',  jam_masuk: '15:00', jam_pulang: '23:00' }
  if (data.shift_code == '4') return { nama_shift: 'Shift Malam', jam_masuk: '23:00', jam_pulang: '07:00' }
  if (data.shift_code == '8') return { nama_shift: 'OFF',         jam_masuk: '-',     jam_pulang: '-' }
  return null
}

/* ===============================================================
   HITUNG KETERANGAN STATUS ABSENSI
   Return: { label, color, icon, bg }

   Aturan:
   - shift OFF/CUTI/SAKIT/IZIN → COMPLETE (kecuali ada record salah absen)
   - masuk + pulang ada         → COMPLETE (hijau)
   - status_absensi salah absen → SALAH ABSEN (merah)
   - hanya masuk, belum pulang  → BELUM PULANG (merah)
   - tidak ada masuk sama sekali→ TIDAK ABSEN (merah)
   - open / lainnya             → OPEN (kuning)
=============================================================== */
function hitungKeterangan(absen, shift) {
  const shiftSpecial = ['OFF', 'CUTI', 'SAKIT', 'IZIN'].includes(shift?.nama_shift)

  // Salah absen — cek duluan sebelum apapun
  if (absen?.status_absensi === 'salah absen') {
    return {
      label: 'Salah Absen',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-circle-xmark'
    }
  }

  // Shift special (OFF/CUTI/SAKIT/IZIN) tanpa salah absen → complete
  if (shiftSpecial) {
    return {
      label: `Complete · ${shift.nama_shift}`,
      color: '#16a34a',
      bg:    '#f0fdf4',
      border:'#86efac',
      icon:  'fa-circle-check'
    }
  }

  // Masuk & pulang sudah ada → complete
  if (absen?.waktu_masuk && absen?.waktu_pulang) {
    return {
      label: 'Complete',
      color: '#16a34a',
      bg:    '#f0fdf4',
      border:'#86efac',
      icon:  'fa-circle-check'
    }
  }

  // Sudah masuk tapi belum pulang
  if (absen?.waktu_masuk && !absen?.waktu_pulang) {
    return {
      label: 'Belum Absen Pulang',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-right-from-bracket'
    }
  }

  // Lupa absen datang (ada record pulang tapi tidak ada masuk)
  if (!absen?.waktu_masuk && absen?.waktu_pulang) {
    return {
      label: 'Tidak Absen Masuk',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-right-to-bracket'
    }
  }

  // Ada record tapi status open
  if (absen && absen.status_absensi === 'open') {
    return {
      label: 'Open',
      color: '#d97706',
      bg:    '#fffbeb',
      border:'#fcd34d',
      icon:  'fa-clock'
    }
  }

  // lupa absen pulang / approved manual
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

  // Belum ada data absensi sama sekali & shift kerja biasa
  if (!absen && shift) {
    return {
      label: 'Tidak Absen',
      color: '#dc2626',
      bg:    '#fef2f2',
      border:'#fca5a5',
      icon:  'fa-user-xmark'
    }
  }

  // Default open
  return {
    label: 'Open',
    color: '#d97706',
    bg:    '#fffbeb',
    border:'#fcd34d',
    icon:  'fa-clock'
  }
}

/* ================= RENDER ABSENSI ================= */
export async function renderAbsensi(user) {
  const content    = document.getElementById('content')
  const absen      = await getTodayAbsen(user.nama_lengkap)
  const todayShift = await getTodayShift(user.id)

  const shiftSpecial = ['CUTI', 'SAKIT', 'IZIN', 'OFF'].includes(todayShift?.nama_shift)
  const ket          = hitungKeterangan(absen, todayShift)

  // Status atas (sedang bekerja / tidak absen / selesai)
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

      <!-- STATUS CARD -->
      <div class="card fade-up" style="text-align:center;padding:24px 20px 20px;">
        <i class="fa ${statusIcon}" style="font-size:2.4rem;color:${statusColor};margin-bottom:10px;display:block;"></i>
        <div style="font-size:1rem;font-weight:800;color:${statusColor};">${statusLabel}</div>
        <div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">
          ${new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </div>

        <!-- BADGE KETERANGAN -->
        <div style="margin-top:14px;display:inline-flex;align-items:center;gap:8px;
          padding:8px 16px;border-radius:999px;
          background:${ket.bg};border:1.5px solid ${ket.border};">
          <i class="fa ${ket.icon}" style="color:${ket.color};font-size:.9rem;"></i>
          <span style="font-size:.82rem;font-weight:800;color:${ket.color};">${ket.label}</span>
        </div>

        <!-- SHIFT INFO -->
        ${todayShift ? `
          <div style="margin-top:14px;background:var(--gray-50);border-radius:var(--r-md);
            padding:12px 16px;display:inline-flex;gap:20px;align-items:center;">
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
          <div style="margin-top:14px;background:var(--warning-light);border-radius:var(--r-md);
            padding:10px 16px;font-size:.82rem;color:var(--warning-dark);">
            ⚠ Tidak ada jadwal hari ini
          </div>`}

        <!-- WAKTU ABSEN -->
        ${absen?.waktu_masuk ? `
          <div style="margin-top:16px;display:flex;justify-content:center;gap:28px;">
            <div style="text-align:center;">
              <div style="font-size:.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Masuk</div>
              <div style="font-weight:900;font-size:1.1rem;color:var(--success);">
                ${new Date(absen.waktu_masuk).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })}
              </div>
              ${absen.status_masuk ? `<div style="font-size:.65rem;font-weight:700;margin-top:2px;
                color:${absen.status_masuk==='Terlambat'?'var(--danger)':'var(--success)'};">
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

      <!-- AKSI CARD -->
      <div class="card fade-up-1" id="absensiActionCard"></div>

    </div>
  `

  const actionCard = document.getElementById('absensiActionCard')

  /* ---- Shift special (OFF/CUTI/SAKIT/IZIN) tanpa salah absen ---- */
  if (shiftSpecial && absen?.status_absensi !== 'salah absen') {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:18px 12px;">
        <i class="fa fa-circle-check" style="font-size:2rem;color:var(--success);margin-bottom:8px;display:block;"></i>
        <p style="font-weight:800;color:var(--success);font-size:.95rem;">Tidak perlu absen hari ini</p>
        <p style="color:var(--text-muted);font-size:.8rem;margin-top:4px;">Jadwal: ${todayShift.nama_shift}</p>
      </div>`
    return
  }

  /* ---- Tidak ada shift ---- */
  if (!todayShift) {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:18px 12px;">
        <i class="fa fa-calendar-xmark" style="font-size:1.8rem;color:var(--gray-300);margin-bottom:8px;display:block;"></i>
        <p style="color:var(--text-muted);font-size:.88rem;">Tidak ada jadwal hari ini</p>
      </div>`
    return
  }

  /* ---- Sudah complete (masuk + pulang) ---- */
  if (absen?.waktu_masuk && absen?.waktu_pulang) {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:18px 12px;">
        <i class="fa fa-circle-check" style="font-size:2rem;color:var(--success);margin-bottom:8px;display:block;"></i>
        <p style="font-weight:800;color:var(--success);font-size:.95rem;">Absensi hari ini sudah lengkap</p>
      </div>`
    return
  }

  /* ---- Render kamera + tombol ---- */
  actionCard.innerHTML = `
    <div style="position:relative;border-radius:var(--r-md);overflow:hidden;background:#000;margin-bottom:14px;" id="camWrap">
      <video id="video" autoplay playsinline
        style="width:100%;display:block;max-height:260px;object-fit:cover;"></video>
    </div>
    <canvas id="canvas" style="display:none;"></canvas>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" id="actionBox"></div>
    <p id="photoStatus" style="text-align:center;font-size:.75rem;color:var(--text-muted);margin-top:8px;min-height:18px;"></p>
  `

  const video       = document.getElementById('video')
  const canvas      = document.getElementById('canvas')
  const actionBox   = document.getElementById('actionBox')
  const photoStatus = document.getElementById('photoStatus')

  try {
    await openCamera(video)
  } catch {
    document.getElementById('camWrap').innerHTML = `
      <div style="background:var(--gray-100);border-radius:var(--r-md);padding:20px;
        text-align:center;color:var(--text-muted);font-size:.82rem;">
        <i class="fa fa-camera-slash"></i> Kamera tidak tersedia
      </div>`
  }

  function makeBtn(id, icon, label, primary = false) {
    return `<button id="${id}" class="${primary ? 'btn-primary' : 'btn-secondary'}" style="width:100%;">
      <i class="fa ${icon}"></i> ${label}
    </button>`
  }

  /* ---- Belum absen masuk ---- */
  if (!absen) {
    actionBox.innerHTML =
      makeBtn('btnFoto', 'fa-camera', 'Ambil Foto') +
      makeBtn('btnMasuk', 'fa-sign-in-alt', 'Absen Masuk', true)

    document.getElementById('btnFoto').onclick = () => {
      window.photo = takePhoto(video, canvas)
      photoStatus.innerHTML = '<i class="fa fa-check" style="color:var(--success);"></i> Foto berhasil diambil'
    }

    document.getElementById('btnMasuk').onclick = async () => {
      const btn = document.getElementById('btnMasuk')
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'

      let loc = { lat: null, lng: null }
      try { loc = await getLocation() } catch {}

      // ===== VALIDASI RADIUS ABSEN =====
      if (loc.lat && loc.lng) {
        const radiusCheck = await validateAbsenRadius(loc.lat, loc.lng)
        if (!radiusCheck.valid) {
          // Tolak absen — diluar radius
          btn.disabled = false
          btn.innerHTML = '<i class="fa fa-sign-in-alt"></i> Absen Masuk'
          
          // Tampilkan error message
          const errorMsg = document.createElement('div')
          errorMsg.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: #fef2f2; border: 2px solid #dc2626; border-radius: 12px;
            padding: 20px; max-width: 320px; text-align: center; z-index: 9999;
            box-shadow: 0 20px 60px rgba(220,38,38,0.3);
          `
          errorMsg.innerHTML = `
            <i class="fa fa-map-location-dot" style="font-size: 2.5rem; color: #dc2626; display: block; margin-bottom: 12px;"></i>
            <h3 style="color: #dc2626; font-size: 1rem; margin-bottom: 8px; font-weight: 800;">Lokasi Tidak Valid</h3>
            <p style="color: #991b1b; font-size: .85rem; line-height: 1.6; margin-bottom: 12px;">
              ${radiusCheck.message}
            </p>
            <p style="color: #6b7280; font-size: .75rem;">
              📍 Kantor: ${radiusCheck.kantor}<br>
              📏 Jarak: ${radiusCheck.jarak}m / ${radiusCheck.radius}m
            </p>
            <button onclick="this.parentElement.remove()" style="margin-top: 12px; padding: 8px 16px; 
              background: #dc2626; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 700;">
              Tutup
            </button>
          `
          document.body.appendChild(errorMsg)
          return
        }
      }

      // Tentukan status_absensi
      let status_absensi = 'open'

      // Cek salah absen (shift special tapi tetap absen)
      if (['OFF', 'CUTI', 'SAKIT', 'IZIN'].includes(todayShift.nama_shift)) {
        status_absensi = 'salah absen'
      }

      // Cek lupa absen pulang kemarin
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

      await submitAbsen({
        nama:           user.nama_lengkap,
        tanggal:        new Date().toISOString().split('T')[0],
        waktu_masuk:    new Date().toISOString(),
        lat_masuk:      loc.lat,
        lng_masuk:      loc.lng,
        foto_masuk:     window.photo || null,
        status_masuk:   checkStatus(todayShift.jam_masuk).status,
        status_absensi
      })

      stopCamera(video)
      renderAbsensi(user)
    }
    return
  }

  /* ---- Sudah masuk, belum pulang ---- */
  if (absen && !absen.waktu_pulang) {
    actionBox.innerHTML =
      makeBtn('btnFoto2', 'fa-camera', 'Ambil Foto') +
      makeBtn('btnPulang', 'fa-sign-out-alt', 'Absen Pulang', true)

    document.getElementById('btnFoto2').onclick = () => {
      window.photo = takePhoto(video, canvas)
      photoStatus.innerHTML = '<i class="fa fa-check" style="color:var(--success);"></i> Foto berhasil diambil'
    }

    document.getElementById('btnPulang').onclick = async () => {
      const btn = document.getElementById('btnPulang')
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'

      let loc = { lat: null, lng: null }
      try { loc = await getLocation() } catch {}

      // Jika sebelumnya status_absensi masih open dan masuk+pulang lengkap → set complete
      const status_absensi = absen.status_absensi === 'open' ? 'complete' : absen.status_absensi

      await supabase.from('absensi').update({
        waktu_pulang:   new Date().toISOString(),
        lat_pulang:     loc.lat,
        lng_pulang:     loc.lng,
        foto_pulang:    window.photo || null,
        status_absensi  // update ke complete kalau open
      }).eq('id', absen.id)

      stopCamera(video)
      renderAbsensi(user)
    }
  }
}

/* ================= RIWAYAT (delegate) ================= */
export async function renderRiwayat() {
  const { renderRiwayat: rr } = await import('./riwayat.js')
  rr(window.currentUser)
}
