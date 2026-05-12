import { supabase } from './supabase.js'

/* ================= HITUNG TANGGAL SELESAI ================= */
function hitungTanggalSelesai(startDate, hari) {
  if (!startDate || !hari) return null

  const date = new Date(startDate)
  date.setDate(date.getDate() + (parseInt(hari) - 1))
  return date.toISOString().split('T')[0]
}

/* ================= RENDER ================= */
export async function renderPengajuan(user) {

  const content = document.getElementById("content")

  const isAdmin =
    user.role === "admin" ||
    user.role === "super_admin"

  const { data: list, error } = await supabase
    .from("pengajuan")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    content.innerHTML = `<div class="card">❌ Gagal load data</div>`
    return
  }

  const myList = isAdmin
    ? list
    : list.filter(i => i.user_id === user.id)

  content.innerHTML = `
    <div class="card">
      <h3>📩 Pengajuan ${isAdmin ? "Management" : "Saya"}</h3>

      <div class="field">
        <label>Jenis</label>
        <select id="jenis">
          <option value="cuti">Cuti</option>
          <option value="sakit">Sakit</option>
          <option value="izin">Izin</option>
        </select>
      </div>

      <div class="field">
        <label>Alasan</label>
        <textarea id="alasan"></textarea>
      </div>

      <div class="field">
        <label>Jumlah Hari</label>
        <input type="number" id="jumlahHari" min="1">
      </div>

      <div class="field">
        <label>Tanggal Mulai</label>
        <input type="date" id="tanggalMulai">
      </div>

      <div class="field">
        <label>Upload Surat (opsional)</label>
        <input type="file" id="fileSurat">
      </div>

      <button id="btnSubmit">Ajukan</button>
    </div>

    <div class="card">
      <h3>📜 Riwayat Pengajuan</h3>

      ${
        myList.length === 0
          ? `<div class="empty-state">Belum ada pengajuan</div>`
          : myList.map(i => `
              <div class="card">

                <b>Jenis:</b> ${i.jenis || "-"} <br>
                <b>Nama:</b> ${i.nama || "Unknown"} <br>
                <b>Alasan:</b> ${i.alasan || "-"} <br>

                <b>Tgl Pengajuan:</b> ${i.tanggal_pengajuan || "-"} <br>
                <b>Tgl Mulai:</b> ${i.tanggal_mulai || "-"} <br>
                <b>Tgl Selesai:</b> ${i.tanggal_selesai || "-"} <br>
                <b>Jumlah Hari:</b> ${i.jumlah_hari || "-"} <br>

                <b>Status:</b>
                <span class="badge ${
                  i.status === "approved"
                    ? "badge-green"
                    : i.status === "rejected"
                      ? "badge-red"
                      : "badge-yellow"
                }">
                  ${i.status}
                </span>

                <br>

                ${i.file ? `<a href="${i.file}" target="_blank">📎 Lihat File</a>` : ""}

                ${
                  isAdmin && i.status === "pending"
                    ? `
                      <div style="margin-top:10px; display:flex; gap:8px;">
                        <button onclick="approvePengajuan('${i.id}')">Approve</button>
                        <button onclick="rejectPengajuan('${i.id}')">Reject</button>
                      </div>
                    `
                    : ""
                }

              </div>
            `).join("")
      }

    </div>
  `

  // ================= SUBMIT =================
  document.getElementById("btnSubmit").onclick = async () => {

    const jenis = document.getElementById("jenis").value
    const alasan = document.getElementById("alasan").value
    const jumlahHari = document.getElementById("jumlahHari").value
    const tanggalMulai = document.getElementById("tanggalMulai").value
    const file = document.getElementById("fileSurat").files[0]

    if (!alasan) {
      alert("Alasan wajib diisi")
      return
    }

    let fileUrl = null

    // upload file
    if (file) {
      const fileName = `${Date.now()}-${file.name}`

      const { error: uploadError } = await supabase
        .storage
        .from("surat")
        .upload(fileName, file)

      if (uploadError) {
        alert("Upload gagal")
        return
      }

      fileUrl = supabase.storage
        .from("surat")
        .getPublicUrl(fileName).data.publicUrl
    }

    const tanggal_pengajuan = new Date().toISOString().split('T')[0]

    const tanggal_selesai =
      hitungTanggalSelesai(tanggalMulai, jumlahHari)

    const { error: insertError } = await supabase
      .from("pengajuan")
      .insert([{
        user_id: user.id,
        nama: user.nama_lengkap || user.email,
        jenis,
        alasan,
        file: fileUrl,
        status: "pending",

        // NEW FIELD
        tanggal_pengajuan,
        jumlah_hari: jumlahHari,
        tanggal_mulai: tanggalMulai,
        tanggal_selesai
      }])

    if (insertError) {
      console.log(insertError)
      alert("Gagal kirim pengajuan")
      return
    }

    alert("Pengajuan berhasil")
    renderPengajuan(user)
  }
}

