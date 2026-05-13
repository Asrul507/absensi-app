import { supabase } from './supabase.js'

import {
  openCamera,
  takePhoto,
  getLocation,
  checkStatus
} from './absensi.js'

import {
  submitAbsen
} from './submit_absensi.js'


/* ================= MENU ================= */
function renderMenu(role) {

  const sidebar =
    document.getElementById('sidebar')

  let menu = [
    { key: 'dashboard', name: 'Dashboard' },
    { key: 'absensi', name: 'Absensi' },
    { key: 'riwayat', name: 'Riwayat' }
  ]

  if (
    role === 'admin' ||
    role === 'super_admin'
  ) {

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
        <a href="#"
          onclick="navigate('${m.key}')">

          ${m.name}

        </a>
      `).join('')}

    </div>
  `
}


/* ================= CAMERA ================= */
window.activeVideoStream = null

function stopCamera(video) {

  const stream =
    video?.srcObject ||
    window.activeVideoStream

  if (stream) {
    stream
      .getTracks()
      .forEach(track => track.stop())
  }

  if (video) {
    video.srcObject = null
  }

  window.activeVideoStream = null
}


/* ================= ABSEN HARI INI ================= */
async function getTodayAbsen(nama) {

  const today =
    new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('absensi')
    .select('*')
    .eq('nama', nama)
    .eq('tanggal', today)
    .maybeSingle()

  return data
}


/* ================= SHIFT HARI INI ================= */
async function getTodayShift(user_id) {

  const today =
    new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('jadwal')
    .select('*')
    .eq('user_id', user_id)
    .eq('tanggal', today)
    .maybeSingle()

  if (error) {
    console.log(error)
    return null
  }

  if (!data) {
    return null
  }

  // SHIFT PAGI
  if (data.shift_code == "2") {
    return {
      nama_shift: "Shift Pagi",
      jam_masuk: "07:00",
      jam_pulang: "15:00"
    }
  }

  // SHIFT SORE
  if (data.shift_code == "3") {
    return {
      nama_shift: "Shift Sore",
      jam_masuk: "15:00",
      jam_pulang: "23:00"
    }
  }

  // SHIFT MALAM
  if (data.shift_code == "4") {
    return {
      nama_shift: "Shift Malam",
      jam_masuk: "23:00",
      jam_pulang: "07:00"
    }
  }

  // OFF
  if (data.shift_code == "8") {
    return {
      nama_shift: "OFF",
      jam_masuk: "-",
      jam_pulang: "-"
    }
  }

  // CUTI
  if (data.status_override === "cuti") {
    return {
      nama_shift: "CUTI",
      jam_masuk: "-",
      jam_pulang: "-"
    }
  }

  // SAKIT
  if (data.status_override === "sakit") {
    return {
      nama_shift: "SAKIT",
      jam_masuk: "-",
      jam_pulang: "-"
    }
  }

  // IZIN
  if (data.status_override === "izin") {
    return {
      nama_shift: "IZIN",
      jam_masuk: "-",
      jam_pulang: "-"
    }
  }

  return null
}


/* ================= RENDER ABSENSI ================= */
export async function renderAbsensi(user) {

  const content =
    document.getElementById('content')

  const data =
    await getTodayAbsen(
      user.nama_lengkap
    )

  const todayShift =
    await getTodayShift(user.id)

  let status =
    "❌ Belum absen masuk"

  if (
    data?.waktu_masuk &&
    !data?.waktu_pulang
  ) {
    status =
      "🟡 Sudah masuk, belum pulang"
  }

  if (
    data?.waktu_masuk &&
    data?.waktu_pulang
  ) {
    status =
      "🟢 Sudah selesai hari ini"
  }

  content.innerHTML = `

    <div class="card">

      <h3>Absensi Hari Ini</h3>

      <p style="font-weight:bold;">
        ${status}
      </p>

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

            </div>
          `
          : `
            <div class="shift-box">

              <h4>
                Tidak Ada Shift
              </h4>

            </div>
          `
        }

      </div>

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

  /* ================= CAMERA SAFE ================= */

  try {

    await openCamera(video)

  } catch (err) {

    console.log(
      'Camera Error:',
      err
    )

    video.style.display = 'none'
  }

  let photo = null

  /* ================= TIDAK ADA SHIFT ================= */

  if (!todayShift) {

    actionBox.innerHTML = `
      <button disabled>
        Tidak Ada Shift Hari Ini
      </button>
    `

    return
  }

  /* ================= SUDAH CUTI / IZIN / SAKIT ================= */

  if (
  todayShift.nama_shift === "CUTI" ||
  todayShift.nama_shift === "SAKIT" ||
  todayShift.nama_shift === "IZIN" ||
  todayShift.nama_shift === "OFF"
) {

  status =
    "⚠ Jadwal hari ini: " +
    todayShift.nama_shift

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

    document.getElementById(
      'btnPhoto'
    ).onclick = () => {

      photo =
        takePhoto(video, canvas)

      window.photo = photo

      alert('Foto berhasil diambil')
    }

    document.getElementById(
      'btnMasuk'
    ).onclick = async () => {

      const loc =
        await getLocation()

      let status_absensi = "open"

// ================= SALAH ABSEN =================

if (
  todayShift.nama_shift === "OFF" ||
  todayShift.nama_shift === "CUTI" ||
  todayShift.nama_shift === "SAKIT" ||
  todayShift.nama_shift === "IZIN"
) {
  status_absensi = "salah absen"
}

// ================= CEK KEMARIN =================

const yesterday = new Date()

yesterday.setDate(
  yesterday.getDate() - 1
)

const yDate =
  yesterday.toISOString()
  .split('T')[0]

const { data: lastAbsen } =
  await supabase
    .from('absensi')
    .select('*')
    .eq('nama', user.nama_lengkap)
    .eq('tanggal', yDate)
    .maybeSingle()

if (
  lastAbsen &&
  lastAbsen.waktu_masuk &&
  !lastAbsen.waktu_pulang
) {
  status_absensi =
    "lupa absen pulang"
}

await submitAbsen({

  nama:
    user.nama_lengkap,

  tanggal:
    new Date()
    .toISOString()
    .split('T')[0],

  waktu_masuk:
    new Date().toISOString(),

  lat_masuk:
    loc.lat,

  lng_masuk:
    loc.lng,

  foto_masuk:
    window.photo || null,

  status_masuk:
    checkStatus(
      todayShift.jam_masuk
    ),

  status_absensi

})

      stopCamera(video)

      alert('Absen masuk berhasil')

      renderAbsensi(user)
    }

    return
  }

  /* ================= BELUM PULANG ================= */

if (!data) {

  actionBox.innerHTML = `

    <button id="btnPhoto">
      📸 Foto
    </button>

    <button id="btnPulangLangsung">
      Absen Pulang
    </button>

  `

  document.getElementById(
    'btnPhoto'
  ).onclick = () => {

    photo =
      takePhoto(video, canvas)

    window.photo = photo

    alert('Foto berhasil diambil')
  }

  document.getElementById(
    'btnPulangLangsung'
  ).onclick = async () => {

    const loc =
      await getLocation()

    await supabase
      .from('absensi')
      .insert([{

        nama:
          user.nama_lengkap,

        tanggal:
          new Date()
          .toISOString()
          .split('T')[0],

        waktu_pulang:
          new Date().toISOString(),

        lat_pulang:
          loc.lat,

        lng_pulang:
          loc.lng,

        foto_pulang:
          window.photo || null,

        status_absensi:
          "lupa absen datang"

      }])

    alert(
      "Tercatat lupa absen datang"
    )

    renderAbsensi(user)
  }
}
  
  if (
    data &&
    !data.waktu_pulang
  ) {

    actionBox.innerHTML = `

      <button id="btnPhoto">
        📸 Foto
      </button>

      <button id="btnPulang">
        Absen Pulang
      </button>

    `

    document.getElementById(
      'btnPhoto'
    ).onclick = () => {

      photo =
        takePhoto(video, canvas)

      window.photo = photo

      alert('Foto berhasil diambil')
    }

    document.getElementById(
      'btnPulang'
    ).onclick = async () => {

      const loc =
        await getLocation()

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

      renderAbsensi(user)
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


/* ================= RIWAYAT ================= */
export async function renderRiwayat() {

  const content =
    document.getElementById('content')

  const user =
    window.currentUser

  if (!user) {

    content.innerHTML = `
      <div class="card">
        <h3>
          Silakan login terlebih dahulu
        </h3>
      </div>
    `

    return
  }

  content.innerHTML = `
    <div class="card">
      <h3>Loading Riwayat...</h3>
    </div>
  `

  const { data, error } =
    await supabase
      .from('absensi')
      .select('*')
      .eq('nama', user.nama_lengkap)
      .order('tanggal', {
        ascending: false
      })

  if (error) {

    content.innerHTML = `
      <div class="card">
        Gagal load riwayat
      </div>
    `

    return
  }

  if (!data || data.length === 0) {

    content.innerHTML = `
      <div class="card">
        Belum ada riwayat
      </div>
    `

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
          <th>Keterangan</th>
        </tr>

        ${data.map(r => `

          <tr>

            <td>
              ${r.tanggal}
            </td>

            <td>
              ${r.waktu_masuk || '-'}
            </td>

            <td>
              ${r.waktu_pulang || '-'}
            </td>

           <td>
  ${r.status_masuk || '-'}
</td>

<td>
  ${r.status_absensi || 'open'}
</td>

          </tr>

        `).join('')}

      </table>

    </div>
  `
}
