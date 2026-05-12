import { supabase } from './supabase.js'

/* ================= RENDER ================= */
export async function renderJadwalManagement() {

  const content = document.getElementById('content')

  // USERS
  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .eq('status_akun', 'Aktif')

  // SHIFTS
  const { data: shifts } = await supabase
    .from('shift')
    .select('*')

  // JADWAL
  const { data: jadwal } = await supabase
    .from('jadwal')
    .select(`
      *,
      profiles:user_id(nama_lengkap),
      shift:shift_id(nama_shift,jam_masuk,jam_pulang)
    `)
    .order('tanggal', { ascending: false })
  let getStatusLabel = (j) => {

  let statusText = j.status_override

  if (!statusText) return j.shift?.nama_shift || '-'

  if (statusText === "cuti") return "🟢 CUTI"
  if (statusText === "sakit") return "🟡 SAKIT"
  if (statusText === "izin") return "🔵 IZIN"

  return statusText
}

  content.innerHTML = `

    <div class="card">

      <h2>Jadwal Management</h2>

      <div style="display:grid;gap:10px;margin-top:15px;">

        <input id="tanggalJadwal" type="date">

        <select id="userJadwal">

          <option value="">
            Pilih Staff
          </option>

          ${users.map(u => `
            <option value="${u.id}">
              ${u.nama_lengkap}
            </option>
          `).join('')}

        </select>

        <select id="shiftJadwal">

          <option value="">
            Pilih Shift
          </option>

          ${shifts.map(s => `
            <option value="${s.id}">
              ${s.nama_shift}
            </option>
          `).join('')}

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

          ${jadwal.map(j => `
            <tr>

              <td>${j.tanggal}</td>

              <td>
                ${j.profiles?.nama_lengkap || '-'}
              </td>

              <td>
               <td>
  ${
    j.status_override
      ? `<span style="
          padding:4px 10px;
          border-radius:8px;
          font-weight:600;
          font-size:12px;
          background:#111827;
          color:#fff;
          display:inline-block;
        ">
        ${getStatusLabel(j)}
      </span>`
      : (j.shift?.nama_shift || '-')
  }
</td>
              </td>

              <td>

                <button
                  onclick="deleteJadwal('${j.id}')">

                  Hapus

                </button>

              </td>

            </tr>
          `).join('')}

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

  const tanggal =
    document.getElementById('tanggalJadwal').value

  const user_id =
    document.getElementById('userJadwal').value

  const shift_id =
    document.getElementById('shiftJadwal').value

  if (!tanggal || !user_id || !shift_id) {
    alert('Lengkapi data')
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
<button onclick="syncFromSheet()">
  🔄 Sync Jadwal Bulanan
</button>
window.syncFromSheet = async function () {

  alert("Gunakan Google Apps Script untuk sync otomatis")

}
