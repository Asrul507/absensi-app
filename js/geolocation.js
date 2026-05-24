import { supabase } from './supabase.js'

// Fungsi Matematika Haversine untuk menghitung jarak antara 2 koordinat (Hasil dalam satuan Meter)
function hitungJarakMeter(lat1, lon1, lat2, lon2) {
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
    if (!navigator.geolocation) {
      resolve({ status: 'error', pesan: 'Geolocation tidak didukung oleh browser ini.' })
      return
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const userLat = position.coords.latitude
      const userLng = position.coords.longitude
      
      try {
        const { data: daftarLokasi, error } = await supabase.from('lokasi_absen').select('*')
        if (error) throw error

        let areaTercakup = []

        daftarLokasi?.forEach(lok => {
          const jarak = hitungJarakMeter(userLat, userLng, Number(lok.latitude), Number(lok.longitude))
          if (jarak <= lok.radius_meter) {
            areaTercakup.push({
              id: lok.id,
              nama_titik: lok.nama_titik,
              jarak_meter: Math.round(jarak)
            })
          }
        })

        resolve({
          status: 'success',
          lat: userLat,
          lng: userLng,
          areas: areaTercakup
        })

      } catch (err) {
        resolve({ status: 'error', pesan: 'Gagal memuat konfigurasi lokasi: ' + err.message })
      }
    }, (err) => {
      let msg = 'Gagal mendapatkan koordinat GPS. Pastikan izin lokasi aktif.'
      if (err.code === 1) msg = 'Izin akses lokasi ditolak oleh pengguna.'
      resolve({ status: 'error', pesan: msg })
    }, {
      enableHighAccuracy: true,
      timeout: 8000
    })
  })
}
