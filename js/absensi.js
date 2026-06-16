import { supabase } from './supabase.js'
import { ATTENDANCE_CONFIG } from './config.js'
import { getTodayLokal, getTanggalKemarinLocal, buildTimestampLokal, parseAbsensiTimestamp } from './timezone.js'
// PATCH: tambah import getShiftDetailByJamMasuk sebagai fallback saat shift_code null
import { getShiftDetailByCode, getShiftDetailByJamMasuk } from './shift-resolver.js'

export function addDaysYmd(ymd, days) {
  const [year, month, day] = String(ymd || '').split('-').map(Number)
  if (!year || !month || !day || !Number.isFinite(days)) return ymd

  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function getMakassarMinutes(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Makassar',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(date)
  const h = Number(parts.find(p => p.type === 'hour')?.value || 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value || 0)
  return (h * 60) + m
}

/* ===============================================================
   CHECK STATUS MASUK
   Compare waktu masuk dengan jam shift + grace period
   
   Return: {
     status: 'Tepat Waktu' | 'Terlambat',
     minutesLate: number,
     message: string
   }
=============================================================== */
export function checkStatus(jamMasuk, nowDate = new Date()) {
  const current = getMakassarMinutes(nowDate)

  const [h, m] = jamMasuk.split(':').map(Number)
  const targetTime = h * 60 + m

  // Grace period: toleransi + berapa menit
  const targetWithGrace = targetTime + ATTENDANCE_CONFIG.GRACE_PERIOD_MINUTES

  // Hitung berapa menit terlambat
  const minutesLate = Math.max(0, current - targetTime)

  const result = {
    minutesLate,
    message: ''
  }

  if (current <= targetWithGrace) {
    result.status = 'Tepat Waktu'
    result.message = minutesLate > 0
      ? `Masuk ${minutesLate} menit lebih awal (grace period)`
      : 'Masuk tepat waktu'
  } else {
    result.status = 'Terlambat'
    const actualLate = minutesLate - ATTENDANCE_CONFIG.GRACE_PERIOD_MINUTES
    result.message = `Terlambat ${actualLate} menit`
  }

  return result
}

/* ===============================================================
   CHECK STATUS PULANG (BARU)
   Compare waktu pulang dengan jam selesai shift
   
   Return: {
     status: 'Selesai' | 'Pulang Cepat',
     minutesEarly: number
   }
=============================================================== */
export function checkStatusPulang(jamPulangJadwal, nowDate = new Date()) {
  // Jika tidak ada jadwal pulang atau shift spesial (OFF/CUTI/dll)
  if (!jamPulangJadwal || jamPulangJadwal === '-') {
    return { status: 'Selesai', minutesEarly: 0 }
  }

  const currentMinutes = getMakassarMinutes(nowDate)

  const [h, m] = jamPulangJadwal.split(':').map(Number)
  const targetMinutes = h * 60 + m

  // ── FIX SHIFT MALAM: jam pulang 07:00 (420 menit dari tengah malam) ──────
  // Jika jam pulang jadwal adalah dini hari (mis. 07:00 = 420 menit)
  // dan jam sekarang sudah lewat tengah malam (currentMinutes kecil),
  // maka perlu deteksi lintas hari agar tidak salah hitung "Pulang Cepat"
  // Contoh: jam pulang 07:00 (420), sekarang 06:45 (405) → memang belum saatnya
  // Contoh: jam pulang 07:00 (420), sekarang 23:30 (1410) → ini shift malam, jangan dianggap Pulang Cepat

  // Deteksi shift malam: jam pulang < 12:00 (kemungkinan besar lintas hari)
  if (targetMinutes < 12 * 60) {
    // Jika jam sekarang > 12:00 (sore/malam), artinya shift belum selesai (masih menuju dini hari)
    // Jangan anggap "Pulang Cepat"
    if (currentMinutes > 12 * 60) {
      return { status: 'Selesai', minutesEarly: 0 }
    }
    // Jika jam sekarang < jam pulang (mis. 06:45 < 07:00) → memang belum waktunya
    if (currentMinutes < targetMinutes) {
      const minutesEarly = targetMinutes - currentMinutes
      return { status: 'Pulang Cepat', minutesEarly }
    }
    return { status: 'Selesai', minutesEarly: 0 }
  }

  // Shift biasa (jam pulang siang/sore/malam tapi tidak lintas hari)
  if (currentMinutes < targetMinutes) {
    const minutesEarly = targetMinutes - currentMinutes
    return { status: 'Pulang Cepat', minutesEarly }
  }

  return {
    status: 'Selesai',
    minutesEarly: 0
  }
}

/* ===============================================================
   HELPER: Cek apakah shift lintas_hari kemarin masih dalam
   window aktif (belum melewati jam_pulang + CHECKOUT_GRACE_HOURS).

   Dipakai oleh getTodayShift() dan getTodayAbsen() agar
   keduanya menggunakan logika yang sama persis.

   Return: true jika shift kemarin masih harus diutamakan.
=============================================================== */
function isOvernightShiftStillActive(shiftKemarin, nowDate = new Date(), todayOverride = null) {
  if (!shiftKemarin?.lintas_hari) return false

  const jamPulang = shiftKemarin.jam_pulang
  if (!jamPulang || jamPulang === '-') return false

  // Jam pulang shift malam jatuh di tanggal hari ini (hari H)
  // Susun cutOff = jam_pulang hari ini + CHECKOUT_GRACE_HOURS
  const todayStr = todayOverride || getTodayLokal()          // "YYYY-MM-DD" hari ini
  const dueISO   = buildTimestampLokal(todayStr, jamPulang)
  const dueAt    = parseAbsensiTimestamp(dueISO)
  if (!dueAt) return false

  const graceMs = ATTENDANCE_CONFIG.CHECKOUT_GRACE_HOURS * 60 * 60 * 1000
  const cutOff  = new Date(dueAt.getTime() + graceMs)

  // Shift masih aktif selama sekarang belum melewati cutOff
  return nowDate.getTime() < cutOff.getTime()
}

/* ===============================================================
   GET TODAY ABSEN
   Ambil record absensi hari ini untuk karyawan tertentu.

   FIX SHIFT MALAM:
   Sebelum memutuskan data hari ini, cek dulu apakah kemarin ada
   absensi terbuka (waktu_masuk ada, waktu_pulang null) dengan
   shift lintas_hari yang masih dalam window aktif.
   Jika ya → return data kemarin agar tombol "Absen Pulang" muncul.

   PATCH BUG SHIFT LINTAS HARI:
   Jika shift_code tidak tersimpan di record absensi (null),
   fallback ke getShiftDetailByJamMasuk(jam_jadwal_masuk) agar
   shift malam tetap terdeteksi dengan benar.
=============================================================== */
export async function getTodayAbsen(userOrName, todayOverride = null, nowDate = new Date()) {
  const today = todayOverride || getTodayLokal()
  const userId = typeof userOrName === 'object' ? userOrName?.id : null
  const nama = typeof userOrName === 'object'
    ? (userOrName?.nama_lengkap || userOrName?.email || '')
    : userOrName

  async function fetchAbsensiByDate(tanggal) {
    if (userId) {
      const byUser = await supabase
        .from('absensi')
        .select('*')
        .eq('user_id', userId)
        .eq('tanggal', tanggal)
        .maybeSingle()
      if (byUser.error) throw byUser.error
      if (byUser.data) return byUser.data
    }

    // Fallback aman untuk data lama yang belum memiliki user_id.
    if (nama) {
      const byName = await supabase
        .from('absensi')
        .select('*')
        .eq('nama', nama)
        .eq('tanggal', tanggal)
        .maybeSingle()
      if (byName.error) throw byName.error
      return byName.data || null
    }

    return null
  }

  const kemarin = getTanggalKemarinLocal(today)
  const dataKemarin = await fetchAbsensiByDate(kemarin)

  // Jika kemarin adalah shift malam dan belum pulang, gunakan record kemarin.
  if (dataKemarin && dataKemarin.waktu_masuk && !dataKemarin.waktu_pulang) {
    const shiftKemarin = dataKemarin.shift_id
      ? await getShiftDetailByCode(dataKemarin.shift_id)
      : dataKemarin.shift_code
        ? await getShiftDetailByCode(dataKemarin.shift_code)
        : dataKemarin.jam_jadwal_masuk
          ? await getShiftDetailByJamMasuk(dataKemarin.jam_jadwal_masuk)
          : await getTodayShift(userId, kemarin)

    if (isOvernightShiftStillActive(shiftKemarin, nowDate, today)) {
      return dataKemarin
    }
  }

  return fetchAbsensiByDate(today)
}

/* ===============================================================
   GET TODAY SHIFT
   Ambil jadwal shift hari ini untuk user tertentu.

   FIX SHIFT MALAM:
   Jika shift kemarin adalah lintas_hari dan masih dalam window
   aktif (jam_pulang + CHECKOUT_GRACE_HOURS belum lewat),
   kembalikan shift kemarin agar UI tidak berpindah ke shift hari
   ini sebelum karyawan sempat absen pulang.
   
   Return: {
     nama_shift: string,
     jam_masuk: string (HH:MM),
     jam_pulang: string (HH:MM)
   }
=============================================================== */
export async function getTodayShift(user_id, todayOverride = null, nowDate = new Date()) {
  const today = todayOverride || getTodayLokal()

  // ── FIX SHIFT MALAM: Cek kemarin berdasarkan cutOff dinamis ─────────────
  // (tidak lagi hardcode jamSekarang < 8)
  const kemarinStr = addDaysYmd(today, -1)

  const { data: dataKemarin } = await supabase
    .from('jadwal')
    .select('*')
    .eq('user_id', user_id)
    .eq('tanggal', kemarinStr)
    .maybeSingle()

  if (dataKemarin?.shift_code) {
    const shiftKemarin = await getShiftDetailByCode(dataKemarin.shift_code)
    if (isOvernightShiftStillActive(shiftKemarin, nowDate, today)) {
      console.log('[SHIFT MALAM] Masih dalam window shift lintas hari kemarin:', kemarinStr)
      return shiftKemarin
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const { data } = await supabase
    .from('jadwal')
    .select('*')
    .eq('user_id', user_id)
    .eq('tanggal', today)
    .maybeSingle()

  if (!data) return null

  // Handle shift overrides (cuti, sakit, izin)
  if (data.status_override === 'cuti')  return { nama_shift: 'CUTI',        jam_masuk: '-', jam_pulang: '-' }
  if (data.status_override === 'sakit') return { nama_shift: 'SAKIT',       jam_masuk: '-', jam_pulang: '-' }
  if (data.status_override === 'izin')  return { nama_shift: 'IZIN',        jam_masuk: '-', jam_pulang: '-' }

  const detailShift = await getShiftDetailByCode(data.shift_code)
  return detailShift || null
}

/* ===============================================================
   OPEN CAMERA
   Request akses kamera user
=============================================================== */
export async function openCamera(videoElement) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    })
    videoElement.srcObject = stream
    window.activeVideoStream = stream
  } catch (err) {
    console.error('Camera error:', err)
    throw new Error('Tidak bisa akses kamera: ' + err.message)
  }
}

