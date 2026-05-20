import { supabase } from './supabase.js'
import { openCamera, takePhoto, getLocation, checkStatus } from './absensi.js'
import { submitAbsen } from './submit_absensi.js'

window.activeVideoStream = null

function stopCamera(video) {
  const stream = video?.srcObject || window.activeVideoStream
  if (stream) stream.getTracks().forEach(t => t.stop())
  if (video) video.srcObject = null
  window.activeVideoStream = null
}

async function getTodayAbsen(nama) {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('absensi').select('*').eq('nama', nama).eq('tanggal', today).maybeSingle()
  return data
}

async function getTodayShift(user_id) {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('jadwal').select('*').eq('user_id', user_id).eq('tanggal', today).maybeSingle()
  if (!data) return null

  if (data.status_override === 'cuti')  return { nama_shift:'CUTI',       jam_masuk:'-', jam_pulang:'-' }
  if (data.status_override === 'sakit') return { nama_shift:'SAKIT',      jam_masuk:'-', jam_pulang:'-' }
  if (data.status_override === 'izin')  return { nama_shift:'IZIN',       jam_masuk:'-', jam_pulang:'-' }
  if (data.shift_code == '2') return { nama_shift:'Shift Pagi',  jam_masuk:'07:00', jam_pulang:'15:00' }
  if (data.shift_code == '3') return { nama_shift:'Shift Sore',  jam_masuk:'15:00', jam_pulang:'23:00' }
  if (data.shift_code == '4') return { nama_shift:'Shift Malam', jam_masuk:'23:00', jam_pulang:'07:00' }
  if (data.shift_code == '8') return { nama_shift:'OFF',         jam_masuk:'-',     jam_pulang:'-' }
  return null
}

