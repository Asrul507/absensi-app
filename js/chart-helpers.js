import { supabase } from './supabase.js'

/* ===============================================================
   CHART INSTANCE TRACKER (Mencegah Konflik Canvas)
=============================================================== */
const activeCharts = {}

function destroyExistingChart(canvasId) {
  if (activeCharts[canvasId]) {
    activeCharts[canvasId].destroy()
    activeCharts[canvasId] = null
  }
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
      position: 'top', // FIX: Pindahkan ke atas agar tidak terpotong di HP
      labels: {
        font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '700' },
        color: '#64748b',
        boxWidth: 12,
        padding: 10,
      },
    },
  },
}

/* ===============================================================
   DIAGRAM DOUGHNUT: TOTAL JAM KERJA (DASHBOARD ATAS)
=============================================================== */
export function createTotalJamKerjaChart(canvasId, totalJam) {
  if (typeof Chart === 'undefined') return

  const ctx = document.getElementById(canvasId)?.getContext('2d')
  if (!ctx) return

  destroyExistingChart(canvasId)

  const jam = Math.floor(totalJam)
  const menit = Math.round((totalJam - jam) * 60)
  const jamText = `${String(jam).padStart(2, '0')}:${String(menit).padStart(2, '0')}`
  const percentage = Math.min((totalJam / 160) * 100, 100)

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
        legend: { display: false },
      },
    },
  })

  const textElement = document.getElementById(`${canvasId}-text`)
  if (textElement) {
    textElement.innerHTML = `
      <div style="font-size: 1.8rem; font-weight: 900; color: #2563eb;">${jamText}</div>
      <div style="font-size: .8rem; color: #64748b; font-weight: 700;">Jam Kerja</div>
    `
  }
}

/* ===============================================================
   DIAGRAM INTERAKTIF BARU: AKTIVITAS SAYA (TOTAL JAM & DATA RIIL)
=============================================================== */
export async function createAktivitasChart(canvasId, userId, dateFrom, dateTo) {
  if (typeof Chart === 'undefined') return

  const ctx = document.getElementById(canvasId)?.getContext('2d')
  if (!ctx) return

  destroyExistingChart(canvasId)

  // Ambil data absensi riil
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
    dateMap[dateStr] = { 
      totalJam: 0, 
      jamMasukStr: '-', 
      jamPulangStr: '-', 
      radiusMasuk: 'Tidak Tercatat',
      radiusPulang: 'Tidak Tercatat'
    }
    dates.push(dateStr)
    currentDate.setDate(currentDate.getDate() + 1)
  }

  absensiData?.forEach(a => {
    if (!dateMap[a.tanggal]) {
      dateMap[a.tanggal] = { totalJam: 0, jamMasukStr: '-', jamPulangStr: '-', radiusMasuk: 'Tidak Tercatat', radiusPulang: 'Tidak Tercatat' }
      dates.push(a.tanggal)
    }

    let jamEfektif = 0
    let masukTxt = '-'
    let pulangTxt = '-'

    if (a.waktu_masuk) {
      const dMasuk = new Date(a.waktu_masuk)
      masukTxt = dMasuk.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      
      if (a.waktu_pulang) {
        const dPulang = new Date(a.waktu_pulang)
        pulangTxt = dPulang.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        // Hitung selisih jam kerja riil ke desimal
        jamEfektif = (dPulang - dMasuk) / (1000 * 60 * 60)
      }
    }

    // Format info koordinat radius GPS jika ada datanya di tabel Supabase Anda
    const latM = a.lat_masuk ? Number(a.lat_masuk).toFixed(4) : null
    const lngM = a.lng_masuk ? Number(a.lng_masuk).toFixed(4) : null
    const radiusM = (latM && lngM) ? `Lat: ${latM}, Lng: ${lngM}` : 'Dalam Radius Hotel'

    const latP = a.lat_pulang ? Number(a.lat_pulang).toFixed(4) : null
    const lngP = a.lng_pulang ? Number(a.lng_pulang).toFixed(4) : null
    const radiusP = (latP && lngP) ? `Lat: ${latP}, Lng: ${lngP}` : 'Dalam Radius Hotel'

    dateMap[a.tanggal] = {
      totalJam: Number(jamEfektif.toFixed(2)),
      jamMasukStr: masukTxt,
      jamPulangStr: pulangTxt,
      radiusMasuk: radiusM,
      radiusPulang: radiusP
    }
  })

  // Saring hanya tanggal yang memiliki data kerja agar grafik tidak drop ke angka 0 di hari libur/kosong
  const activeDates = dates.filter(d => dateMap[d].jamMasukStr !== '-')
  
  const totalJamData = activeDates.map(d => dateMap[d].totalJam)
  const metaMasuk = activeDates.map(d => dateMap[d].jamMasukStr)
  const metaPulang = activeDates.map(d => dateMap[d].jamPulangStr)
  const metaRadMasuk = activeDates.map(d => dateMap[d].radiusMasuk)
  const metaRadPulang = activeDates.map(d => dateMap[d].radiusPulang)

  // Membuat gradasi arsir warna transparan (Gradient Fill Effect)
  const gradient = ctx.createLinearGradient(0, 0, 0, 250)
  gradient.addColorStop(0, 'rgba(37, 99, 235, 0.45)')   // Biru pekat transparan di atas
  gradient.addColorStop(1, 'rgba(37, 99, 235, 0.00)')   // Memudar habis di bagian bawah

  activeCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: activeDates.map(d => {
        const date = new Date(d)
        return `${date.getDate()}/${date.getMonth() + 1}`
      }),
      datasets: [
        {
          label: 'Total Jam Kerja (Jam)',
          data: totalJamData,
          borderColor: '#2563eb',
          backgroundColor: gradient, // Gunakan arsiran gradasi
          tension: 0.35,
          fill: true, // AKTIFKAN ARSIRAN AREA
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#2563eb',
          pointBorderWidth: 2,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: '#2563eb',
          pointHoverBorderColor: '#fff',
        }
      ],
    },
    options: {
      ...chartDefaultOptions,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Durasi Kerja (Jam)',
            font: { size: 10, weight: 'bold', family: "'Plus Jakarta Sans'" }
          },
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            callback: value => value + ' Jam'
          },
          grid: { color: '#f1f5f9' },
        },
        x: {
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { display: false },
        },
      },
      plugins: {
        ...chartDefaultOptions.plugins,
        // INTERAKTIF TOOLTIP: Tampilkan jam masuk, pulang, dan status radius GPS saat di-klik/sentuh
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { size: 13, weight: '800', family: "'Plus Jakarta Sans'" },
          bodyFont: { size: 11, family: "'Plus Jakarta Sans'" },
          padding: 12,
          cornerRadius: 10,
          boxPadding: 6,
          callbacks: {
            title: function(context) {
              return `📅 Tanggal: ${context[0].label}`
            },
            label: function(context) {
              const idx = context.dataIndex
              return [
                `⏱️ Total Kerja : ${context.parsed.y} Jam`,
                `▶️ Jam Masuk   : ${metaMasuk[idx]}`,
                `⏹️ Jam Pulang  : ${metaPulang[idx]}`,
                `📍 GPS Masuk   : ${metaRadMasuk[idx]}`,
                `📍 GPS Pulang  : ${metaRadPulang[idx]}`
              ]
            }
          }
        }
      }
    },
  })
}

