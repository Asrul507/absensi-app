import { supabase } from './supabase.js'

/* ===============================================================
   CHART INSTANCE TRACKER (FIXED: Mencegah Konflik Canvas)
=============================================================== */
// Wadah memori untuk melacak grafik yang sedang aktif di layar aplikasi
const activeCharts = {}

function destroyExistingChart(canvasId) {
  // Jika canvas masih mengikat chart lama, hancurkan instansinya dari memori
  if (activeCharts[canvasId]) {
    activeCharts[canvasId].destroy()
    activeCharts[canvasId] = null
  }
  
  // Fallback cadangan menggunakan detektor internal Chart.js
  const nativeChart = Chart.getChart(canvasId)
  if (nativeChart) {
    nativeChart.destroy()
  }
}

/* ===============================================================
   CHART COLORS & CONFIG
=============================================================== */
export const CHART_COLORS = {
  primary: '#2563eb',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  info: '#0284c7',
  secondary: '#64748b',
}

export const chartDefaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '600' },
        color: '#64748b',
        padding: 15,
      },
    },
  },
}

/* ===============================================================
   CIRCULAR PROGRESS CHART (Total Jam Kerja)
=============================================================== */
export function createTotalJamKerjaChart(canvasId, totalJam) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded')
    return
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d')
  if (!ctx) return

  // FIX: Hancurkan chart lama sebelum memuat yang baru
  destroyExistingChart(canvasId)

  const jam = Math.floor(totalJam)
  const menit = Math.round((totalJam - jam) * 60)
  const jamText = `${String(jam).padStart(2, '0')}:${String(menit).padStart(2, '0')}`

  const percentage = Math.min((totalJam / 160) * 100, 100)

  // Simpan hasil render baru ke dalam tracker objek global
  activeCharts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Tercapai', 'Sisa'],
      datasets: [
        {
          data: [percentage, 100 - percentage],
          backgroundColor: [CHART_COLORS.success, '#e5e7eb'],
          borderColor: ['#fff', '#fff'],
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...chartDefaultOptions,
      cutout: '75%',
      plugins: {
        ...chartDefaultOptions.plugins,
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return context.label + ': ' + context.parsed + '%'
            },
          },
        },
      },
    },
  })

  const textElement = document.getElementById(`${canvasId}-text`)
  if (textElement) {
    textElement.innerHTML = `
      <div style="font-size: 2rem; font-weight: 900; color: var(--primary);">${jamText}</div>
      <div style="font-size: .85rem; color: var(--text-muted);">Jam</div>
    `
  }
}

/* ===============================================================
   AKTIVITAS SAYA (LINE CHART) - Jam Datang & Pulang
=============================================================== */
export async function createAktivitasChart(canvasId, userId, dateFrom, dateTo) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded')
    return
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d')
  if (!ctx) return

  // FIX: Hancurkan chart lama sebelum memuat yang baru
  destroyExistingChart(canvasId)

  const { data: absensiData } = await supabase
    .from('absensi')
    .select('*')
    .gte('tanggal', dateFrom)
    .lte('tanggal', dateTo)
    .order('tanggal', { ascending: true })

  const dateMap = {}
  const dates = []

  let currentDate = new Date(dateFrom)
  const endDate = new Date(dateTo)
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0]
    dateMap[dateStr] = { jamMasuk: null, jamPulang: null }
    dates.push(dateStr)
    currentDate.setDate(currentDate.getDate() + 1)
  }

  absensiData?.forEach(a => {
    if (!dateMap[a.tanggal]) {
      dateMap[a.tanggal] = { jamMasuk: null, jamPulang: null }
      dates.push(a.tanggal)
    }

    if (a.waktu_masuk) {
      const masuk = new Date(a.waktu_masuk)
      dateMap[a.tanggal].jamMasuk = masuk.getHours() + masuk.getMinutes() / 60
    }

    if (a.waktu_pulang) {
      const pulang = new Date(a.waktu_pulang)
      dateMap[a.tanggal].jamPulang = pulang.getHours() + pulang.getMinutes() / 60
    }
  })

  const jamMasukData = dates.map(d => dateMap[d].jamMasuk)
  const jamPulangData = dates.map(d => dateMap[d].jamPulang)

  // Simpan hasil render baru ke dalam tracker objek global
  activeCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => {
        const date = new Date(d)
        return `${date.getDate()}/${date.getMonth() + 1}`
      }),
      datasets: [
        {
          label: 'Jam Masuk',
          data: jamMasukData,
          borderColor: CHART_COLORS.success,
          backgroundColor: 'rgba(22, 163, 74, 0.1)',
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
        },
        {
          label: 'Jam Pulang',
          data: jamPulangData,
          borderColor: CHART_COLORS.warning,
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
        },
      ],
    },
    options: {
      ...chartDefaultOptions,
      scales: {
        y: {
          beginAtZero: false,
          min: 5,
          max: 19,
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            callback: function (value) {
              const h = Math.floor(value)
              const m = Math.round((value - h) * 60)
              return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            },
          },
          grid: {
            color: '#e2e8f0',
          },
        },
        x: {
          ticks: {
            color: '#64748b',
            font: { size: 11 },
          },
          grid: {
            color: '#e2e8f0',
          },
        },
      },
    },
  })
}

