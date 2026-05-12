export async function renderPengajuan(user) {

  const content = document.getElementById("content")

  const isAdmin =
    user.role === "admin" ||
    user.role === "super_admin"

  // ================= FETCH PENGAJUAN =================
  const { data: list, error } = await supabase
    .from("pengajuan")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    content.innerHTML = `<div class="card">❌ Gagal load data</div>`
    return
  }

  // ================= FILTER DATA USER =================
  const myList = isAdmin
    ? list
    : list.filter(i => i.user_id === user.id)

  // ================= RENDER UI =================
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

              ${i.file
                ? `<a href="${i.file}" target="_blank">📎 Lihat File</a>`
                : ""}

              ${
                isAdmin
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
    const file = document.getElementById("fileSurat").files[0]

    if (!alasan) {
      alert("Alasan wajib diisi")
      return
    }

    let fileUrl = null

    // ================= UPLOAD FILE =================
    if (file) {

      const fileName = `${Date.now()}-${file.name}`

      const { error: uploadError } = await supabase
        .storage
        .from("surat")
        .upload(fileName, file)

      if (!uploadError) {
        fileUrl = supabase.storage
          .from("surat")
          .getPublicUrl(fileName).data.publicUrl
      } else {
        alert("Upload gagal")
        return
      }
    }

    // ================= INSERT DATA =================
    const { error: insertError } = await supabase
      .from("pengajuan")
      .insert([{
        user_id: user.id,
        nama: user.nama_lengkap || user.email,
        jenis,
        alasan,
        file: fileUrl,
        status: "pending"
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
