import { supabase } from './supabase.js'
import { getTodayLokal } from './timezone.js'

/* ===============================================================
   CONFIGURATION
   Ganti nilai ini sesuai kebijakan perusahaan
=============================================================== */
export const ATTENDANCE_CONFIG = {
  GRACE_PERIOD_MINUTES: 5,        // Toleransi keterlambatan (menit)
  MAX_ALLOWED_LATE_MINUTES: 30,   // Jika > 30 menit = consider as "tidak masuk"
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
export function checkStatus(jamMasuk) {
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()

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
export function checkStatusPulang(jamPulangJadwal) {
  // Jika tidak ada jadwal pulang atau shift spesial (OFF/CUTI/dll)
  if (!jamPulangJadwal || jamPulangJadwal === '-') {
    return { status: 'Selesai', minutesEarly: 0 }
  }

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const [h, m] = jamPulangJadwal.split(':').map(Number)
  const targetMinutes = h * 60 + m

  // Jika waktu sekarang kurang dari jam seharusnya pulang
  if (currentMinutes < targetMinutes) {
    const minutesEarly = targetMinutes - currentMinutes
    return {
      status: 'Pulang Cepat',
      minutesEarly: minutesEarly
    }
  }

  return {
    status: 'Selesai',
    minutesEarly: 0
  }
}

/* ===============================================================
   GET TODAY ABSEN
   Ambil record absensi hari ini untuk karyawan tertentu
=============================================================== */
export async function getTodayAbsen(nama) {
  const today = getTodayLokal()

  const { data, error } = await supabase
    .from('absensi')
    .select('*')
    .eq('nama', nama)
    .eq('tanggal', today)
    .maybeSingle()

  if (error) {
    console.error('Error fetch absensi:', error)
    return null
  }

  return data
}

/* ===============================================================
   GET TODAY SHIFT
   Ambil jadwal shift hari ini untuk user tertentu
   Return: {
     nama_shift: string,
     jam_masuk: string (HH:MM),
     jam_pulang: string (HH:MM)
   }
=============================================================== */
export async function getTodayShift(user_id) {
  const today = getTodayLokal()

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

  // Map shift code ke jam kerja
  const shiftMap = {
    '2': { nama_shift: 'Shift Pagi',  jam_masuk: '07:00', jam_pulang: '15:00' },
    '3': { nama_shift: 'Shift Sore',  jam_masuk: '15:00', jam_pulang: '23:00' },
    '4': { nama_shift: 'Shift Malam', jam_masuk: '23:00', jam_pulang: '07:00' },
    '8': { nama_shift: 'OFF',         jam_masuk: '-',     jam_pulang: '-' },
  }

  return shiftMap[data.shift_code] || null
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
