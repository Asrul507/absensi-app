export async function renderRiwayat(user) {

  const content = document.getElementById('content')

  if (!content) return

  content.innerHTML = `
    <div class="card">
      <h3>📊 Riwayat Absensi</h3>

      <div class="filter-row">
        <input type="date" id="filterTanggal">
        <button onclick="loadRiwayat()">Filter</button>
      </div>

      <div id="riwayatList">
        <p>Loading data...</p>
      </div>
    </div>
  `

  await loadRiwayat(user)
}


/* ================= LOAD DATA ================= */
window.loadRiwayat = async function (user) {

  const container = document.getElementById('riwayatList')
  if (!container) return

  try {

    const { data, error } = await supabase
      .from('absensi')
      .select(`
        *,
        profiles(nama_lengkap, email),
        shift(nama_shift, jam_masuk, jam_pulang)
      `)
      .order('tanggal', { ascending: false })

    if (error) {
      container.innerHTML = `
        <div class="card">
          ❌ Gagal load riwayat
        </div>
      `
      return
    }

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="card">
          <h4>📭 Tidak ada data absensi</h4>
        </div>
      `
      return
    }

    container.innerHTML = data.map(item => {

      const nama = item?.profiles?.nama_lengkap || item?.nama || 'Unknown'
      const shift = item?.shift?.nama_shift || 'Tanpa Shift'
      const jamMasuk = item?.waktu_masuk
        ? new Date(item.waktu_masuk).toLocaleTimeString()
        : '-'

      const jamPulang = item?.waktu_pulang
        ? new Date(item.waktu_pulang).toLocaleTimeString()
        : '-'

      const status =
        item.waktu_masuk && item.waktu_pulang
          ? 'Selesai'
          : item.waktu_masuk
            ? 'Masuk'
            : 'Belum Absen'

      let badgeClass = 'badge-gray'

      if (status === 'Selesai') badgeClass = 'badge-green'
      if (status === 'Masuk') badgeClass = 'badge-yellow'

      return `
        <div class="absen-record">

          <div class="ar-top">
            <div class="ar-date">
              📅 ${item.tanggal || '-'}
            </div>

            <span class="badge ${badgeClass}">
              ${status}
            </span>
          </div>

          <div class="ar-times">
            <div class="ar-time-item">
              🧑 ${nama}
            </div>
          </div>

          <div class="ar-times">
            <div class="ar-time-item">
              ⏰ Masuk: ${jamMasuk}
            </div>

            <div class="ar-time-item">
              ⏰ Pulang: ${jamPulang}
            </div>
          </div>

          <div class="ar-times">
            <div class="ar-time-item">
              🏷 Shift: ${shift}
            </div>
          </div>

        </div>
      `
    }).join('')

  } catch (err) {

    console.log(err)

    container.innerHTML = `
      <div class="card">
        ❌ Error sistem riwayat
      </div>
    `
  }
}
