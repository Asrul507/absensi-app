import { supabase } from './supabase.js'

const TZ_NAME = 'Asia/Makassar'
const LOCALE_ID = 'id-ID'

export async function getServerTimeIso() {
  const { data, error } = await supabase.rpc('get_server_time')
  if (error) {
    console.error('get_server_time RPC error:', error)
    return null
  }
  return typeof data === 'string' ? data : data?.get_server_time || null
}

export function getTanggalLokalFromIso(isoStr) {
  const d = new Date(isoStr)
  if (Number.isNaN(d.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_NAME,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d)

  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return y && m && day ? `${y}-${m}-${day}` : null
}

export function startServerDigitalClock({ key, timeElementId, dateElementId, serverIso }) {
  if (!key || !timeElementId || !serverIso) return

  window._serverClockIntervals = window._serverClockIntervals || {}
  if (window._serverClockIntervals[key]) {
    clearInterval(window._serverClockIntervals[key])
    delete window._serverClockIntervals[key]
  }

  const serverStart = new Date(serverIso)
  if (Number.isNaN(serverStart.getTime())) return
  const localStartMs = performance.now()

  const render = () => {
    const timeEl = document.getElementById(timeElementId)
    const dateEl = dateElementId ? document.getElementById(dateElementId) : null
    if (!timeEl) {
      clearInterval(window._serverClockIntervals[key])
      delete window._serverClockIntervals[key]
      return
    }

    const current = new Date(serverStart.getTime() + (performance.now() - localStartMs))
    timeEl.textContent = new Intl.DateTimeFormat(LOCALE_ID, {
      timeZone: TZ_NAME,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      hourCycle: 'h23'
    }).format(current)

    if (dateEl) {
      dateEl.textContent = new Intl.DateTimeFormat(LOCALE_ID, {
        timeZone: TZ_NAME,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(current)
    }
  }

  render()
  window._serverClockIntervals[key] = setInterval(render, 1000)
}
