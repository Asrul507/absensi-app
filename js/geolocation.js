import { supabase } from './supabase.js'

const GEOLOCATION_TIMEOUT_MS = 10000
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: GEOLOCATION_TIMEOUT_MS,
  maximumAge: 30000
}

function buildGeoFallback(status, pesan, extra = {}) {
  return {
    status,
    pesan,
    lat: null,
    lng: null,
    areas: [],
    ...extra
  }
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function isValidRadius(radius) {
  return Number.isFinite(radius) && radius > 0
}

// Fungsi Matematika Haversine untuk menghitung jarak antara 2 koordinat (Hasil dalam satuan Meter)
function hitungJarakMeter(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) return null

  const R = 6371e3 // Radius rata-rata bumi dalam satuan meter
  const phi1 = lat1 * Math.PI / 180
  const phi2 = lat2 * Math.PI / 180
  const deltaPhi = (lat2 - lat1) * Math.PI / 180
  const deltaLambda = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c // Jarak dalam satuan meter riil
}

// Fungsi utama mengambil koordinat HP saat ini dan mencocokkannya dengan DB
export async function dapatkanLokasiAbsenAktif() {
  return new Promise((resolve) => {
    let settled = false
    let timer = null

    const done = (payload) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(buildGeoFallback(payload?.status || 'error', payload?.pesan || 'Gagal mendapatkan lokasi.', payload))
    }

    timer = setTimeout(() => {
      done({
        status: 'timeout',
        pesan: 'GPS timeout. Pastikan izin lokasi aktif, GPS menyala, dan koneksi stabil.'
      })
    }, GEOLOCATION_TIMEOUT_MS)

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      done({ status: 'error', pesan: 'Geolocation tidak didukung oleh browser ini.' })
      return
    }

    try {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const userLat = toFiniteNumber(position?.coords?.latitude)
        const userLng = toFiniteNumber(position?.coords?.longitude)

        if (!isValidCoordinate(userLat, userLng)) {
          done({ status: 'error', pesan: 'Koordinat GPS tidak valid.' })
          return
        }

        try {
          const { data: daftarLokasi, error } = await supabase.from('lokasi_absen').select('*')
          if (error) {
            console.warn('[Absensi] Gagal memuat lokasi absen:', error)
            done({
              status: 'error',
              pesan: 'Gagal memuat konfigurasi lokasi absen.',
              lat: userLat,
              lng: userLng,
              areas: []
            })
            return
          }

          const areaTercakup = []

          daftarLokasi?.forEach(lok => {
            const lokasiLat = toFiniteNumber(lok.latitude)
            const lokasiLng = toFiniteNumber(lok.longitude)
            const radiusMeter = toFiniteNumber(lok.radius_meter)
            if (!isValidCoordinate(lokasiLat, lokasiLng) || !isValidRadius(radiusMeter)) return

            const jarak = hitungJarakMeter(userLat, userLng, lokasiLat, lokasiLng)
            if (jarak === null) return

            if (jarak <= radiusMeter) {
              areaTercakup.push({
                id: lok.id,
                nama_titik: lok.nama_titik,
                jarak_meter: Math.round(jarak)
              })
            }
          })

          done({
            status: 'success',
            lat: userLat,
            lng: userLng,
            areas: areaTercakup
          })
        } catch (err) {
          console.warn('[Absensi] Geolocation fallback:', err)
          done({
            status: 'error',
            pesan: 'Gagal memuat konfigurasi lokasi absen.',
            lat: userLat,
            lng: userLng,
            areas: []
          })
        }
      }, (err) => {
        let msg = 'Gagal mendapatkan koordinat GPS. Pastikan izin lokasi aktif.'
        if (err?.code === 1) msg = 'Izin akses lokasi ditolak oleh pengguna.'
        if (err?.code === 2) msg = 'Posisi GPS tidak tersedia. Pastikan GPS menyala.'
        if (err?.code === 3) msg = 'GPS timeout. Pastikan izin lokasi aktif dan coba lagi.'
        done({ status: err?.code === 3 ? 'timeout' : 'error', pesan: msg })
      }, GEOLOCATION_OPTIONS)
    } catch (err) {
      console.warn('[Absensi] Geolocation fallback:', err)
      done({ status: 'error', pesan: 'Gagal memulai akses lokasi. Pastikan website dibuka dengan HTTPS.' })
    }
  })
}
