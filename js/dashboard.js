import { supabase } from './supabase.js'

export async function renderDashboard() {

  const content =
    document.getElementById('content')

  const user =
    window.currentUser

  const role =
    user?.role || 'staff'

  const today =
    new Date().toISOString().split('T')[0]

  /* ======================================================
     RENDER BASE
  ====================================================== */

  content.innerHTML = `

    <div class="dashboard-container">

      <!-- LIVE CLOCK -->
      <div class="live-clock-card">

        <div
          id="liveClock"
          class="live-clock">
          00:00:00
        </div>

        <div
          id="liveDate"
          class="live-date">
          Loading...
        </div>

      </div>

      <!-- HEADER -->
      <div class="dash-header">

        <h2>
          Hotel Operation Dashboard
        </h2>

        <p>
          Welcome,
          ${user?.nama_lengkap || 'User'}
        </p>

      </div>

      <!-- KPI -->
      <div class="kpi-grid">

        <div class="kpi-card blue">
          <h4>Total Staff</h4>
          <h1 id="totalUser">0</h1>
          <small>Active Employees</small>
        </div>

        <div class="kpi-card green">
          <h4>Present Today</h4>
          <h1 id="hadir">0</h1>
          <small>Checked In</small>
        </div>

        <div class="kpi-card orange">
          <h4>Not Check-in</h4>
          <h1 id="belum">0</h1>
          <small>Pending Attendance</small>
        </div>

        <div class="kpi-card red">
          <h4>Late Arrival</h4>
          <h1 id="telat">0</h1>
          <small>Late Staff</small>
        </div>

      </div>

      <!-- STAFF SECTION -->
      <div id="staffSection"></div>

      <!-- ADMIN SECTION -->
      <div id="adminSection"></div>

    </div>
  `

  /* ======================================================
     LIVE CLOCK
  ====================================================== */

  function updateClock() {

    const now = new Date()

    const jam =
      now.toLocaleTimeString('id-ID')

    const tanggal =
      now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })

    const clock =
      document.getElementById('liveClock')

    const date =
      document.getElementById('liveDate')

    if (clock)
      clock.innerText = jam

    if (date)
      date.innerText = tanggal
  }

  updateClock()

  setInterval(updateClock, 1000)

  /* ======================================================
     LOAD GLOBAL DATA
  ====================================================== */

  const { count: totalUser } =
    await supabase
      .from('profiles')
      .select('*', {
        count: 'exact',
        head: true
      })

  const { data: absensi } =
    await supabase
      .from('absensi')
      .select('*')
      .eq('tanggal', today)

  const hadir =
    absensi?.filter(
      a => a.waktu_masuk
    ).length || 0

  const telat =
    absensi?.filter(
      a => a.status_masuk === 'Terlambat'
    ).length || 0

  const belum =
    (totalUser || 0) - hadir

  document.getElementById(
    'totalUser'
  ).innerText = totalUser || 0

  document.getElementById(
    'hadir'
  ).innerText = hadir

  document.getElementById(
    'belum'
  ).innerText = belum

  document.getElementById(
    'telat'
  ).innerText = telat

  /* ======================================================
     STAFF SECTION
  ====================================================== */

  if (role === 'staff') {

    const { data: myShift } =
      await supabase
        .from('jadwal')
        .select('*')
        .eq('user_id', user.id)
        .eq('tanggal', today)
        .maybeSingle()

    const { data: myAbsen } =
      await supabase
        .from('absensi')
        .select('*')
        .eq('nama', user.nama_lengkap)
        .eq('tanggal', today)
        .maybeSingle()

    let shiftText = '-'

    if (myShift?.shift_code == "2")
      shiftText = "🌅 Shift Pagi"

    if (myShift?.shift_code == "3")
      shiftText = "🌇 Shift Sore"

    if (myShift?.shift_code == "4")
      shiftText = "🌙 Shift Malam"

    if (myShift?.shift_code == "8")
      shiftText = "⚫ OFF"

    if (myShift?.status_override === "cuti")
      shiftText = "🟢 CUTI"

    if (myShift?.status_override === "izin")
      shiftText = "🔵 IZIN"

    if (myShift?.status_override === "sakit")
      shiftText = "🟡 SAKIT"

    let statusHariIni =
      "❌ Belum Absen"

    if (
      myAbsen?.waktu_masuk &&
      !myAbsen?.waktu_pulang
    ) {
      statusHariIni =
        "🟡 Sedang Bekerja"
    }

    if (
      myAbsen?.waktu_masuk &&
      myAbsen?.waktu_pulang
    ) {
      statusHariIni =
        "🟢 Selesai"
    }

    document.getElementById(
      'staffSection'
    ).innerHTML = `

      <div class="card">

        <h3>Informasi Staff</h3>

        <div class="kpi-grid">

          <div class="kpi-card blue">

            <h4>Shift Hari Ini</h4>

            <h3>
              ${shiftText}
            </h3>

          </div>

          <div class="kpi-card green">

            <h4>Status Hari Ini</h4>

            <h3>
              ${statusHariIni}
            </h3>

          </div>

        </div>

      </div>

      <div class="card">

        <h3>Quick Access</h3>

        <div
          style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
            margin-top:15px;
          ">

          <button onclick="navigate('absensi')">
            📸 Absensi
          </button>

          <button onclick="navigate('riwayat')">
            📊 Riwayat
          </button>

          <button onclick="navigate('kalender')">
            📅 Kalender
          </button>

        </div>

      </div>
    `
  }

  /* ======================================================
     ADMIN / SUPER ADMIN
  ====================================================== */

  if (
    role === 'admin' ||
    role === 'super_admin'
  ) {

    const { data: pending } =
      await supabase
        .from('absensi')
        .select('*')
        .eq('tanggal', today)
        .eq('status_validasi', 'pending')

    const { data: belumPulang } =
      await supabase
        .from('absensi')
        .select('*')
        .eq('tanggal', today)
        .is('waktu_pulang', null)

    const { data: jadwal } =
      await supabase
        .from('jadwal')
        .select(`
          *,
          profiles:user_id(
            nama_lengkap
          )
        `)
        .eq('tanggal', today)

    document.getElementById(
      'adminSection'
    ).innerHTML = `

      <!-- MONITORING -->
      <div class="card">

        <h3>Live Monitoring</h3>

        <div class="kpi-grid">

          <div class="kpi-card red">

            <h4>Salah Absen</h4>

            <h1>
              ${pending?.length || 0}
            </h1>

          </div>

          <div class="kpi-card orange">

            <h4>Belum Pulang</h4>

            <h1>
              ${belumPulang?.length || 0}
            </h1>

          </div>

        </div>

      </div>

      <!-- STAFF SHIFT -->
      <div class="card">

        <h3>Jadwal Hari Ini</h3>

        <div
          style="
            display:grid;
            gap:10px;
            margin-top:15px;
          ">

          ${jadwal?.map(j => {

            let shift = '-'

            if (j.shift_code == "2")
              shift = "🌅 Pagi"

            if (j.shift_code == "3")
              shift = "🌇 Sore"

            if (j.shift_code == "4")
              shift = "🌙 Malam"

            if (j.shift_code == "8")
              shift = "⚫ OFF"

            if (j.status_override === "cuti")
              shift = "🟢 CUTI"

            if (j.status_override === "izin")
              shift = "🔵 IZIN"

            if (j.status_override === "sakit")
              shift = "🟡 SAKIT"

            return `

              <div class="absen-record">

                <strong>
                  ${j.profiles?.nama_lengkap || '-'}
                </strong>

                <div style="margin-top:5px;">
                  ${shift}
                </div>

              </div>

            `
          }).join('')}

        </div>

      </div>

      <!-- QUICK ACTION -->
      <div class="card">

        <h3>Quick Action</h3>

        <div
          style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
            margin-top:15px;
          ">

          <button onclick="navigate('jadwal')">
            📅 Jadwal
          </button>

          <button onclick="navigate('rekap')">
            📊 Rekap
          </button>

          <button onclick="navigate('shift')">
            🕒 Shift
          </button>

          <button onclick="navigate('users')">
            👥 Users
          </button>

        </div>

      </div>
    `
  }
}
