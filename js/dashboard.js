import { supabase } from './supabase.js'

export async function renderDashboard() {

  const content = document.getElementById('content')

  content.innerHTML = `
    <div class="card">
      <h3>Loading dashboard...</h3>
    </div>
  `

  const today = new Date().toISOString().split('T')[0]

  /* ================= TOTAL USER ================= */
  const { data: users, error } = await supabase
  .from('profiles')
  .select('id')

console.log('USERS:', users, error)

const totalUser = users?.length || 0

  /* ================= ABSENSI HARI INI ================= */
  const { data: absensi } = await supabase
    .from('absensi')
    .select('*')
    .eq('tanggal', today)

  const totalAbsen = absensi?.length || 0

  const hadir = absensi?.filter(a => a.waktu_masuk).length || 0

  const telat = absensi?.filter(a => a.status_masuk === 'Terlambat').length || 0
  const tepatWaktu = absensi?.filter(a => a.status_masuk === 'Tepat Waktu').length || 0

  const belumAbsen = Math.max((totalUser || 0) - totalAbsen, 0)

  /* ================= RENDER UI ================= */
  content.innerHTML = `
    <div class="dashboard-grid">

      <div class="card">
        <h3>Total User</h3>
        <h1>${totalUser || 0}</h1>
      </div>

      <div class="card">
        <h3>Hadir Hari Ini</h3>
        <h1>${hadir}</h1>
      </div>

      <div class="card">
        <h3>Belum Absen</h3>
        <h1 style="color:orange">${belumAbsen}</h1>
      </div>

      <div class="card">
        <h3>Tepat Waktu</h3>
        <h1 style="color:green">${tepatWaktu}</h1>
      </div>

      <div class="card">
        <h3>Terlambat</h3>
        <h1 style="color:red">${telat}</h1>
      </div>

    </div>
  `
}
const test = await supabase
  .from('profiles')
  .select('*')

console.log('PROFILES DATA:', test)