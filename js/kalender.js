import { supabase } from './supabase.js'

export async function renderKalenderHR() {

  const content = document.getElementById('content')

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // ambil data jadwal bulan ini
  const start = firstDay.toISOString().split('T')[0]
  const end = lastDay.toISOString().split('T')[0]

  const { data: jadwal } = await supabase
    .from('jadwal')
    .select('*')
    .gte('tanggal', start)
    .lte('tanggal', end)

  // mapping biar cepat lookup
  const map = {}
  jadwal?.forEach(j => {
    map[j.tanggal] = j
  })

  const daysInMonth = lastDay.getDate()

  let html = `
    <div class="card">
      <h2>📅 Kalender HR</h2>
      <p>${today.toLocaleString('id-ID', { month: 'long' })} ${year}</p>

      <div class="calendar-grid">
  `

  for (let d = 1; d <= daysInMonth; d++) {

    const date = new Date(year, month, d)
    const key = date.toISOString().split('T')[0]

    const item = map[key]

    let color = "#eee"
    let label = "SHIFT"

    if (item?.status_override === "cuti") {
      color = "#22c55e"
      label = "CUTI"
    }

    if (item?.status_override === "sakit") {
      color = "#facc15"
      label = "SAKIT"
    }

    if (item?.status_override === "izin") {
      color = "#3b82f6"
      label = "IZIN"
    }

    html += `
  <div class="cal-day"
    onclick="openCalendarDetail('${key}')"
    style="background:${color};cursor:pointer">

    <div class="cal-date">${d}</div>
    <div class="cal-label">${label}</div>

  </div>
`
  }

  html += `
      </div>
    </div>
  `

  content.innerHTML = html
}

window.openCalendarDetail = async function (tanggal) {

  const content =
    document.getElementById('content')

  const user =
    window.currentUser

  const isAdmin =
    user.role === 'admin' ||
    user.role === 'super_admin'

  let query = supabase
    .from('jadwal')
    .select(`
      *,
      profiles:user_id(
        nama_lengkap
      )
    `)
    .eq('tanggal', tanggal)

  // STAFF hanya lihat dirinya
  if (!isAdmin) {

    query = query.eq(
      'user_id',
      user.id
    )
  }

  const { data, error } =
    await query

  if (error) {
    alert("Gagal load data")
    return
  }

  if (!data || data.length === 0) {
    alert("Tidak ada jadwal")
    return
  }

  content.innerHTML = `

    <div class="card">

      <button onclick="renderKalenderHR()">
        ⬅ Kembali
      </button>

      <h2>
        📅 Detail Jadwal
      </h2>

      <p>${tanggal}</p>

      ${data.map(j => {

        let shift = "-"
        let jam = "-"

        // ================= SHIFT =================

        if (j.shift_code == "2") {
          shift = "🌅 Shift Pagi"
          jam = "07:00 - 15:00"
        }

        if (j.shift_code == "3") {
          shift = "🌇 Shift Sore"
          jam = "15:00 - 23:00"
        }

        if (j.shift_code == "4") {
          shift = "🌙 Shift Malam"
          jam = "23:00 - 07:00"
        }

        if (j.shift_code == "8") {
          shift = "⚫ OFF"
          jam = "-"
        }

        // ================= OVERRIDE =================

        if (j.status_override === "cuti") {
          shift = "🟢 CUTI"
          jam = "-"
        }

        if (j.status_override === "sakit") {
          shift = "🟡 SAKIT"
          jam = "-"
        }

        if (j.status_override === "izin") {
          shift = "🔵 IZIN"
          jam = "-"
        }

        return `

          <div class="card"
            style="
              margin-top:15px;
              border-left:5px solid #3b82f6;
            ">

            <h3>
              ${j.profiles?.nama_lengkap || '-'}
            </h3>

            <p>
              ${shift}
            </p>

            <p>
              ⏰ ${jam}
            </p>

          </div>

        `
      }).join('')}

    </div>
  `
}
window.renderKalenderHR = renderKalenderHR
