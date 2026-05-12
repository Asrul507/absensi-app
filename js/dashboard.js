import { supabase } from './supabase.js'

export async function renderDashboard() {

  const content = document.getElementById('content')

  content.innerHTML = `
    <div class="dashboard-container">

      <!-- HEADER -->
      <div class="dash-header">
        <h2>Hotel Operation Dashboard</h2>
        <p>Real-time KPI & Attendance Overview</p>
      </div>

      <!-- GRID KPI -->
      <div class="kpi-grid">

        <div class="kpi-card blue">
          <h4>Total Staff</h4>
          <h1 id="totalUser">0</h1>
          <small>Active employees</small>
        </div>

        <div class="kpi-card green">
          <h4>Present Today</h4>
          <h1 id="hadir">0</h1>
          <small>Checked in today</small>
        </div>

        <div class="kpi-card orange">
          <h4>Not Yet Check-in</h4>
          <h1 id="belum">0</h1>
          <small>Pending attendance</small>
        </div>

        <div class="kpi-card red">
          <h4>Late Arrival</h4>
          <h1 id="telat">0</h1>
          <small>Late check-in</small>
        </div>

      </div>

      <!-- STATUS BAR -->
      <div class="status-bar">

        <div class="status-item">
          <span class="dot green"></span>
          On Time
        </div>

        <div class="status-item">
          <span class="dot orange"></span>
          Late
        </div>

        <div class="status-item">
          <span class="dot red"></span>
          Absent Risk
        </div>

      </div>

    </div>
  `

  /* ================= DATA ================= */
  const today = new Date().toISOString().split('T')[0]

  const { count: totalUser } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  const { data: absensi } = await supabase
    .from('absensi')
    .select('*')
    .eq('tanggal', today)

  const totalAbsen = absensi?.length || 0
  const hadir = absensi?.filter(a => a.waktu_masuk).length || 0
  const telat = absensi?.filter(a => a.status_masuk === 'Terlambat').length || 0
  const tepat = absensi?.filter(a => a.status_masuk === 'Tepat Waktu').length || 0
  const belum = (totalUser || 0) - totalAbsen

  /* ================= UPDATE UI ================= */
  document.getElementById('totalUser').innerText = totalUser || 0
  document.getElementById('hadir').innerText = hadir
  document.getElementById('belum').innerText = belum
  document.getElementById('telat').innerText = telat
}