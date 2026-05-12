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
