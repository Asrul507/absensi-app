import { supabase } from './supabase.js'

/* ================= SHIFT HELPER ================= */
function getShiftInfo(code) {

  if (code == "2") return { nama: "Shift Pagi", jam: "07:00 - 15:00" }
  if (code == "3") return { nama: "Shift Sore", jam: "15:00 - 23:00" }
  if (code == "4") return { nama: "Shift Malam", jam: "23:00 - 07:00" }
  if (code == "8") return { nama: "OFF", jam: "-" }

  return { nama: "-", jam: "-" }
}

/* ================= RENDER ================= */
export async function renderJadwalManagement() {

  const content = document.getElementById('content')

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .eq('status_akun', 'Aktif')

  const { data: jadwal } = await supabase
    .from('jadwal')
    .select(`
      *,
      profiles:user_id(nama_lengkap)
    `)
    .order('tanggal', { ascending: false })

  const safeJadwal = jadwal || []
  const safeUsers = users || []

  content.innerHTML = `
    <div class="card">
      <h2>Jadwal Management</h2>

      <div style="display:grid;gap:10px;margin-top:15px;">

        <input id="tanggalJadwal" type="date">

        <select id="userJadwal">
          <option value="">Pilih Staff</option>
          ${safeUsers.map(u => `
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
            <th>Aksi</th>
          </tr>
        </thead>

        <tbody>
          ${safeJadwal.map(j => {

            let shiftText = "-"
            let jamText = "-"

            if (j.shift_code == "2") {
              shiftText = "Shift Pagi"
              jamText = "07:00 - 15:00"
            }

            if (j.shift_code == "3") {
              shiftText = "Shift Sore"
              jamText = "15:00 - 23:00"
            }

            if (j.shift_code == "4") {
              shiftText = "Shift Malam"
              jamText = "23:00 - 07:00"
            }

            if (j.shift_code == "8") {
              shiftText = "OFF"
              jamText = "-"
            }

            // override cuti
            if (j.status_override) {
              shiftText = j.status_override.toUpperCase()
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

      <!-- 🔥 UPLOAD SECTION (INI YANG KAMU KATA TIDAK MUNCUL) -->
      <div class="card" style="margin-top:15px;">
        <h3>Upload Jadwal Excel</h3>

        <input type="file" id="excelFile">

        <button onclick="uploadJadwalExcel()">
          Upload
        </button>
      </div>

    </div>
  `
}

/* ================= DELETE ================= */
window.deleteJadwal = async function (id) {

  const yes = confirm('Hapus jadwal?')
  if (!yes) return

  await supabase
    .from('jadwal')
    .delete()
    .eq('id', id)

  renderJadwalManagement()
}