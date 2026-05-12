export async function renderPengajuan(user) {

  const content = document.getElementById("content")

  const { data: list, error } = await supabase
    .from("pengajuan")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    content.innerHTML = `<div class="card">Gagal load data</div>`
    return
  }

  content.innerHTML = `
    <div class="card">
      <h3>📩 Pengajuan Saya</h3>

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

      ${list.map(i => `
        <div class="card">
          <b>${i.jenis}</b><br>
          ${i.alasan}<br>
          <small>Status: ${i.status}</small>
        </div>
      `).join("")}
    </div>
  `

  document.getElementById("btnSubmit").onclick = async () => {

    const jenis = document.getElementById("jenis").value
    const alasan = document.getElementById("alasan").value
    const file = document.getElementById("fileSurat").files[0]

    let fileUrl = null

    // 🔥 upload file ke supabase storage
    if (file) {

      const fileName = `${Date.now()}-${file.name}`

      const { data, error } = await supabase
        .storage
        .from("surat")
        .upload(fileName, file)

      if (!error) {
        fileUrl = supabase.storage.from("surat").getPublicUrl(fileName).data.publicUrl
      }
    }

    await supabase.from("pengajuan").insert([{
      user_id: user.id,
      nama: user.nama_lengkap,
      jenis,
      alasan,
      file: fileUrl,
      status: "pending"
    }])

    alert("Pengajuan berhasil")

    renderPengajuan(user)
  }
}