/* ================= RENDER ABSENSI ================= */
export async function renderAbsensi(user) {
  const content    = document.getElementById('content')
  const data       = await getTodayAbsen(user.nama_lengkap)
  const todayShift = await getTodayShift(user.id)

  // Status badge
  let statusLabel = 'Belum Absen'
  let statusColor = 'var(--danger)'
  let statusIcon  = 'fa-times-circle'
  if (data?.waktu_masuk && !data?.waktu_pulang) { statusLabel='Sedang Bekerja'; statusColor='var(--warning)'; statusIcon='fa-spinner fa-spin' }
  if (data?.waktu_masuk && data?.waktu_pulang)  { statusLabel='Selesai Hari Ini'; statusColor='var(--success)'; statusIcon='fa-check-circle' }

  // Shift badge
  const shiftSpecial = ['CUTI','SAKIT','IZIN','OFF'].includes(todayShift?.nama_shift)

  content.innerHTML = `
    <div style="max-width:480px;margin:0 auto;">

      <!-- STATUS CARD -->
      <div class="card fade-up" style="text-align:center;padding:24px 20px 20px;">
        <i class="fa ${statusIcon}" style="font-size:2.2rem;color:${statusColor};margin-bottom:10px;"></i>
        <div style="font-size:1rem;font-weight:800;color:${statusColor};">${statusLabel}</div>
        <div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">
          ${new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
        </div>

        <!-- Shift info -->
        ${todayShift ? `
          <div style="margin-top:14px;background:var(--gray-50);border-radius:var(--r-md);padding:12px 16px;display:inline-flex;gap:20px;align-items:center;">
            <div style="text-align:left;">
              <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;">Shift</div>
              <div style="font-weight:800;font-size:.9rem;">${todayShift.nama_shift}</div>
            </div>
            ${!shiftSpecial ? `
              <div style="text-align:left;">
                <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;">Jam</div>
                <div style="font-weight:700;font-size:.85rem;">${todayShift.jam_masuk} – ${todayShift.jam_pulang}</div>
              </div>` : ''}
          </div>` : `
          <div style="margin-top:14px;background:var(--warning-light);border-radius:var(--r-md);padding:10px 16px;font-size:.82rem;color:var(--warning-dark);">
            ⚠ Tidak ada jadwal hari ini
          </div>`}

        <!-- Waktu absen -->
        ${data?.waktu_masuk ? `
          <div style="margin-top:14px;display:flex;justify-content:center;gap:24px;">
            <div style="text-align:center;">
              <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Masuk</div>
              <div style="font-weight:800;font-size:.95rem;color:var(--success);">
                ${new Date(data.waktu_masuk).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>
            ${data.waktu_pulang ? `
              <div style="text-align:center;">
                <div style="font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Pulang</div>
                <div style="font-weight:800;font-size:.95rem;color:var(--primary);">
                  ${new Date(data.waktu_pulang).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>` : ''}
          </div>` : ''}
      </div>

      <!-- KAMERA + AKSI -->
      <div class="card fade-up-1" id="absensiActionCard">
        <!-- Diisi JS -->
      </div>

    </div>
  `

  const actionCard = document.getElementById('absensiActionCard')

  // Tidak ada shift / special
  if (!todayShift || shiftSpecial) {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:16px;">
        <i class="fa fa-ban" style="font-size:1.8rem;color:var(--gray-300);margin-bottom:10px;"></i>
        <p style="color:var(--text-muted);font-size:.88rem;">
          ${!todayShift ? 'Tidak ada jadwal hari ini' : `Jadwal hari ini: <strong>${todayShift.nama_shift}</strong>`}
        </p>
      </div>`
    return
  }

  // Sudah absen masuk & pulang
  if (data?.waktu_masuk && data?.waktu_pulang) {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:16px;">
        <i class="fa fa-check-circle" style="font-size:2rem;color:var(--success);margin-bottom:8px;"></i>
        <p style="font-weight:700;color:var(--success);">Absensi hari ini sudah lengkap</p>
      </div>`
    return
  }

  // Render kamera + tombol
  actionCard.innerHTML = `
    <div style="position:relative;border-radius:var(--r-md);overflow:hidden;background:#000;margin-bottom:14px;" id="camWrap">
      <video id="video" autoplay playsinline style="width:100%;display:block;max-height:260px;object-fit:cover;"></video>
      <div id="photoOverlay" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">
        <span style="color:#fff;font-size:.8rem;font-weight:700;background:rgba(0,0,0,.5);padding:6px 12px;border-radius:99px;">
          <i class="fa fa-check"></i> Foto diambil
        </span>
      </div>
    </div>
    <canvas id="canvas" style="display:none;"></canvas>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" id="actionBox"></div>
    <p id="photoStatus" style="text-align:center;font-size:.75rem;color:var(--text-muted);margin-top:8px;"></p>
  `

  const video     = document.getElementById('video')
  const canvas    = document.getElementById('canvas')
  const actionBox = document.getElementById('actionBox')
  const photoStatus = document.getElementById('photoStatus')
  let photo = null

  try {
    await openCamera(video)
  } catch {
    document.getElementById('camWrap').innerHTML = `
      <div style="background:var(--gray-100);border-radius:var(--r-md);padding:20px;text-align:center;color:var(--text-muted);font-size:.82rem;">
        <i class="fa fa-camera-slash"></i> Kamera tidak tersedia
      </div>`
  }

  function makeBtn(id, icon, label, primary = false) {
    return `<button id="${id}" class="${primary ? 'btn-primary' : 'btn-secondary'}" style="width:100%;">
      <i class="fa ${icon}"></i> ${label}
    </button>`
  }

  // BELUM ABSEN MASUK
  if (!data) {
    actionBox.innerHTML = makeBtn('btnFoto','fa-camera','Ambil Foto') + makeBtn('btnMasuk','fa-sign-in-alt','Absen Masuk', true)

    document.getElementById('btnFoto').onclick = () => {
      photo = takePhoto(video, canvas)
      window.photo = photo
      photoStatus.innerHTML = '<i class="fa fa-check" style="color:var(--success);"></i> Foto berhasil diambil'
    }

    document.getElementById('btnMasuk').onclick = async () => {
      const btn = document.getElementById('btnMasuk')
      btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'

      let loc = { lat: null, lng: null }
      try { loc = await getLocation() } catch {}

      let status_absensi = 'open'
      if (['OFF','CUTI','SAKIT','IZIN'].includes(todayShift.nama_shift)) status_absensi = 'salah absen'

      // Cek lupa absen pulang kemarin
      const yDate = new Date(); yDate.setDate(yDate.getDate()-1)
      const { data: lastAbsen } = await supabase.from('absensi').select('*')
        .eq('nama', user.nama_lengkap).eq('tanggal', yDate.toISOString().split('T')[0]).maybeSingle()
      if (lastAbsen?.waktu_masuk && !lastAbsen?.waktu_pulang) status_absensi = 'lupa absen pulang'

      await submitAbsen({
        nama: user.nama_lengkap,
        tanggal: new Date().toISOString().split('T')[0],
        waktu_masuk: new Date().toISOString(),
        lat_masuk: loc.lat, lng_masuk: loc.lng,
        foto_masuk: window.photo || null,
        status_masuk: checkStatus(todayShift.jam_masuk),
        status_absensi
      })
      stopCamera(video)
      renderAbsensi(user)
    }
    return
  }

  // SUDAH MASUK, BELUM PULANG
  if (data && !data.waktu_pulang) {
    actionBox.innerHTML = makeBtn('btnFoto2','fa-camera','Ambil Foto') + makeBtn('btnPulang','fa-sign-out-alt','Absen Pulang', true)

    document.getElementById('btnFoto2').onclick = () => {
      photo = takePhoto(video, canvas)
      window.photo = photo
      photoStatus.innerHTML = '<i class="fa fa-check" style="color:var(--success);"></i> Foto berhasil diambil'
    }

    document.getElementById('btnPulang').onclick = async () => {
      const btn = document.getElementById('btnPulang')
      btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'

      let loc = { lat: null, lng: null }
      try { loc = await getLocation() } catch {}

      await supabase.from('absensi').update({
        waktu_pulang: new Date().toISOString(),
        lat_pulang: loc.lat, lng_pulang: loc.lng,
        foto_pulang: window.photo || null
      }).eq('id', data.id)

      stopCamera(video)
      renderAbsensi(user)
    }
  }
}

/* ================= RIWAYAT (legacy, masih dipakai ui.js) ================= */
export async function renderRiwayat() {
  // Delegate ke riwayat.js
  const { renderRiwayat: rr } = await import('./riwayat.js')
  rr(window.currentUser)
}
