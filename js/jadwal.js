import { supabase } from './supabase.js'

/* ================= RENDER ================= */
function getShiftInfo(code) {

  if (code == "2") return { nama: "Pagi", jam: "07:00 - 15:00" }
  if (code == "3") return { nama: "Sore", jam: "15:00 - 23:00" }
  if (code == "4") return { nama: "Malam", jam: "23:00 - 07:00" }
  if (code == "8") return { nama: "OFF", jam: "-" }

  return { nama: "-", jam: "-" }
}
export async function renderJadwalManagement() {

  const content = document.getElementById('content')

  // USERS
  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .eq('status_akun', 'Aktif')

  // SHIFTS (optional, tidak dipakai kalau pakai kode 2/3/4/8)
  const { data: s } = await supabase
    .from('shift')
    .select('*')

  // JADWAL
  const { data: jadwal } = await supabase
    .from('jadwal')
    .select(`
      *,
      profiles:user_id(nama_lengkap)
    `)
    .order('tanggal', { ascending: false })


  // ================= STATUS LABEL =================
  let getStatusLabel = (j) => {

    let statusText = j.status_override

    if (!statusText) return j.shift_code || '-'

    if (statusText === "cuti") return "🟢 CUTI"
    if (statusText === "sakit") return "🟡 SAKIT"
    if (statusText === "izin") return "🔵 IZIN"
    if (statusText === "off") return "⚫ OFF"

    return statusText
  }


  content.innerHTML = `

    <div class="card">

      <h2>Jadwal Management</h2>

      <div style="display:grid;gap:10px;margin-top:15px;">

        <input id="tanggalJadwal" type="date">

        <select id="userJadwal">

          <option value="">Pilih Staff</option>

          ${users.map(u => `
            <option value="${u.id}">
              ${u.nama_lengkap}
            </option>
          `).join('')}

        </select>

        <select id="shiftJadwal">

          <option value="">Pilih Shift</option>
          <option value="2">Shift Pagi</option>
          <option value="3">Shift Sore</option>
          <option value="4">Shift Malam</option>
          <option value="8">OFF</option>

        </select>

        <button onclick="createJadwal()">
          Simpan Jadwal
        </button>

      </div>

    </div>

    <div class="card">

      <h3>List Jadwal</h3>

      <table style="width:100%;border-collapse:collapse;">

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

          ${jadwal.map(j => {

            // SHIFT MANUAL CODE SYSTEM
            let shiftText = '-'
            let jamText = '-'

            if (j.shift_id == "2") {
              shiftText = "Shift Pagi"
              jamText = "07:00 - 15:00"
            }

            if (j.shift_id == "3") {
              shiftText = "Shift Sore"
              jamText = "15:00 - 23:00"
            }

            if (j.shift_id == "4") {
              shiftText = "Shift Malam"
              jamText = "23:00 - 07:00"
            }

            if (j.shift_id == "8") {
              shiftText = "OFF"
              jamText = "-"
            }

            // OVERRIDE CUTI / SAKIT / IZIN
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

                <td>${j.tanggal}</td>

                <td>${j.profiles?.nama_lengkap || '-'}</td>

                <td>${shiftText}</td>

                <td>${jamText}</td>

                <td>
                  <button onclick="deleteJadwal('${j.id}')">
                    Hapus
                  </button>
                </td>

              </tr>
            `
          }).join('')}

        </tbody>

      </table>

      <div class="card">
        <h3>Upload Jadwal Excel</h3>

        <input type="file" id="excelFile" />

        <button onclick="uploadJadwalExcel()">
          Upload
        </button>
      </div>

    </div>
  `
}

/* ================= CREATE ================= */
window.createJadwal = async function () {

  const tanggal = document.getElementById('tanggalJadwal').value
  const user_id = document.getElementById('userJadwal').value
  const shift_code =
  document.getElementById('shiftJadwal').value
  
  if (!tanggal || !user_id || !shift_code) {
    alert('Lengkapi data')
    return
  }

  // ambil semua shift dulu
  const { data: shifts } = await supabase
    .from('shift')
    .select('*')

  const shift_id = mapShiftCode(shift_code, shifts)

  // OFF = tidak masuk jadwal
  if (shift_code === "8") {
    alert("Hari OFF tidak disimpan ke jadwal")
    return
  }

  const { error } = await supabase
    .from('jadwal')
    .insert([
      {
        tanggal,
        user_id,
        shift_id
      }
    ])

  if (error) {
    console.error(error)
    alert('Gagal simpan jadwal')
    return
  }

  alert('Jadwal berhasil dibuat')
  renderJadwalManagement()
}
/* ================= DELETE ================= */
window.deleteJadwal = async function(id) {

  const yes = confirm('Hapus jadwal?')

  if (!yes) return

  await supabase
    .from('jadwal')
    .delete()
    .eq('id', id)

  renderJadwalManagement()
}
window.syncFromSheet = async function () {

  alert("Gunakan Google Apps Script untuk sync otomatis")

}

function mapShiftCode(code, shifts) {

  const shiftMap = {
    "2": shifts.find(s => s.nama_shift.toLowerCase().includes("pagi"))?.id,
    "3": shifts.find(s => s.nama_shift.toLowerCase().includes("sore"))?.id,
    "4": shifts.find(s => s.nama_shift.toLowerCase().includes("malam"))?.id,
    "8": null // OFF = tidak masuk jadwal
  }

  return shiftMap[code] || null
}
