import { supabase } from './supabase.js'

/* ================= RENDER SHIFT ================= */
export async function renderShiftManagement() {

  const content = document.getElementById('content')

  const { data: shifts, error } = await supabase
    .from('shift')
    .select('*')
    .order('jam_masuk')

  if (error) {
    content.innerHTML = `
      <div class="card">
        Gagal load shift
      </div>
    `
    return
  }

  content.innerHTML = `
    <div class="card">

      <h2>Shift Management</h2>

      <div style="margin:15px 0;display:grid;gap:10px;">

        <input 
          id="shiftNama"
          placeholder="Nama Shift"
        >

        <input 
          id="jamMasuk"
          type="time"
        >

        <input 
          id="jamPulang"
          type="time"
        >

        <input 
          id="keterangan"
          placeholder="Keterangan"
        >

        <button onclick="createShift()">
          Tambah Shift
        </button>

      </div>

      <table style="width:100%;border-collapse:collapse">

        <thead>
          <tr>
            <th>Shift</th>
            <th>Masuk</th>
            <th>Pulang</th>
            <th>Keterangan</th>
            <th>Aksi</th>
          </tr>
        </thead>

        <tbody>

          ${shifts.map(s => `
            <tr>

              <td>${s.nama_shift}</td>

              <td>${s.jam_masuk}</td>

              <td>${s.jam_pulang}</td>

              <td>${s.keterangan || '-'}</td>

              <td>
                <button onclick="deleteShift('${s.id}')">
                  Hapus
                </button>
              </td>

            </tr>
          `).join('')}

        </tbody>

      </table>

    </div>
  `
}

/* ================= CREATE SHIFT ================= */
window.createShift = async function () {

  const nama_shift =
    document.getElementById('shiftNama').value

  const jam_masuk =
    document.getElementById('jamMasuk').value

  const jam_pulang =
    document.getElementById('jamPulang').value

  const keterangan =
    document.getElementById('keterangan').value

  if (!nama_shift || !jam_masuk || !jam_pulang) {
    alert('Lengkapi data shift')
    return
  }

  const { error } = await supabase
    .from('shift')
    .insert([
      {
        nama_shift,
        jam_masuk,
        jam_pulang,
        keterangan
      }
    ])

  if (error) {
    console.error(error)
    alert('Gagal tambah shift')
    return
  }

  alert('Shift berhasil dibuat')

  renderShiftManagement()
}

/* ================= DELETE SHIFT ================= */
window.deleteShift = async function(id) {

  const yes = confirm('Hapus shift?')

  if (!yes) return

  const { error } = await supabase
    .from('shift')
    .delete()
    .eq('id', id)

  if (error) {
    alert('Gagal hapus shift')
    return
  }

  renderShiftManagement()
}