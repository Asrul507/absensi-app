import { supabase } from './supabase.js'

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

  // Convert decimal jam to HH:MM format
  const jam = Math.floor(totalJam)
  const menit = Math.round((totalJam - jam) * 60)
  const jamText = `${String(jam).padStart(2, '0')}:${String(menit).padStart(2, '0')}`

  // Progress circle (assume 160 jam/bulan target)
  const percentage = Math.min((totalJam / 160) * 100, 100)

  new Chart(ctx, {
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

  // Display text in center
  const textElement = document.getElementById(`${canvasId}-text`)
  if (textElement) {
    textElement.innerHTML = `
      <div style="font-size: 2rem; font-weight: 900; color: var(--primary);">${jamText}</div>
      <div style="font-size: .85rem; color: var(--text-muted);">Jam</div>
    `
  }
}

/* ===============================================================
   AKTIVITAS SAYA (LINE CHART)
=============================================================== */
export async function createAktivitasChart(canvasId, userId, dateFrom, dateTo) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded')
    return
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d')
  if (!ctx) return

  // Fetch data absensi in range
  const { data: absensiData } = await supabase
    .from('absensi')
    .select('*')
    .gte('tanggal', dateFrom)
    .lte('tanggal', dateTo)
    .order('tanggal', { ascending: true })

  // Group by date & calculate hours
  const dateMap = {}
  const dates = []

  // Generate all dates in range
  let currentDate = new Date(dateFrom)
  const endDate = new Date(dateTo)
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0]
    dateMap[dateStr] = { sebelum: 0, jamKerja: 0, setelah: 0 }
    dates.push(dateStr)
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Process absensi data
  absensiData?.forEach(a => {
    if (!dateMap[a.tanggal]) {
      dateMap[a.tanggal] = { sebelum: 0, jamKerja: 0, setelah: 0 }
      dates.push(a.tanggal)
    }

    if (a.waktu_masuk && a.waktu_pulang) {
      const masuk = new Date(a.waktu_masuk)
      const pulang = new Date(a.waktu_pulang)
      const jamKerja = (pulang - masuk) / (1000 * 60 * 60) // in hours

      dateMap[a.tanggal].jamKerja = jamKerja

      // Assume 07:00 masuk, 15:00 pulang
      const expectedMasuk = new Date(masuk.getFullYear(), masuk.getMonth(), masuk.getDate(), 7, 0)
      const expectedPulang = new Date(pulang.getFullYear(), pulang.getMonth(), pulang.getDate(), 15, 0)

      // Sebelum = jam sebelum masuk
      const sebelumJam = (expectedMasuk - masuk) / (1000 * 60 * 60)
      dateMap[a.tanggal].sebelum = Math.max(0, sebelumJam)

      // Setelah = jam setelah pulang
      const setelahJam = (pulang - expectedPulang) / (1000 * 60 * 60)
      dateMap[a.tanggal].setelah = Math.max(0, setelahJam)
    }
  })

  // Prepare chart data
  const sebelumData = dates.map(d => dateMap[d].sebelum)
  const jamKerjaData = dates.map(d => Math.round(dateMap[d].jamKerja * 10) / 10)
  const setelahData = dates.map(d => dateMap[d].setelah)

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => {
        const date = new Date(d)
        return `${date.getDate()}/${date.getMonth() + 1}`
      }),
      datasets: [
        {
          label: 'Sebelum',
          data: sebelumData,
          borderColor: CHART_COLORS.danger,
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          tension: 0.4,
          fill: false,
          borderWidth: 2,
          pointRadius: 4,
        },
        {
          label: 'Jam Kerja',
          data: jamKerjaData,
          borderColor: CHART_COLORS.success,
          backgroundColor: 'rgba(22, 163, 74, 0.2)',
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 4,
        },
        {
          label: 'Setelah',
          data: setelahData,
          borderColor: CHART_COLORS.warning,
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          tension: 0.4,
          fill: false,
          borderWidth: 2,
          pointRadius: 4,
        },
      ],
    },
    options: {
      ...chartDefaultOptions,
      scales: {
        y: {
          beginAtZero: true,
          max: 12,
          ticks: {
            color: '#64748b',
            font: { size: 11 },
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
   ABSENSI DISTRIBUTION (PIE CHART)
=============================================================== */
export async function createAbsensiChart(canvasId, userId, dateFrom, dateTo) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded')
    return
  }

  const ctx = document.getElementById(canvasId)?.getContext('2d')
  if (!ctx) return

  // Fetch data
  const { data: absensiData } = await supabase
    .from('absensi')
    .select('*')
    .gte('tanggal', dateFrom)
    .lte('tanggal', dateTo)

  // Count status
  let hadir = 0
  let terlambat = 0
  let tidakAbsen = 0
  let belumPulang = 0

  absensiData?.forEach(a => {
    if (!a.waktu_masuk) {
      tidakAbsen++
    } else if (!a.waktu_pulang) {
      belumPulang++
    } else if (a.status_masuk === 'Terlambat') {
      terlambat++
    } else {
      hadir++
    }
  })

  const total = hadir + terlambat + tidakAbsen + belumPulang || 1

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Hadir', 'Terlambat', 'Tidak Absen', 'Belum Pulang'],
      datasets: [
        {
          data: [
            ((hadir / total) * 100).toFixed(1),
            ((terlambat / total) * 100).toFixed(1),
            ((tidakAbsen / total) * 100).toFixed(1),
            ((belumPulang / total) * 100).toFixed(1),
          ],
          backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger, CHART_COLORS.info],
          borderColor: '#fff',
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...chartDefaultOptions,
      plugins: {
        ...chartDefaultOptions.plugins,
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || ''
              const value = context.parsed || 0
              return label + ': ' + value + '%'
            },
          },
        },
      },
    },
  })
}
