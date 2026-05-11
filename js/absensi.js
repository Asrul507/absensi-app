export async function openCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true })
  videoEl.srcObject = stream
}

export function takePhoto(videoEl, canvasEl) {
  const ctx = canvasEl.getContext('2d')

  canvasEl.width = videoEl.videoWidth
  canvasEl.height = videoEl.videoHeight

  ctx.drawImage(videoEl, 0, 0)

  return canvasEl.toDataURL('image/jpeg')
}

export function getLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      }),
      reject,
      { enableHighAccuracy: true }
    )
  })
}

export function checkStatus(jamMasuk) {
  const now = new Date()
  const current = now.getHours()*60 + now.getMinutes()

  const [h,m] = jamMasuk.split(':').map(Number)
  const target = h*60 + m

  return current <= target ? 'Tepat Waktu' : 'Terlambat'
}

import { supabase } from './supabase.js'

export async function getTodayAbsen(nama) {

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('absensi')
    .select('*')
    .eq('nama', nama)
    .eq('tanggal', today)
    .maybeSingle()

  if (error) {
    console.error(error)
    return null
  }

  return data
}