/* ===============================================================
   TAKE PHOTO
   Capture frame dari video stream ke canvas (base64)
=============================================================== */
export function takePhoto(videoElement, canvasElement) {
  const ctx = canvasElement.getContext('2d')
  canvasElement.width = videoElement.videoWidth
  canvasElement.height = videoElement.videoHeight
  ctx.drawImage(videoElement, 0, 0)
  return canvasElement.toDataURL('image/jpeg', 0.8)
}

/* ===============================================================
   GET LOCATION
   Request geolokasi user
   Return: { lat, lng }
=============================================================== */
export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation tidak didukung browser ini'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      (error) => {
        reject(new Error('Gagal dapat lokasi: ' + error.message))
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  })
}


export function getStatusPulangReminder(absen, shiftInfo, nowDate = new Date()) {
  if (!absen?.waktu_masuk) return { status: 'Tidak Absen Masuk', isLateCheckout: false }
  if (absen?.waktu_pulang) return { status: 'Sudah Pulang', isLateCheckout: false }

  const jamMasukJadwal = shiftInfo?.jam_masuk || absen?.jam_jadwal_masuk || null
  const jamPulangJadwal = shiftInfo?.jam_pulang || absen?.jam_jadwal_pulang || null

  if (!jamPulangJadwal || jamPulangJadwal === '-') {
    return { status: 'Belum Absen Pulang', isLateCheckout: false }
  }

  let dueDate = absen?.tanggal || getTodayLokal()

  let lintasHari = Boolean(shiftInfo?.lintas_hari)

  if (jamMasukJadwal && jamMasukJadwal !== '-') {
    const [inH, inM] = jamMasukJadwal.split(':').map(Number)
    const [outH, outM] = jamPulangJadwal.split(':').map(Number)
    const masukMin = (inH * 60) + inM
    const pulangMin = (outH * 60) + outM

    if (pulangMin <= masukMin) lintasHari = true

    if (lintasHari) {
      dueDate = addDaysYmd(dueDate, 1)
    }
  }

  const dueISO = buildTimestampLokal(dueDate, jamPulangJadwal)
  const dueAt = parseAbsensiTimestamp(dueISO)
  if (!dueAt) return { status: 'Belum Absen Pulang', isLateCheckout: false }

  const graceMs = ATTENDANCE_CONFIG.CHECKOUT_GRACE_HOURS * 60 * 60 * 1000
  const cutOff = new Date(dueAt.getTime() + graceMs)

  if (nowDate.getTime() >= cutOff.getTime()) {
    return { status: 'Lupa Absen Pulang', isLateCheckout: true }
  }

  return { status: 'Belum Absen Pulang', isLateCheckout: false }
}
