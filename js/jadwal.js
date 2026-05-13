import { supabase } from './supabase.js'

/* ================= SHIFT HELPER ================= */
function getShiftInfo(code) {

  if (code == "2") {
    return {
      nama: "Shift Pagi",
      jam: "07:00 - 15:00"
    }
  }

  if (code == "3") {
    return {
      nama: "Shift Sore",
      jam: "15:00 - 23:00"
    }
  }

  if (code == "4") {
    return {
      nama: "Shift Malam",
      jam: "23:00 - 07:00"
    }
  }

  if (code == "8") {
    return {
      nama: "OFF",
      jam: "-"
    }
  }

  return {
    nama: "-",
    jam: "-"
  }
}

/* ================= RENDER ================= */
export async function renderJadwalManagement() {

  const content =
    document.getElementById('content')

  /* ================= USERS ================= */
  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .eq('status_akun', 'Aktif')

  /* ================= JADWAL ================= */
  const { data: jadwal } = await supabase
    .from('jadwal')
    .select(`
      *,
      profiles:user_id(
        nama_lengkap
      )
    `)
    .order('tanggal', {
      ascending: false
    })

  const safeUsers = users || []
  const safeJadwal = jadwal || []

  content.innerHTML = `

    <div class="card">

      <h2>Jadwal Management</h2>

      <div style="
        display:grid;
        gap:10px;
        margin-top:15px;
      ">

        <input
          id="tanggalJadwal"
          type="date"
        >

        <select id="userJadwal">

          <option value="">
            Pilih Staff
          </option>

          ${safeUsers.map(u => `
            <option value="${u.id}">
              ${u.nama_lengkap}
            </option>
          `).join('')}

        </select>

        <select id="shiftJadwal">

          <option value="">
            Pilih Shift
          </option>

          <option value="2">
            Shift Pagi
          </option>

          <option value="3">
            Shift Sore
          </option>

          <option value="4">
            Shift Malam
          </option>

          <option value="8">
            OFF
          </option>

        </select>

        <button onclick="createJadwal()">
          Simpan Jadwal
        </button>

      </div>

    </div>

    <!-- ================= LIST ================= -->

    <div class="card">

      <h3>List Jadwal</h3>

      <table style="
        width:100%;
        border-collapse:collapse;
      ">

        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Nama</th>
            <th>Shift</th>
            <th>Jam</th>
            <th>Aksi</th>
          </tr>
        </thead>

        <tbody>

          ${safeJadwal.map(j => {

            let shift =
              getShiftInfo(j.shift_code)

            let shiftText =
              shift.nama

            let jamText =
              shift.jam

            /* ================= OVERRIDE ================= */

            if (j.status_override === "cuti") {
              shiftText = "🟢 CUTI"
              jamText = "-"
            }

            if (j.status_override === "sakit") {
              shiftText = "🟡 SAKIT"
              jamText = "-"
            }

            if (j.status_override === "izin") {
              shiftText = "🔵 IZIN"
              jamText = "-"
            }

            return `

              <tr>

                <td>
                  ${j.tanggal || '-'}
                </td>

                <td>
                  ${j.profiles?.nama_lengkap || '-'}
                </td>

                <td>
                  ${shiftText}
                </td>

                <td>
                  ${jamText}
                </td>

                <td>

                  <button
                    onclick="deleteJadwal('${j.id}')"
                  >
                    Hapus
                  </button>

                </td>

              </tr>

            `
          }).join('')}

        </tbody>

      </table>

    </div>

    <!-- ================= UPLOAD ================= -->

    <div class="card" style="margin-top:15px;">

      <h3>Upload Jadwal Excel</h3>

      <select id="bulanUpload">

        <option value="01">Januari</option>
        <option value="02">Februari</option>
        <option value="03">Maret</option>
        <option value="04">April</option>
        <option value="05">Mei</option>
        <option value="06">Juni</option>
        <option value="07">Juli</option>
        <option value="08">Agustus</option>
        <option value="09">September</option>
        <option value="10">Oktober</option>
        <option value="11">November</option>
        <option value="12">Desember</option>

      </select>

      <input
        type="number"
        id="tahunUpload"
        value="2026"
        placeholder="Tahun"
      >

      <input
        type="file"
        id="excelFile"
      >

      <button onclick="uploadJadwalExcel()">
        Upload
      </button>

    </div>

  `
}

/* ================= CREATE ================= */
window.createJadwal = async function () {

  const tanggal =
    document.getElementById('tanggalJadwal').value

  const user_id =
    document.getElementById('userJadwal').value

  const shift_code =
    document.getElementById('shiftJadwal').value

  if (!tanggal || !user_id || !shift_code) {
    alert('Lengkapi data')
    return
  }

  /* ================= CHECK EXIST ================= */

  const { data: existing } = await supabase
    .from('jadwal')
    .select('id')
    .eq('tanggal', tanggal)
    .eq('user_id', user_id)
    .maybeSingle()

  if (existing) {

    await supabase
      .from('jadwal')
      .update({
        shift_code
      })
      .eq('id', existing.id)

  } else {

    await supabase
      .from('jadwal')
      .insert([{
        tanggal,
        user_id,
        shift_code
      }])
  }

  alert('Jadwal berhasil disimpan')

  renderJadwalManagement()
}