/* ===============================================================
   DIAGRAM DOUGHNUT: DISTRIBUSI BULANAN (BAWAH)
=============================================================== */
export async function createAbsensiChart(canvasId1, canvasId2, canvasId3, userId, dateFrom, dateTo) {
  if (typeof Chart === 'undefined') return

  destroyExistingChart(canvasId1)
  destroyExistingChart(canvasId2)
  destroyExistingChart(canvasId3)

  const { data: absensiData } = await supabase
    .from('absensi')
    .select('*')
    .gte('tanggal', dateFrom)
    .lte('tanggal', dateTo)

  let hadir = 0, terlambat = 0, tidakAbsen = 0, masukOk = 0, pulangOk = 0

  absensiData?.forEach(a => {
    if (!a.waktu_masuk) tidakAbsen++
    else if (a.status_masuk === 'Terlambat') terlambat++
    else hadir++

    if (a.waktu_masuk) masukOk++
    if (a.waktu_pulang) pulangOk++
  })

  const totalAbsen = absensiData?.length || 1

  const renderDoughnutMini = (canvasId, labels, dataVals, colors) => {
    const ctx = document.getElementById(canvasId)?.getContext('2d')
    if (!ctx) return
    
    activeCharts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: dataVals,
          backgroundColor: colors,
          borderColor: '#fff',
          borderWidth: 2,
        }],
      },
      options: {
        ...chartDefaultOptions,
        cutout: '65%',
        plugins: {
          ...chartDefaultOptions.plugins,
          legend: {
            position: 'bottom',
            labels: { font: { size: 10, weight: '700' }, boxWidth: 10, padding: 8 },
          },
        },
      },
    })
  }

  // Render 3 Doughnut ringkas di dashboard bawah
  renderDoughnutMini(canvasId1, ['Hadir', 'Terlambat', 'Absen'], [hadir, terlambat, tidakAbsen], [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger])
  renderDoughnutMini(canvasId2, ['Masuk', 'Kosong'], [masukOk, totalAbsen - masukOk], [CHART_COLORS.success, CHART_COLORS.danger])
  renderDoughnutMini(canvasId3, ['Pulang', 'Kosong'], [pulangOk, totalAbsen - pulangOk], [CHART_COLORS.info, CHART_COLORS.danger])
}