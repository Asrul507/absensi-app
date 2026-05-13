import { supabase } from './supabase.js'

/* ================= RENDER ================= */
export async function renderRiwayat(user) {

  const content =
    document.getElementById('content')

  if (!content) return

  content.innerHTML = `

    <div class="card">

      <h3>📊 Riwayat Absensi</h3>

      <div class="filter-row"
        style="
          display:flex;
          gap:10px;
          margin:15px 0;
          flex-wrap:wrap;
        ">

        <input
          type="date"
          id="filterTanggal">

        <button
          onclick="loadRiwayat(window.currentUser)">

          Filter

        </button>

      </div>

      <div id="riwayatList">

        <p>Loading data...</p>

      </div>

    </div>
  `

  await loadRiwayat(user)
}


/* ================= LOAD DATA ================= */
window.loadRiwayat =
async function (user) {

  const container =
    document.getElementById(
      'riwayatList'
    )

  if (!container) return

  try {

    const isAdmin =
      user.role === 'admin' ||
      user.role === 'super_admin'

    let query = supabase
      .from('absensi')
      .select('*')
      .order('tanggal', {
        ascending: false
      })

    // ================= FILTER =================

    const tanggal =
      document.getElementById(
        'filterTanggal'
      )?.value

    if (tanggal) {

      query = query.eq(
        'tanggal',
        tanggal
      )
    }

    // ================= STAFF ONLY =================

    if (!isAdmin) {

      query = query.eq(
        'nama',
        user.nama_lengkap
      )
    }

    const { data, error } =
      await query

    if (error) {

      console.log(error)

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
          <h4>
            📭 Tidak ada data absensi
          </h4>
        </div>
      `

      return
    }

    container.innerHTML =
      data.map(item => {

        // ================= NAMA =================

        const nama =
          item?.nama || 'Unknown'

        // ================= SHIFT =================

        let shift = '-'

        if (item.shift_code == "2") {
          shift = "🌅 Shift Pagi"
        }

        if (item.shift_code == "3") {
          shift = "🌇 Shift Sore"
        }

        if (item.shift_code == "4") {
          shift = "🌙 Shift Malam"
        }

        if (item.shift_code == "8") {
          shift = "⚫ OFF"
        }

        // ================= JAM =================

        const jamMasuk =
          item?.waktu_masuk
            ? new Date(
                item.waktu_masuk
              ).toLocaleTimeString(
                'id-ID'
              )
            : '-'

        const jamPulang =
          item?.waktu_pulang
            ? new Date(
                item.waktu_pulang
              ).toLocaleTimeString(
                'id-ID'
              )
            : '-'

        // ================= STATUS =================

        let status =
          item.status_absensi ||
          'open'

        let badgeClass =
          'badge-gray'

        if (status === 'open') {
          badgeClass = 'badge-blue'
        }

        if (status === 'salah absen') {
          badgeClass = 'badge-red'
        }

        if (
          status ===
          'lupa absen datang'
        ) {
          badgeClass =
            'badge-yellow'
        }

        if (
          status ===
          'lupa absen pulang'
        ) {
          badgeClass =
            'badge-yellow'
        }

        if (
          status ===
          'approved manual'
        ) {
          badgeClass =
            'badge-green'
        }

        return `

          <div class="absen-record">

            <div class="ar-top">

              <div class="ar-date">
                📅 ${item.tanggal || '-'}
              </div>

              <span class="
                badge ${badgeClass}
              ">

                ${status.toUpperCase()}

              </span>

            </div>

            <div class="ar-times">

              <div class="ar-time-item">
                🧑 ${nama}
              </div>

            </div>

            <div class="ar-times">

              <div class="ar-time-item">
                ⏰ Masuk:
                ${jamMasuk}
              </div>

              <div class="ar-time-item">
                ⏰ Pulang:
                ${jamPulang}
              </div>

            </div>

            <div class="ar-times">

              <div class="ar-time-item">
                🏷 Shift:
                ${shift}
              </div>

            </div>

            ${
              isAdmin &&
              (
                item.status_absensi === 'salah absen' ||
                item.status_absensi === 'lupa absen datang' ||
                item.status_absensi === 'lupa absen pulang'
              )
              ? `

                <div style="
                  margin-top:15px;
                ">

                  <button
                    onclick="
                      approveAbsen(
                        '${item.id}'
                      )
                    ">

                    ✅ Approve Manual

                  </button>

                </div>

              `
              : ''
            }

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


/* ================= APPROVE ================= */
window.approveAbsen =
async function(id) {

  const note =
    prompt(
      "Keterangan approval"
    )

  const { error } =
    await supabase
      .from('absensi')
      .update({

        approve_manual: true,

        approve_note: note,

        status_absensi:
          "approved manual"

      })
      .eq('id', id)

  if (error) {

    console.log(error)

    alert("Gagal approve")

    return
  }

  alert("Approval berhasil")

  loadRiwayat(
    window.currentUser
  )
}