/* ================= DELETE ================= */
window.deleteJadwal = async function (id) {

  const yes =
    confirm('Hapus jadwal?')

  if (!yes) return

  await supabase
    .from('jadwal')
    .delete()
    .eq('id', id)

  renderJadwalManagement()
}


window.showCalendarDetail = async function(tanggal) {

  const user = window.currentUser

  const isAdmin =
    user.role === 'admin' ||
    user.role === 'super_admin'

  let query = supabase
    .from('jadwal')
    .select(`
      *,
      profiles:user_id(
        nama_lengkap
      )
    `)
    .eq('tanggal', tanggal)

  // STAFF hanya lihat dirinya
  if (!isAdmin) {
    query = query.eq(
      'user_id',
      user.id
    )
  }

  const { data, error } =
    await query

  if (error) {
    alert('Gagal load detail')
    return
  }

  let html = `
    <div class="popup-overlay"
      onclick="closePopup()">

      <div class="popup-box"
        onclick="event.stopPropagation()">

        <h3>
          Jadwal ${tanggal}
        </h3>
  `

  if (!data || data.length === 0) {

    html += `
      <p>Tidak ada jadwal</p>
    `

  } else {

    html += `
      <table style="
        width:100%;
        margin-top:15px;
      ">
        <tr>
          <th>Nama</th>
          <th>Shift</th>
        </tr>
    `

    data.forEach(j => {

      let shift = '-'

      if (j.shift_code == "2")
        shift = "🌅 Pagi"

      if (j.shift_code == "3")
        shift = "🌇 Sore"

      if (j.shift_code == "4")
        shift = "🌙 Malam"

      if (j.shift_code == "8")
        shift = "⚫ OFF"

      if (j.status_override === "cuti")
        shift = "🟢 CUTI"

      if (j.status_override === "sakit")
        shift = "🟡 SAKIT"

      if (j.status_override === "izin")
        shift = "🔵 IZIN"

      html += `
        <tr>

          <td>
            ${j.profiles?.nama_lengkap || '-'}
          </td>

          <td>
            ${shift}
          </td>

        </tr>
      `
    })

    html += `</table>`
  }

  html += `

        <button
          onclick="closePopup()"
          style="margin-top:15px;">

          Tutup

        </button>

      </div>

    </div>
  `

  document.body.insertAdjacentHTML(
    'beforeend',
    html
  )
}


/* ================= CLOSE POPUP ================= */
window.closePopup = function () {

  const popup =
    document.querySelector(
      '.popup-overlay'
    )

  if (popup) popup.remove()
}
/* ================= UPLOAD EXCEL ================= */
window.uploadJadwalExcel = async function () {

  const fileInput =
    document.getElementById('excelFile')

  const file =
    fileInput.files[0]

  if (!file) {
    alert('Pilih file Excel dulu')
    return
  }

  const bulan =
    document.getElementById('bulanUpload').value

  const tahun =
    document.getElementById('tahunUpload').value

  const reader =
    new FileReader()

  reader.onload = async (e) => {

    const data =
      new Uint8Array(e.target.result)

    const workbook =
      XLSX.read(data, {
        type: 'array'
      })

    const sheet =
      workbook.Sheets[
        workbook.SheetNames[0]
      ]

    const json =
      XLSX.utils.sheet_to_json(sheet)

    console.log("DATA EXCEL:", json)

    for (const row of json) {

      const nama =
        row.nama

      if (!nama) continue

      /* ================= FIND USER ================= */

      const { data: user } = await supabase
        .from('profiles')
        .select('id')
        .eq('nama_lengkap', nama)
        .maybeSingle()

      if (!user) {
        console.log(
          "USER TIDAK DITEMUKAN:",
          nama
        )
        continue
      }

      /* ================= LOOP TANGGAL ================= */

      for (const key in row) {

        if (key === 'nama') continue

        const shift_code =
          String(row[key] || '').trim()

        if (!shift_code) continue

        const tanggal =
          `${tahun}-${bulan}-${String(key).padStart(2,'0')}`

        console.log({
          tanggal,
          shift_code,
          user_id: user.id
        })

        /* ================= CHECK EXIST ================= */

        const { data: existing } = await supabase
          .from('jadwal')
          .select('id')
          .eq('tanggal', tanggal)
          .eq('user_id', user.id)
          .maybeSingle()

        if (existing) {

          await supabase
            .from('jadwal')
            .update({
              shift_code
            })
            .eq('id', existing.id)

        } else {

          await supabase
            .from('jadwal')
            .insert([{
              tanggal,
              user_id: user.id,
              shift_code
            }])
        }
      }
    }

    alert('Upload jadwal selesai')

    renderJadwalManagement()
  }

  reader.readAsArrayBuffer(file)
} 
