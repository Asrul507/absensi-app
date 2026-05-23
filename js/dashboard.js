import { supabase } from './supabase.js'
import { createTotalJamKerjaChart, createAktivitasChart, createAbsensiChart } from './chart-helpers.js'

export async function renderDashboard() {
  const content = document.getElementById('content')
  const user = window.currentUser

  if (!user) {
    content.innerHTML = `<div class="card"><p>Silakan login dulu</p></div>`
    return
  }

  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const fullName = profile?.nama_lengkap || user.email
  const sisaCuti = profile?.sisa_cuti || 0

  // Date range (current month)
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
    <div class="page-header" style="margin-bottom: 20px;">
      <h2 style="margin: 0;"><i class="fa fa-tachometer-alt"></i> Dashboard</h2>
    </div>

    <!-- USER INFO CARD -->
    <div class="card fade-up" style="padding: 18px; margin-bottom: 20px; background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-weight: 800; font-size: 1.1rem;">${fullName}</div>
          <div style="font-size: .8rem; color: rgba(255,255,255,0.8); margin-top: 6px;">Saldo Cuti: <strong>${sisaCuti} hari</strong></div>
        </div>
        <div style="text-align: right; font-size: 2.2rem; opacity: 0.3;">👔</div>
      </div>
    </div>

    <!-- FAVORITE MENU -->
    <div style="margin-bottom: 20px;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: 10px;">
        <button onclick="window.navigate('absensi')" class="fav-btn" style="padding: 14px; background: #fef3c7; border: none; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;">
          <div style="font-size: 1.6rem; margin-bottom: 4px;"><i class="fa fa-sign-in-alt"></i></div>
          <div style="font-size: .7rem; font-weight: 700; color: #92400e;">Masuk</div>
        </button>
        <button onclick="window.navigate('absensi')" class="fav-btn" style="padding: 14px; background: #dbeafe; border: none; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;">
          <div style="font-size: 1.6rem; margin-bottom: 4px;"><i class="fa fa-sign-out-alt"></i></div>
          <div style="font-size: .7rem; font-weight: 700; color: #0284c7;">Keluar</div>
        </button>
        <button onclick="window.navigate('pengajuan')" class="fav-btn" style="padding: 14px; background: #e0e7ff; border: none; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;">
          <div style="font-size: 1.6rem; margin-bottom: 4px;"><i class="fa fa-file-alt"></i></div>
          <div style="font-size: .7rem; font-weight: 700; color: #4f46e5;">Pengajuan</div>
        </button>
        <button onclick="window.navigate('rekap-inout')" class="fav-btn" style="padding: 14px; background: #fee2e2; border: none; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;">
          <div style="font-size: 1.6rem; margin-bottom: 4px;"><i class="fa fa-history"></i></div>
          <div style="font-size: .7rem; font-weight: 700; color: #dc2626;">Riwayat</div>
        </button>
        <button onclick="window.navigate('daftar-absensi')" class="fav-btn" style="padding: 14px; background: #dcfce7; border: none; border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;">
          <div style="font-size: 1.6rem; margin-bottom: 4px;"><i class="fa fa-chart-bar"></i></div>
          <div style="font-size: .7rem; font-weight: 700; color: #166534;">Absensi</div>
        </button>
      </div>
    </div>

    <!-- TOTAL JAM KERJA -->
    <div class="card fade-up" style="padding: 18px; margin-bottom: 20px; text-align: center;">
      <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 14px;">Total Jam Kerja</div>
      <div style="position: relative; width: 160px; height: 160px; margin: 0 auto;">
        <canvas id="jamKerjaChart"></canvas>
        <div id="jamKerjaChart-text" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;"></div>
      </div>
    </div>

    <!-- AKTIVITAS SAYA - SCROLLABLE -->
    <div class="card fade-up" style="padding: 18px; margin-bottom: 20px;">
      <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Aktivitas Saya (Jam Datang & Pulang)</div>
      <div style="font-size: .75rem; color: var(--text-muted); margin-bottom: 12px;">
        ${firstDay.toLocaleDateString('id-ID')} - ${lastDay.toLocaleDateString('id-ID')}
      </div>
      <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
        <div style="position: relative; width: 100%; min-width: 600px; height: 300px;">
          <canvas id="aktivitasChart"></canvas>
        </div>
      </div>
    </div>

    <!-- DISTRIBUSI ABSENSI - 3 PIE CHARTS -->
    <div style="margin-bottom: 20px;">
      <div style="font-size: .75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Distribusi Absensi</div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
        <!-- Kehadiran -->
        <div class="card fade-up" style="padding: 14px;">
          <div style="font-size: .75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; text-align: center;">Kehadiran</div>
          <div style="position: relative; width: 100%; height: 200px;">
            <canvas id="absensiChartKehadiran"></canvas>
          </div>
        </div>

        <!-- Absen Masuk -->
        <div class="card fade-up" style="padding: 14px;">
          <div style="font-size: .75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; text-align: center;">Absen Masuk</div>
          <div style="position: relative; width: 100%; height: 200px;">
            <canvas id="absensiChartMasuk"></canvas>
          </div>
        </div>

        <!-- Absen Pulang -->
        <div class="card fade-up" style="padding: 14px;">
          <div style="font-size: .75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; text-align: center;">Absen Pulang</div>
          <div style="position: relative; width: 100%; height: 200px;">
            <canvas id="absensiChartPulang"></canvas>
          </div>
        </div>
      </div>
    </div>

    <style>
      .fav-btn:hover {
        transform: translateY(-3px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      }
      
      .fav-btn:active {
        transform: translateY(-1px);
      }

      @media (max-width: 768px) {
        .fav-btn {
          padding: 12px !important;
          font-size: .7rem !important;
        }
        
        .fav-btn div:first-child {
          font-size: 1.4rem !important;
        }
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
  setTimeout(() => {
    createTotalJamKerjaChart('jamKerjaChart', totalJamKerja)
    createAktivitasChart('aktivitasChart', userId, dateFrom, dateTo)
    createAbsensiChart('absensiChartKehadiran', 'absensiChartMasuk', 'absensiChartPulang', userId, dateFrom, dateTo)
  }, 100)
}
