/**
 * js/ui.js
 * ============================================================
 * PATCH KEAMANAN TAHAP 1: ANTI-CHEAT JAM (Server-Side Time)
 *
 * PERUBAHAN KRITIS DARI VERSI SEBELUMNYA:
 *
 * [ABSEN MASUK]
 *   Kolom `waktu_masuk` DIHAPUS dari payload client-side yang dikirim ke
 *   fungsi submitAbsen(). Waktu masuk kini sepenuhnya ditangani oleh
 *   PostgreSQL melalui DEFAULT value `now()` pada kolom `waktu_masuk`
 *   di tabel `absensi`. Ini mencegah manipulasi jam dari sisi perangkat.
 *
 *   PRASYARAT DATABASE (jalankan sekali di SQL Editor Supabase):
 *     ALTER TABLE absensi
 *       ALTER COLUMN waktu_masuk SET DEFAULT now();
 *
 * [ABSEN PULANG]
 *   Kolom `waktu_pulang` masih dikirim dari client (keterbatasan Supabase
 *   JS Client yang tidak mendukung ekspresi SQL raw pada .update()), NAMUN
 *   nilai tersebut akan DITIMPA PAKSA oleh PostgreSQL BEFORE UPDATE TRIGGER
 *   yang harus dipasang di Supabase (lihat file supabase_security.sql).
 *   Trigger tersebut memastikan `waktu_pulang` selalu menggunakan NOW()
 *   dari server, berapapun nilai yang dikirim client.
 *
 * Semua logika validasi (fixedLat, fixedLng, namaTitikTerpilih,
 * status_absensi, lupa absen pulang, salah absen) TIDAK berubah.
 *
 * PATCH BUG SHIFT MALAM LINTAS HARI:
 *   Ditambahkan `shift_code: todayShift.code` ke payload submitAbsen
 *   agar getTodayAbsen() dapat mendeteksi shift lintas hari dengan benar
 *   saat karyawan absen pulang di keesokan harinya.
 * ============================================================
 */

