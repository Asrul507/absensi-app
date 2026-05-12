import { supabase } from './supabase.js'
import { openCamera, takePhoto, getLocation, checkStatus } from './absensi.js'
import { submitAbsen } from './submit_absensi.js'

/* ================= MENU ================= */
function renderMenu(role) {

  const sidebar = document.getElementById('sidebar')

  let menu = [
    { key: 'dashboard', name: 'Dashboard' },
    { key: 'absensi', name: 'Absensi' },
    { key: 'riwayat', name: 'Riwayat' } // 🔥 PAKSA ADA
  ]

  if (role === 'admin' || role === 'super_admin') {
    menu.push(
      { key: 'shift', name: 'Shift' },
      { key: 'jadwal', name: 'Jadwal' },
      { key: 'users', name: 'Users' },
      { key: 'rekap', name: 'Rekap' },
      { key: 'settings', name: 'Settings' }
    )
  }

  sidebar.innerHTML = `
    <div class="sidebar-nav">
      ${menu.map(m => `
        <a href="#" onclick="navigate('${m.key}')">
          ${m.name}
        </a>
      `).join('')}
    </div>
  `
}
/* ================= GLOBAL CAMERA ================= */
window.activeVideoStream = null

function stopCamera(video) {

  const stream = video?.srcObject || window.activeVideoStream

  if (stream) {
    stream.getTracks().forEach(track => track.stop())
  }

  if (video) video.srcObject = null
  window.activeVideoStream = null
}

/* ================= CEK ABSEN HARI INI ================= */
async function getTodayAbsen(nama) {

  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('absensi')
    .select('*')
    .eq('nama', nama)
    .eq('tanggal', today)
    .maybeSingle()

  return data
}
/* ================= GET SHIFT HARI INI ================= */
async function getTodayShift(user_id) {

  const today =
    new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('jadwal')
    .select(`
      *,
      shift:shift_id(
        id,
        nama_shift,
        jam_masuk,
        jam_pulang,
        keterangan
      )
    `)
    .eq('user_id', user_id)
    .eq('tanggal', today)
    .maybeSingle()

  if (error) {
    console.error(error)
    return null
  }

  return data?.shift || null
}

/* ================= RENDER ABSENSI ================= */
export async function renderAbsensi(user, shift) {

  const content = document.getElementById('content')

  const data =
    await getTodayAbsen(user.nama_lengkap)

  const todayShift =
    await getTodayShift(user.id)

  let status = "❌ Belum absen masuk"

  if (data?.waktu_masuk && !data?.waktu_pulang) {
    status = "🟡 Sudah masuk, belum pulang"
  }

  if (data?.waktu_masuk && data?.waktu_pulang) {
    status = "🟢 Sudah selesai hari ini"
  }

  content.innerHTML = `

    <div class="card">

      <h3>Absensi Hari Ini</h3>

      <p style="font-weight:bold;">
        ${status}
      </p>

      <!-- SHIFT INFO -->
      <div class="shift-info">

        ${
          todayShift
          ? `
            <div class="shift-box">

              <h4>
                ${todayShift.nama_shift}
              </h4>

              <p>
                ${todayShift.jam_masuk}
                -
                ${todayShift.jam_pulang}
              </p>

              <small>
                ${todayShift.keterangan || ''}
              </small>

            </div>
          `
          : `
            <div class="shift-box">

              <h4>
                Tidak Ada Shift
              </h4>

              <p>
                Hubungi Admin
              </p>

            </div>
          `
        }

      </div>

      <!-- CAMERA -->
      <video
        id="video"
        autoplay
        playsinline
        style="
          width:100%;
          border-radius:10px;
          margin-top:15px;
        ">
      </video>

      <canvas
        id="canvas"
        style="display:none;">
      </canvas>

      <!-- BUTTON -->
      <div
        id="actionBox"
        style="
          display:flex;
          gap:10px;
          margin-top:15px;
          flex-wrap:wrap;
        ">
      </div>

    </div>
  `

  const video =
    document.getElementById('video')

  const canvas =
    document.getElementById('canvas')

  const actionBox =
    document.getElementById('actionBox')

  if (video) {
    await openCamera(video)
  }

  let photo = null

  /* ================= NO SHIFT ================= */
  if (!todayShift) {

    actionBox.innerHTML = `

      <button disabled>
        Tidak Ada Shift Hari Ini
      </button>

    `

    return
  }

  /* ================= BELUM ABSEN ================= */
  if (!data) {

    actionBox.innerHTML = `

      <button id="btnPhoto">
        📸 Foto
      </button>

      <button id="btnMasuk">
        Absen Masuk
      </button>

    `

    document.getElementById('btnPhoto').onclick = () => {

      photo = takePhoto(video, canvas)

      window.photo = photo

      alert('Foto berhasil diambil')
    }

    document.getElementById('btnMasuk').onclick = async () => {

      const loc = await getLocation()

      await submitAbsen({

        nama: user.nama_lengkap,

        tanggal:
          new Date().toISOString().split('T')[0],

        waktu_masuk:
          new Date().toISOString(),

        lat_masuk: loc.lat,

        lng_masuk: loc.lng,

        foto_masuk:
          window.photo || null,

        status_masuk:
          checkStatus(
            todayShift.jam_masuk
          ),

        shift_id:
          todayShift.id

      })

      stopCamera(video)

      alert('Absen masuk berhasil')

      renderAbsensi(user, shift)
    }

    return
  }

  /* ================= BELUM PULANG ================= */
  if (data && !data.waktu_pulang) {

    actionBox.innerHTML = `

      <button id="btnPhoto">
        📸 Foto
      </button>

      <button id="btnPulang">
        Absen Pulang
      </button>

    `

    document.getElementById('btnPhoto').onclick = () => {

      photo = takePhoto(video, canvas)

      window.photo = photo

      alert('Foto berhasil diambil')
    }

    document.getElementById('btnPulang').onclick = async () => {

      const loc = await getLocation()

      await supabase
        .from('absensi')
        .update({

          waktu_pulang:
            new Date().toISOString(),

          lat_pulang:
            loc.lat,

          lng_pulang:
            loc.lng,

          foto_pulang:
            window.photo || null

        })
        .eq('id', data.id)

      stopCamera(video)

      alert('Absen pulang berhasil')

      renderAbsensi(user, shift)
    }

    return
  }

  /* ================= DONE ================= */
  actionBox.innerHTML = `

    <button disabled>
      ✔ Sudah Absen Hari Ini
    </button>

  `

  stopCamera(video)
}

//===========Riwayat===================

export async function renderRiwayat() {

  const content = document.getElementById('content')

  const user = window.currentUser

  if (!user) {
    content.innerHTML = `
      <div class="card">
        <h3>⚠️ User belum login</h3>
      </div>
    `
    return
  }
  

  const { data, error } = await supabase
    .from('absensi')
    .select('*')
    .eq('nama', user.nama_lengkap)
    .order('tanggal', { ascending: false })

  if (error) {
    content.innerHTML = `<div class="card">Error load riwayat</div>`
    return
  }

  content.innerHTML = `
    <div class="card">
      <h2>Riwayat Absensi</h2>

      <table>
        <tr>
          <th>Tanggal</th>
          <th>Masuk</th>
          <th>Pulang</th>
          <th>Status</th>
        </tr>

        ${data.map(r => `
          <tr>
            <td>${r.tanggal}</td>
            <td>${r.waktu_masuk || '-'}</td>
            <td>${r.waktu_pulang || '-'}</td>
            <td>${r.status_masuk || '-'}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `
}