/* ================= APPROVE ================= */
window.approvePengajuan = async function (id) {

  // 1. ambil data pengajuan
  const { data: pengajuan, error } = await supabase
    .from("pengajuan")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !pengajuan) {
    alert("Data pengajuan tidak ditemukan")
    return
  }

  const user_id = pengajuan.user_id
  const jenis = pengajuan.jenis
  const tanggalMulai = pengajuan.tanggal_mulai
  const jumlahHari = pengajuan.jumlah_hari || 1

  // 2. update status pengajuan
  await supabase
    .from("pengajuan")
    .update({ status: "approved" })
    .eq("id", id)

  // 3. loop tanggal cuti/sakit/izin
  for (let i = 0; i < jumlahHari; i++) {

    let date = new Date(tanggalMulai)
    date.setDate(date.getDate() + i)

    let tgl = date.toISOString().split('T')[0]

    // 🔥 CEK JADWAL SUDAH ADA ATAU BELUM
    const { data: existing } = await supabase
      .from("jadwal")
      .select("*")
      .eq("user_id", user_id)
      .eq("tanggal", tgl)
      .maybeSingle()

    if (existing) {

      // 🔁 UPDATE JIKA SUDAH ADA
      await supabase
        .from("jadwal")
        .update({
          status_override: jenis,
          shift_id: null,
          pengajuan_id: id
        })
        .eq("id", existing.id)

    } else {

      // ➕ INSERT JIKA BELUM ADA
      await supabase
        .from("jadwal")
        .insert([{
          user_id,
          tanggal: tgl,
          shift_id: null,
          status_override: jenis,
          pengajuan_id: id
        }])
    }
  }

  alert("Approve sukses (jadwal otomatis update tanpa duplikat)")

  renderPengajuan(window.currentUser)
}
/* ================= REJECT ================= */
window.rejectPengajuan = async function (id) {

  const { error } = await supabase
    .from("pengajuan")
    .update({
      status: "rejected"
    })
    .eq("id", id)

  if (error) {
    alert("Gagal reject")
    return
  }

  alert("Pengajuan ditolak")
  renderPengajuan(window.currentUser)
}


async function updateJadwalCuti(pengajuan) {

  if (!pengajuan.tanggal_mulai || !pengajuan.tanggal_selesai) return

  const start = new Date(pengajuan.tanggal_mulai)
  const end = new Date(pengajuan.tanggal_selesai)

  let current = new Date(start)

  const updates = []

  while (current <= end) {

    const tanggal = current.toISOString().split('T')[0]

    updates.push({
      user_id: pengajuan.user_id,
      tanggal,
      status_override: pengajuan.jenis, // cuti / sakit / izin
      shift_id: null // kosongkan shift karena libur
    })

    current.setDate(current.getDate() + 1)
  }

  const { error } = await supabase
    .from("jadwal")
    .upsert(updates, {
      onConflict: ['user_id', 'tanggal']
    })

  if (error) console.error(error)
}
