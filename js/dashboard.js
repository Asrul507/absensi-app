import { supabase } from './supabase.js'
import { createTotalJamKerjaChart, createAktivitasChart, createAbsensiChart } from './chart-helpers.js'

export async function renderDashboard() {
  const content = document.getElementById('content')
  const user = window.currentUser

  if (!user) {
    content.innerHTML = `<div class="card"><p>Silakan login dulu</p></div>`
    return
  }

  // Get profile for display
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const fullName = profile?.nama_lengkap || user.email
  const jabatan = profile?.jabatan || 'Staff'
  const fotoUrl = profile?.foto_url || ''
  const sisaCuti = profile?.sisa_cuti || 0

  // Default date range (current month)
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const dateFrom = firstDay.toISOString().split('T')[0]
  const dateTo = lastDay.toISOString().split('T')[0]

  // Get total jam kerja
  const { data: absensiMonth } = await supabase
    .from('absensi')
    .select('waktu_masuk, waktu_pulang')
    .eq('nama', fullName)
    .gte('tanggal', dateFrom)
    .lte('tanggal', dateTo)

  let totalJamKerja = 0
  absensiMonth?.forEach(a => {
    if (a.waktu_masuk && a.waktu_pulang) {
      const masuk = new Date(a.waktu_masuk)
      const pulang = new Date(a.waktu_pulang)
      totalJamKerja += (pulang - masuk) / (1000 * 60 * 60)
    }
  })

  content.innerHTML = `
    <!-- HEADER -->
    <div style="padding: 20px 0; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
        <div>
          <h1 style="font-size: 1.5rem; font-weight: 900; color: #0f172a; margin: 0;">Genius HR</h1>
          <p style="font-size: .85rem; color: #64748b; margin: 4px 0 0;">Bring value for better life</p>
        </div>
        <div style="text-align: right;">
          <img src="${fotoUrl || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2256%22 height=%2256%22%3E%3Ccircle cx=%2228%22 cy=%2228%22 r=%2224%22 fill=%22%232563eb%22 opacity=%220.2%22/%3E%3C/svg%3E'}" 
            style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary);">
        </div>
      </div>

      <!-- USER INFO -->
      <div class="card" style="padding: 16px; background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);">
        <div style="color: #fff;">
          <div style="font-size: 1.1rem; font-weight: 900;">${fullName}</div>
          <div style="font-size: .85rem; color: rgba(255,255,255,0.7); margin-top: 2px;">${jabatan}</div>
          <div style="display: flex; gap: 16px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2);">
            <div>
              <div style="font-size: .7rem; color: rgba(255,255,255,0.7);">SALDO CUTI</div>
              <div style="font-size: 1.3rem; font-weight: 900;">${sisaCuti}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- FAVORITE MENU -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: .85rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Favorit</div>
      <div style="display: flex; gap: 10px; justify-content: space-around; flex-wrap: wrap;">
        <button onclick="window.navigate('absensi')" class="favorite-btn" style="flex: 1; min-width: 80px; padding: 16px; background: #fff3cd; border: none; border-radius: 16px; text-align: center; cursor: pointer; transition: all 0.2s;">
          <div style="font-size: 1.8rem; margin-bottom: 6px;">✓</div>
          <div style="font-size: .75rem; font-weight: 700; color: #92400e;">Check In</div>
        </button>
        <button onclick="window.navigate('absensi')" class="favorite-btn" style="flex: 1; min-width: 80px; padding: 16px; background: #dbeafe; border: none; border-radius: 16px; text-align: center; cursor: pointer; transition: all 0.2s;">
          <div style="font-size: 1.8rem; margin-bottom: 6px;">↪</div>
          <div style="font-size: .75rem; font-weight: 700; color: #0284c7;">Check Out</div>
        </button>
        <button onclick="window.navigate('pengajuan')" class="favorite-btn" style="flex: 1; min-width: 80px; padding: 16px; background: #e0e7ff; border: none; border-radius: 16px; text-align: center; cursor: pointer; transition: all 0.2s;">
          <div style="font-size: 1.8rem; margin-bottom: 6px;">📋</div>
          <div style="font-size: .75rem; font-weight: 700; color: #4f46e5;">Pengajuan</div>
        </button>
        <button onclick="window.navigate('rekap-inout')" class="favorite-btn" style="flex: 1; min-width: 80px; padding: 16px; background: #f5d4d4; border: none; border-radius: 16px; text-align: center; cursor: pointer; transition: all 0.2s;">
          <div style="font-size: 1.8rem; margin-bottom: 6px;">⏰</div>
          <div style="font-size: .75rem; font-weight: 700; color: #dc2626;">Riwayat</div>
        </button>
        <button onclick="window.navigate('daftar-absensi')" class="favorite-btn" style="flex: 1; min-width: 80px; padding: 16px; background: #dcfce7; border: none; border-radius: 16px; text-align: center; cursor: pointer; transition: all 0.2s;">
          <div style="font-size: 1.8rem; margin-bottom: 6px;">📊</div>
          <div style="font-size: .75rem; font-weight: 700; color: #166534;">Data</div>
        </button>
      </div>
    </div>

    <!-- TOTAL JAM KERJA -->
    <div class="card fade-up" style="padding: 24px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: .85rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 16px;">Total Jam Kerja Saya</div>
      <div style="position: relative; width: 200px; height: 200px; margin: 0 auto;">
        <canvas id="jamKerjaChart" style="max-width: 100%;"></canvas>
        <div id="jamKerjaChart-text" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"></div>
      </div>
    </div>

    <!-- AKTIVITAS SAYA -->
    <div class="card fade-up" style="padding: 24px; margin-bottom: 24px;">
      <div style="font-size: .85rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Aktivitas Saya</div>
      <div style="font-size: .75rem; color: var(--text-muted); margin-bottom: 16px;">
        ${firstDay.toLocaleDateString('id-ID')} - ${lastDay.toLocaleDateString('id-ID')}
      </div>
      <div style="position: relative; width: 100%; height: 300px;">
        <canvas id="aktivitasChart"></canvas>
      </div>
    </div>

    <!-- ABSENSI DISTRIBUTION -->
    <div class="card fade-up" style="padding: 24px;">
      <div style="font-size: .85rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 16px;">Distribusi Absensi</div>
      <div style="position: relative; width: 100%; height: 300px;">
        <canvas id="absensiChart"></canvas>
      </div>
    </div>

    <style>
      .favorite-btn:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
      }
    </style>
  `

  // Load Chart.js if not loaded
  if (typeof Chart === 'undefined') {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
    script.onload = () => {
      loadCharts(user.id, dateFrom, dateTo, totalJamKerja)
    }
    document.head.appendChild(script)
  } else {
    loadCharts(user.id, dateFrom, dateTo, totalJamKerja)
  }
}

async function loadCharts(userId, dateFrom, dateTo, totalJamKerja) {
  // Small delay to ensure DOM is ready
  setTimeout(() => {
    createTotalJamKerjaChart('jamKerjaChart', totalJamKerja)
    createAktivitasChart('aktivitasChart', userId, dateFrom, dateTo)
    createAbsensiChart('absensiChart', userId, dateFrom, dateTo)
  }, 100)
}