/* ===============================================================
   ABSENSI DISTRIBUTION (3 PIE CHARTS)
=============================================================== */
export async function createAbsensiChart(canvasId1, canvasId2, canvasId3, userId, dateFrom, dateTo) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded')
    return
  }

  // FIX: Hancurkan ketiga chart lama sebelum memuat rangkaian chart baru
  destroyExistingChart(canvasId1)
  destroyExistingChart(canvasId2)
  destroyExistingChart(canvasId3)

  const { data: absensiData } = await supabase
    .from('absensi')
    .select('*')
    .gte('tanggal', dateFrom)
    .lte('tanggal', dateTo)

  let totalDays = 0
  let hadir = 0
  let terlambat = 0
  let tidakAbsen = 0
  let masukOk = 0
  let pulangOk = 0

  absensiData?.forEach(a => {
    totalDays++
    
    if (!a.waktu_masuk) {
      tidakAbsen++
    } else if (a.status_masuk === 'Terlambat') {
      terlambat++
    } else {
      hadir++
    }

    if (a.waktu_masuk) masukOk++
    if (a.waktu_pulang) pulangOk++
  })

  const totalAbsen = absensiData?.length || 1

  // Chart 1: Kehadiran
  const ctx1 = document.getElementById(canvasId1)?.getContext('2d')
  if (ctx1) {
    activeCharts[canvasId1] = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['Hadir', 'Terlambat', 'Tidak Hadir'],
        datasets: [{
          data: [
            ((hadir / totalAbsen) * 100).toFixed(1),
            ((terlambat / totalAbsen) * 100).toFixed(1),
            ((tidakAbsen / totalAbsen) * 100).toFixed(1),
          ],
          backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger],
          borderColor: '#fff',
          borderWidth: 2,
        }],
      },
      options: {
        ...chartDefaultOptions,
        plugins: {
          ...chartDefaultOptions.plugins,
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 } },
          },
        },
      },
    })
  }

  // Chart 2: Absen Masuk
  const ctx2 = document.getElementById(canvasId2)?.getContext('2d')
  if (ctx2) {
    activeCharts[canvasId2] = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Absen Masuk', 'Tidak Absen Masuk'],
        datasets: [{
          data: [
            ((masukOk / totalAbsen) * 100).toFixed(1),
            (((totalAbsen - masukOk) / totalAbsen) * 100).toFixed(1),
          ],
          backgroundColor: [CHART_COLORS.success, CHART_COLORS.danger],
          borderColor: '#fff',
          borderWidth: 2,
        }],
      },
      options: {
        ...chartDefaultOptions,
        plugins: {
          ...chartDefaultOptions.plugins,
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 } },
          },
        },
      },
    })
  }

  // Chart 3: Absen Pulang
  const ctx3 = document.getElementById(canvasId3)?.getContext('2d')
  if (ctx3) {
    activeCharts[canvasId3] = new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: ['Absen Pulang', 'Tidak Absen Pulang'],
        datasets: [{
          data: [
            ((pulangOk / totalAbsen) * 100).toFixed(1),
            (((totalAbsen - pulangOk) / totalAbsen) * 100).toFixed(1),
          ],
          backgroundColor: [CHART_COLORS.info, CHART_COLORS.danger],
          borderColor: '#fff',
          borderWidth: 2,
        }],
      },
      options: {
        ...chartDefaultOptions,
        plugins: {
          ...chartDefaultOptions.plugins,
          legend: {
            position: 'bottom',
            labels: { font: { size: 11 } },
          },
        },
      },
    })
  }
}
