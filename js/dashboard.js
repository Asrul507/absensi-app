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

  // Sync foto_url dari DB ke currentUser supaya avatar tidak reset saat navigate
  if (profile?.foto_url && profile.foto_url !== window.currentUser.foto_url) {
    window.currentUser.foto_url = profile.foto_url
    // Update topbar avatar
    const el = document.getElementById('topbarAvatar')
    if (el) {
      el.style.backgroundImage = `url(${profile.foto_url})`
      el.style.backgroundSize  = 'cover'
      el.textContent = ''
    }
  }

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

  // Build menu items sesuai role
  const isStaff = user.role === 'staff'
  const menuItems = isStaff
    ? [
        { nav: 'absensi',       icon: 'fa-sign-in-alt',  label: 'Masuk',      color: '#f59e0b', color2: '#fbbf24' },
        { nav: 'absensi',       icon: 'fa-sign-out-alt', label: 'Keluar',     color: '#3b82f6', color2: '#60a5fa' },
        { nav: 'pengajuan',     icon: 'fa-file-alt',     label: 'Pengajuan',  color: '#8b5cf6', color2: '#a78bfa' },
        { nav: 'rekap-inout',   icon: 'fa-history',      label: 'Riwayat',    color: '#ef4444', color2: '#f87171' },
        { nav: 'daftar-absensi',icon: 'fa-chart-bar',    label: 'Absensi',    color: '#22c55e', color2: '#4ade80' },
        { nav: 'kalender',      icon: 'fa-calendar-alt', label: 'Kalender',   color: '#06b6d4', color2: '#22d3ee' },
      ]
    : [
        { nav: 'absensi',       icon: 'fa-sign-in-alt',  label: 'Masuk',      color: '#f59e0b', color2: '#fbbf24' },
        { nav: 'absensi',       icon: 'fa-sign-out-alt', label: 'Keluar',     color: '#3b82f6', color2: '#60a5fa' },
        { nav: 'pengajuan',     icon: 'fa-inbox',        label: 'Approval',   color: '#8b5cf6', color2: '#a78bfa' },
        { nav: 'rekap-inout',   icon: 'fa-history',      label: 'Riwayat',    color: '#ef4444', color2: '#f87171' },
        { nav: 'daftar-absensi',icon: 'fa-chart-bar',    label: 'Absensi',    color: '#22c55e', color2: '#4ade80' },
        { nav: 'users',         icon: 'fa-users',        label: 'Karyawan',   color: '#f97316', color2: '#fb923c' },
        { nav: 'kalender',      icon: 'fa-calendar-alt', label: 'Kalender',   color: '#06b6d4', color2: '#22d3ee' },
        { nav: 'rekap',         icon: 'fa-chart-pie',    label: 'Rekap',      color: '#ec4899', color2: '#f472b6' },
      ]

  const menuHtml = menuItems.map(m => `
    <button
      onclick="window.navigate('${m.nav}')"
      class="fav-btn"
      style="
        background: linear-gradient(135deg, ${m.color2} 0%, ${m.color} 100%);
        border: none;
        border-radius: 14px;
        cursor: pointer;
        text-align: center;
        color: white;
        font-weight: 700;
        padding: 14px 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 72px;
        width: 72px;
        flex-shrink: 0;
        transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      ">
      <i class="fa ${m.icon}" style="font-size:1.5rem;"></i>
      <span style="font-size:.65rem; line-height:1.2;">${m.label}</span>
    </button>
  `).join('')

  content.innerHTML = `
    <!-- HEADER -->
    <div class="page-header" style="margin-bottom: 20px;">
      <h2 style="margin: 0;"><i class="fa fa-tachometer-alt"></i> Dashboard</h2>
    </div>

    <!-- USER INFO CARD -->
    <div class="card fade-up" style="padding: 18px; margin-bottom: 20px; background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color: white; border: none;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-weight: 800; font-size: 1.1rem;">${fullName}</div>
          <div style="font-size: .8rem; color: rgba(255,255,255,0.8); margin-top: 6px;">Saldo Cuti: <strong>${sisaCuti} hari</strong></div>
        </div>
        <div style="text-align: right; font-size: 2.2rem; opacity: 0.2;"><i class="fa fa-id-badge"></i></div>
      </div>
    </div>

    <!-- FAVORITE MENU — kotak-kotak dengan scroll horizontal jika tidak muat -->
    <div style="margin-bottom: 20px;">
      <div style="
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 6px;
        /* Sembunyikan scrollbar tapi tetap bisa scroll */
        scrollbar-width: thin;
        scrollbar-color: rgba(0,0,0,0.15) transparent;
      ">
        <div style="
          display: flex;
          flex-direction: row;
          gap: 10px;
          width: max-content;
          padding: 4px 2px;
        ">
          ${menuHtml}
        </div>
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
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18) !important;
      }
      
      .fav-btn:active {
        transform: translateY(-1px);
      }

      /* Custom scrollbar untuk area menu */
      .fav-scroll-area::-webkit-scrollbar {
        height: 4px;
      }
      .fav-scroll-area::-webkit-scrollbar-track {
        background: transparent;
      }
      .fav-scroll-area::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.15);
        border-radius: 4px;
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
