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

            let shiftInfo = getShiftInfo(j.shift_code || j.shift_id)

            // override cuti/sakit/izin
            if (j.status_override === "cuti") shiftInfo = { nama: "🟢 CUTI", jam: "-" }
            if (j.status_override === "sakit") shiftInfo = { nama: "🟡 SAKIT", jam: "-" }
            if (j.status_override === "izin") shiftInfo = { nama: "🔵 IZIN", jam: "-" }

            return `
              <tr>

                <td>${j.tanggal}</td>

                <td>${j.profiles?.nama_lengkap || '-'}</td>

                <td>${shiftInfo.nama}</td>

                <td>${shiftInfo.jam}</td>

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
    </div>
  `
}

/* ================= CREATE ================= */
window.createJadwal = async function () {

  const tanggal = document.getElementById('tanggalJadwal').value
  const user_id = document.getElementById('userJadwal').value
  const shift_code = document.getElementById('shiftJadwal').value

  if (!tanggal || !user_id || !shift_code) {
    alert('Lengkapi data')
    return
  }

  // OFF tidak disimpan ke jadwal
  if (shift_code === "8") {
    alert("Hari OFF tidak disimpan")
    return
  }

  const { error } = await supabase
    .from('jadwal')
    .insert([{
      tanggal,
      user_id,
      shift_code
    }])

  if (error) {
    console.error(error)
    alert('Gagal simpan jadwal')
    return
  }

  alert('Jadwal berhasil dibuat')
  renderJadwalManagement()
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