import { supabase } from './supabase.js'
import { toJamLokal, getTodayLokal } from './timezone.js'
import { openCamera, takePhoto, getLocation, checkStatus, getTodayAbsen, getTodayShift, checkStatusPulang, getStatusPulangReminder } from './absensi.js'
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
  const reminder = getStatusPulangReminder(absen, shift)
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
      label: reminder.status === 'Lupa Absen Pulang' ? 'Lupa Absen Pulang' : 'Belum Absen Pulang',
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
  const content = document.getElementById('content')

  // ── LOADING: Tampilkan spinner saat menunggu GPS ──────────────────────────
  content.innerHTML = `
    <div class="card fade-up" style="padding:30px; text-align:center; max-width:480px; margin:0 auto;">
      <i class="fa fa-satellite-dish fa-spin" style="font-size:2.4rem; color:var(--primary); margin-bottom:12px; display:block;"></i>
      <p style="font-size:.9rem; font-weight:700; color:var(--text-muted);">Menghitung jarak radius koordinat Anda...</p>
    </div>
  `

  // ── GPS: Deteksi lokasi radius terdekat ──────────────────────────────────
  const geo = await dapatkanLokasiAbsenAktif()

  let dropdownOptions = ''
  let statusBadge     = ''
  let latAbsen        = geo.lat || null
  let lngAbsen        = geo.lng || null

  if (geo.status === 'success' && geo.areas.length > 0) {
    statusBadge = `<span class="badge badge-success" style="padding:6px 12px; font-size:.72rem; border-radius:999px; font-weight:800; display:inline-block; margin-top:6px; background:#dcfce7; color:#15803d; border:1px solid #bbf7d0;"><i class="fa fa-location-dot"></i> Berada Di Area Kerja</span>`
    dropdownOptions = geo.areas.map(a => `<option value="${a.nama_titik}">${a.nama_titik} (${a.jarak_meter}m)</option>`).join('')
  } else {
    statusBadge = `<span class="badge badge-danger" style="padding:6px 12px; font-size:.72rem; border-radius:999px; font-weight:800; display:inline-block; margin-top:6px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;"><i class="fa fa-building-circle-exclamation"></i> Luar Radius (Testing Mode)</span>`
    dropdownOptions = `<option value="Luar Radius (Testing)">[LUAR RADIUS / TESTING]</option>`
  }

  // ── DATA: Ambil absensi hari ini dan jadwal shift ────────────────────────
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
    const reminder = getStatusPulangReminder(absen, todayShift)
    statusLabel = reminder.status === 'Lupa Absen Pulang' ? 'Lupa Absen Pulang' : 'Sedang Bekerja'
    statusColor = reminder.status === 'Lupa Absen Pulang' ? 'var(--danger)' : 'var(--warning)'
    statusIcon  = reminder.status === 'Lupa Absen Pulang' ? 'fa-triangle-exclamation' : 'fa-spinner fa-spin'
  } else if (absen?.status_absensi === 'salah absen') {
    statusLabel = 'Salah Absen'
    statusColor = 'var(--danger)'
    statusIcon  = 'fa-circle-xmark'
  }

  // ── RENDER: Kartu status utama ───────────────────────────────────────────
  content.innerHTML = `
    <div style="max-width:480px;margin:0 auto;">

      <div class="card fade-up" style="text-align:center;padding:24px 20px 20px;">
        <i class="fa ${statusIcon}" style="font-size:2.4rem;color:${statusColor};margin-bottom:10px;display:block;"></i>
        <div style="font-size:1rem;font-weight:800;color:${statusColor};">${statusLabel}</div>

        <div style="margin-bottom:4px;">${statusBadge}</div>

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
                ${toJamLokal(absen.waktu_masuk)}
              </div>
              ${absen.status_masuk ? `<div style="font-size:.65rem;font-weight:700;margin-top:2px; color:${absen.status_masuk==='Terlambat'?'var(--danger)':'var(--success)'};">
                ${absen.status_masuk}</div>` : ''}
            </div>
            ${absen.waktu_pulang ? `
              <div style="width:1px;background:var(--gray-200);"></div>
              <div style="text-align:center;">
                <div style="font-size:.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Pulang</div>
                <div style="font-weight:900;font-size:1.1rem;color:var(--primary);">
                  ${toJamLokal(absen.waktu_pulang)}
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

  // ── GUARD: Shift libur / izin, tidak perlu aksi ──────────────────────────
  if (shiftSpecial && absen?.status_absensi !== 'salah absen') {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:18px 12px;">
        <i class="fa fa-circle-check" style="font-size:2rem;color:var(--success);margin-bottom:8px;display:block;"></i>
        <p style="font-weight:800;color:var(--success);font-size:.95rem;">Tidak perlu absen hari ini</p>
        <p style="color:var(--text-muted);font-size:.8rem;margin-top:4px;">Jadwal: ${todayShift.nama_shift}</p>
      </div>`
    return
  }

  // ── GUARD: Tidak ada jadwal ──────────────────────────────────────────────
  if (!todayShift) {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:18px 12px;">
        <i class="fa fa-calendar-xmark" style="font-size:1.8rem;color:var(--gray-300);margin-bottom:8px;display:block;"></i>
        <p style="color:var(--text-muted);font-size:.88rem;">Tidak ada jadwal hari ini</p>
      </div>`
    return
  }

  // ── GUARD: Absensi sudah lengkap ─────────────────────────────────────────
  if (absen?.waktu_masuk && absen?.waktu_pulang) {
    actionCard.innerHTML = `
      <div style="text-align:center;padding:18px 12px;">
        <i class="fa fa-circle-check" style="font-size:2rem;color:var(--success);margin-bottom:8px;display:block;"></i>
        <p style="font-weight:800;color:var(--success);font-size:.95rem;">Absensi hari ini sudah lengkap</p>
      </div>`
    return
  }

  // ── UI: Render kamera + dropdown lokasi ─────────────────────────────────
  actionCard.innerHTML = `
    <input type="hidden" id="geoLatInput" value="${latAbsen}">
    <input type="hidden" id="geoLngInput" value="${lngAbsen}">

    <div class="field" style="margin-bottom: 12px; padding: 0 4px;">
      <label style="font-size:.7rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Lokasi Unit Absen Kerja</label>
      <select id="selectLokasiAbsen" style="width:100%; padding:10px; margin-top:4px; border-radius:var(--r-md); border:1.5px solid var(--border); font-weight:700; font-size:0.82rem; background:#f8fafc; color:var(--text);">
        ${dropdownOptions}
      </select>
    </div>

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

  // ══════════════════════════════════════════════════════════════════════════
  // ABSEN MASUK
  // ANTI-CHEAT: `waktu_masuk` TIDAK dikirim dari client.
  // Kolom ini diisi otomatis oleh PostgreSQL via DEFAULT now().
  // Pastikan kolom waktu_masuk di tabel absensi sudah dikonfigurasi:
  //   ALTER TABLE absensi ALTER COLUMN waktu_masuk SET DEFAULT now();
  // ══════════════════════════════════════════════════════════════════════════
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

      // Baca koordinat GPS dan pilihan lokasi dari UI
      const fixedLat          = document.getElementById('geoLatInput').value
      const fixedLng          = document.getElementById('geoLngInput').value
      const namaTitikTerpilih = document.getElementById('selectLokasiAbsen').value

      // ── Logika pengunci status absensi (Anti-Cheat Lokasi) ──────────────
      let status_absensi = 'open'

      // Jika titik dipilih tidak sesuai jatah radius karyawan → salah absen
      if (user.titik_radius && namaTitikTerpilih !== user.titik_radius) {
        status_absensi = 'salah absen'
      }

      // Jika hari ini adalah hari libur/izin/cuti → tidak boleh absen masuk
      if (['OFF', 'CUTI', 'SAKIT', 'IZIN'].includes(todayShift.nama_shift)) {
        status_absensi = 'salah absen'
      }

      // Cek apakah kemarin lupa absen pulang
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

      // ── ANTI-CHEAT JAM MASUK ─────────────────────────────────────────────
      // `waktu_masuk` SENGAJA TIDAK DISERTAKAN dalam payload ini.
      // PostgreSQL akan mengisi kolom ini secara otomatis dengan NOW()
      // berdasarkan DEFAULT value yang sudah dikonfigurasi di database.
      // Karyawan tidak dapat memanipulasi jam masuk dari sisi perangkat.
      //
      // PATCH BUG SHIFT MALAM: shift_code ditambahkan ke payload agar
      // getTodayAbsen() dapat mendeteksi shift lintas hari dengan benar
      // ketika karyawan absen pulang di hari berikutnya.
      await submitAbsen({
        nama:             user.nama_lengkap,
        tanggal:          getTodayLokal(),
        // waktu_masuk   ← DIHAPUS: diisi oleh DB DEFAULT now()
        shift_code:       todayShift.code || null,          // ← PATCH: simpan shift_code
        lat_masuk:        fixedLat !== 'null' ? Number(fixedLat) : null,
        lng_masuk:        fixedLng !== 'null' ? Number(fixedLng) : null,
        foto_masuk:       window.photo || null,
        status_masuk:     hasilCheck.status,
        menit_terlambat:  hasilCheck.status === 'Terlambat' ? hasilCheck.minutesLate : 0,
        jam_jadwal_masuk: todayShift.jam_masuk,
        status_absensi:   status_absensi,
        lokasi_masuk:     namaTitikTerpilih
      })

      stopCamera(video)
      renderAbsensi(user)
    }
    return
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ABSEN PULANG
  // ANTI-CHEAT: `waktu_pulang` dikirim dari client sebagai nilai sementara,
  // namun akan DITIMPA PAKSA oleh PostgreSQL BEFORE UPDATE TRIGGER dengan
  // nilai NOW() dari server. Trigger ini mencegah karyawan mundurkan atau
  // majukan jam pulang.
  //
  // Pastikan trigger `trg_lock_waktu_pulang` sudah terpasang di Supabase
  // (lihat file supabase_security.sql, bagian TRIGGER JAM SERVER).
  // ══════════════════════════════════════════════════════════════════════════
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

      // Baca koordinat GPS dan pilihan lokasi dari UI
      const fixedLat          = document.getElementById('geoLatInput').value
      const fixedLng          = document.getElementById('geoLngInput').value
      const namaTitikTerpilih = document.getElementById('selectLokasiAbsen').value

      // ── Logika pengunci status absensi (Anti-Cheat Lokasi) ──────────────
      let status_absensi = absen.status_absensi

      // Jika saat pulang ganti titik yang bukan jatahnya → salah absen
      if (user.titik_radius && namaTitikTerpilih !== user.titik_radius) {
        status_absensi = 'salah absen'
      } else if (status_absensi === 'open') {
        status_absensi = 'complete'
      }

      const hasilPulang = checkStatusPulang(todayShift.jam_pulang)

      // ── ANTI-CHEAT JAM PULANG ────────────────────────────────────────────
      // `waktu_pulang` dikirim sebagai nilai placeholder dari client.
      // Nilai ini AKAN DITIMPA oleh BEFORE UPDATE TRIGGER di PostgreSQL
      // yang memaksa penggunaan NOW() dari server.
      // Dengan demikian karyawan tidak bisa memanipulasi jam pulang
      // meskipun jam di HP mereka diubah secara manual.
      await supabase.from('absensi').update({
        waktu_pulang:       new Date().toISOString(), // ← akan ditimpa trigger DB dengan NOW()
        lat_pulang:         fixedLat !== 'null' ? Number(fixedLat) : null,
        lng_pulang:         fixedLng !== 'null' ? Number(fixedLng) : null,
        foto_pulang:        window.photo || null,
        status_absensi,
        status_pulang:      hasilPulang.status,
        menit_pulang_cepat: hasilPulang.minutesEarly,
        lokasi_pulang:      namaTitikTerpilih
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
