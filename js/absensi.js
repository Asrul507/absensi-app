import { supabase } from './supabase.js'
import { getTodayLokal } from './timezone.js'
import { getShiftDetailByCode } from './shift-resolver.js'

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
   GET TODAY ABSEN
   Ambil record absensi hari ini untuk karyawan tertentu.

   FIX SHIFT MALAM:
   Jika tidak ada absensi hari ini, cek kemarin.
   Kasus: karyawan absen masuk jam 23:00 (tanggal kemarin),
   pulang jam 07:00 (tanggal hari ini) → data tersimpan di tanggal kemarin.
   Jika data kemarin ada waktu_masuk tapi belum ada waktu_pulang,
   artinya karyawan masih dalam shift malam → kembalikan data kemarin
   agar tombol "Absen Pulang" bisa muncul.
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

  // Jika ada absensi hari ini (masuk/sudah lengkap) → return langsung
  if (data) return data

  // ── FIX SHIFT MALAM: cek absensi tanggal kemarin ─────────────────────────
  // Hanya relevan jika sekarang dini hari (00:00 – 08:00)
  const jamSekarang = new Date().getHours()
  if (jamSekarang >= 8) return null  // Bukan window shift malam, return null saja

  // Hitung tanggal kemarin
  const kemarin = new Date()
  kemarin.setDate(kemarin.getDate() - 1)
  // Gunakan format YYYY-MM-DD manual agar tidak terpengaruh timezone
  const yyyy = kemarin.getFullYear()
  const mm   = String(kemarin.getMonth() + 1).padStart(2, '0')
  const dd   = String(kemarin.getDate()).padStart(2, '0')
  const kemarinStr = `${yyyy}-${mm}-${dd}`

  const { data: dataKemarin } = await supabase
    .from('absensi')
    .select('*')
    .eq('nama', nama)
    .eq('tanggal', kemarinStr)
    .maybeSingle()

  // Jika kemarin ada absen masuk tapi belum pulang → shift malam masih aktif
  if (dataKemarin?.waktu_masuk && !dataKemarin?.waktu_pulang) {
    console.log('[SHIFT MALAM] Ditemukan absensi kemarin yang belum pulang:', kemarinStr)
    return dataKemarin
  }

  return null
}

/* ===============================================================
   GET TODAY SHIFT
   Ambil jadwal shift hari ini untuk user tertentu.

   FIX SHIFT MALAM:
   Jika sekarang masih dini hari (00:00 – 08:00) dan kemarin
   karyawan punya shift malam (kode 4), kembalikan shift malam
   kemarin agar UI tidak berpindah ke shift hari ini sebelum
   karyawan sempat absen pulang.
   
   Return: {
     nama_shift: string,
     jam_masuk: string (HH:MM),
     jam_pulang: string (HH:MM)
   }
=============================================================== */
export async function getTodayShift(user_id) {
  const today = getTodayLokal()

  // ── FIX SHIFT MALAM: Cek kemarin jika masih dini hari ───────────────────
  const jamSekarang = new Date().getHours()
  if (jamSekarang < 8) {
    // Hitung tanggal kemarin
    const kemarin = new Date()
    kemarin.setDate(kemarin.getDate() - 1)
    const yyyy = kemarin.getFullYear()
    const mm   = String(kemarin.getMonth() + 1).padStart(2, '0')
    const dd   = String(kemarin.getDate()).padStart(2, '0')
    const kemarinStr = `${yyyy}-${mm}-${dd}`

    const { data: dataKemarin } = await supabase
      .from('jadwal')
      .select('*')
      .eq('user_id', user_id)
      .eq('tanggal', kemarinStr)
      .maybeSingle()

    // Jika kemarin shift malam (kode 4) → return shift malam, bukan shift hari ini
    if (dataKemarin?.shift_code === '4') {
      console.log('[SHIFT MALAM] Masih dalam window shift malam kemarin:', kemarinStr)
      const shiftMalam = await getShiftDetailByCode('4')
      return shiftMalam || { nama_shift: 'Shift Malam', jam_masuk: '23:00', jam_pulang: '07:00' }
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
