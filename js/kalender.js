import { supabase } from './supabase.js'
import { getTodayLokal, toBulanTahunLokal, toTanggalPanjangLokal } from './timezone.js'
import { getAllShiftOptions } from './shift-resolver.js'
import { applyTenantFilter, canAccessAllDepartments } from './access-control.js'

const SHIFT_COLORS = ['#3b82f6', '#f59e0b', '#6366f1', '#22c55e', '#ec4899']
let KAL_SHIFT_INFO = {}

function buildShiftInfo(options) {
  KAL_SHIFT_INFO = options.reduce((acc, shift, index) => {
    const code = String(shift.code)
    const isOff = /off|libur/i.test(shift.nama_shift || '') || shift.jam_masuk === '-' || shift.jam_pulang === '-'
    acc[code] = {
      short: isOff ? 'OFF' : String(shift.nama_shift || code).replace(/^shift\s+/i, '').split(/\s+/).map(part => part[0]).join('').slice(0, 4).toUpperCase(),
      full: isOff ? `⚫ ${shift.nama_shift}` : shift.nama_shift,
      jam: (shift.jam_masuk === '-' || shift.jam_pulang === '-') ? '-' : `${shift.jam_masuk} - ${shift.jam_pulang}`,
      color: isOff ? '#94a3b8' : SHIFT_COLORS[index % SHIFT_COLORS.length],
    }
    return acc
  }, {})
}

export async function renderKalenderHR() {
  const user    = window.currentUser
  const isAdmin = canAccessAllDepartments(user) || user.role === 'admin'
  const today   = new Date()
  window._kalYear  = today.getFullYear()
  window._kalMonth = today.getMonth()
  await buildKalender(isAdmin, user)
}

async function buildKalender(isAdmin, user) {
  const content     = document.getElementById('content')
  const year        = window._kalYear
  const month       = window._kalMonth
  const firstDay    = new Date(year, month, 1)
  const lastDay     = new Date(year, month + 1, 0)
  const start       = firstDay.toISOString().split('T')[0]
  const end         = lastDay.toISOString().split('T')[0]
  const daysInMonth = lastDay.getDate()
  const monthName   = toBulanTahunLokal(`${year}-${String(month + 1).padStart(2, '0')}-01`)

  buildShiftInfo(await getAllShiftOptions())

  let query = applyTenantFilter(supabase.from('jadwal').select('*').gte('tanggal', start).lte('tanggal', end), { user })
  if (!isAdmin) query = query.eq('user_id', user.id)
  const { data: jadwal } = await query

  const map = {}
  ;(jadwal||[]).forEach(j => {
    if (!map[j.tanggal]) map[j.tanggal] = []
    map[j.tanggal].push(j)
  })

  const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
  const todayStr = getTodayLokal()

  let cells = ''
  const startDow = firstDay.getDay()
  for (let i = 0; i < startDow; i++) cells += '<div></div>'

  for (let d = 1; d <= daysInMonth; d++) {
    const tgl     = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const entries = map[tgl] || []
    const isToday = tgl === todayStr
    const isSun   = new Date(tgl).getDay() === 0

    let sub = ''
    if (isAdmin) {
      if (entries.length > 0) sub = `<div style="font-size:.55rem; color:var(--text-muted); margin-top:2px; white-space:nowrap;">${entries.length} staff</div>`
    } else if (entries.length > 0) {
      const label = shiftShort(entries[0])
      const color = shiftColor(entries[0])
      sub = `<div style="font-size:.58rem; font-weight:800; color:${color}; margin-top:2px;">${label}</div>`
    }

    cells += `
      <div onclick="openKalDetail('${tgl}')"
        style="border-radius:8px; padding:6px 2px; text-align:center; cursor:pointer; min-height:48px;
               display:flex; flex-direction:column; align-items:center; justify-content:center;
               background:${isToday?'var(--primary)':'var(--gray-50)'};
               border:1px solid ${isToday?'var(--primary)':'var(--gray-100)'}; transition:.15s;"
        onmouseover="if(!${isToday})this.style.background='var(--gray-100)'"
        onmouseout="if(!${isToday})this.style.background='var(--gray-50)'">
        <div style="font-size:.75rem; font-weight:${isToday?900:700}; color:${isToday?'#fff':isSun?'var(--danger)':'var(--text)'};">${d}</div>
        ${sub}
      </div>`
  }

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-calendar-alt"></i> Kalender ${isAdmin?'HR':'Jadwal Saya'}</h2>
    </div>
    <div class="card fade-up" style="padding: 16px; box-sizing: border-box; width: 100%;">
      
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; width: 100%;">
        <button class="btn-secondary btn-sm" onclick="kalPrev()" style="padding: 8px 14px; cursor:pointer;"><i class="fa fa-chevron-left"></i></button>
        <span style="font-weight:800; font-size:1rem; color:var(--text); text-align:center; min-width:120px; display:inline-block;">${monthName}</span>
        <button class="btn-secondary btn-sm" onclick="kalNext()" style="padding: 8px 14px; cursor:pointer;"><i class="fa fa-chevron-right"></i></button>
      </div>
      
      <div style="display:grid; grid-template-columns: repeat(7, 1fr) !important; gap:6px; margin-bottom:8px; text-align:center; width:100%;">
        ${dayNames.map(d=>`<div style="font-size:.7rem; font-weight:800; color:var(--text-muted); padding:4px 0;">${d}</div>`).join('')}
      </div>
      
      <div style="display:grid; grid-template-columns: repeat(7, 1fr) !important; gap:6px; width:100%; box-sizing: border-box;">
        ${cells}
      </div>
      
      ${!isAdmin ? `
        <div style="display:flex; gap:10px; margin-top:18px; flex-wrap:wrap; font-size:.72rem; color:var(--text-muted); justify-content:center;">
          ${Object.values(KAL_SHIFT_INFO).map(s => `<span><span style="color:${s.color}; margin-right:4px;">●</span> ${s.full.replace(/^⚫\s*/, '')}</span>`).join('')}
          <span><span style="color:#22c55e; margin-right:4px;">●</span> Cuti</span>
        </div>` : `
        <div style="margin-top:16px; font-size:.75rem; color:var(--text-muted); text-align:center;">
          <i class="fa fa-info-circle"></i> Klik tanggal untuk melihat rincian jadwal seluruh karyawan
        </div>`}
    </div>
  `

  window.kalPrev = async () => { window._kalMonth--; if(window._kalMonth<0){window._kalMonth=11;window._kalYear--} await buildKalender(isAdmin,user) }
  window.kalNext = async () => { window._kalMonth++; if(window._kalMonth>11){window._kalMonth=0;window._kalYear++} await buildKalender(isAdmin,user) }

  window.openKalDetail = async function(tanggal) {
    let q = applyTenantFilter(supabase.from('jadwal').select('*,profiles:user_id(nama_lengkap)').eq('tanggal',tanggal), { user })
    if (!isAdmin) q = q.eq('user_id', user.id)
    const { data } = await q

    const label = toTanggalPanjangLokal(tanggal)

    let body = data?.length ?
      data.map(j => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--gray-100);">
        <div>
          <div style="font-weight:700; font-size:.88rem; color:var(--text);">${isAdmin?(j.profiles?.nama_lengkap||'-'):'Jadwal Saya'}</div>
          <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">${shiftJam(j)}</div>
        </div>
        <span style="font-size:.75rem; font-weight:700; padding:4px 12px; border-radius:999px; background:var(--primary-light); color:var(--primary-dark);">${shiftFull(j)}</span>
      </div>`).join('')
      : `<div class="empty-state" style="padding:20px 0; text-align:center;"><i class="fa fa-calendar" style="font-size:1.5rem; opacity:0.3;"></i><p style="font-size:.85rem; color:var(--text-muted); margin-top:6px;">Tidak ada jadwal</p></div>`

    showModal(`
      <div class="modal-header">
        <h3><i class="fa fa-calendar-day" style="color:var(--primary);"></i> ${label}</h3>
        <button class="modal-close" onclick="closeKalModal()"><i class="fa fa-times"></i></button>
      </div>
      <div style="max-height:300px; overflow-y:auto; padding-right:4px;">
        ${body}
      </div>
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn-secondary" style="width:100%;" onclick="closeKalModal()">Tutup</button>
      </div>
    `)
  }
}

function showModal(html) {
  let el = document.getElementById('kalModal')
  if (el) el.remove()
  const bg = document.createElement('div')
  bg.id = 'kalModal'
  bg.className = 'modal-bg open'
  bg.innerHTML = `<div class="modal-box" style="max-width:400px; width:90%; border-radius:16px; padding:20px;">${html}</div>`
  bg.addEventListener('click', e => { if(e.target===bg) closeKalModal() })
  document.body.appendChild(bg)
}
window.closeKalModal = () => { const m=document.getElementById('kalModal'); if(m) m.remove() }

function shiftShort(j) {
  if(j?.status_override==='cuti')  return 'CUTI'
  if(j?.status_override==='sakit') return 'SKT'
  if(j?.status_override==='izin')  return 'IZIN'
  return KAL_SHIFT_INFO[String(j?.shift_code || '')]?.short || '-'
}
function shiftFull(j) {
  if(j?.status_override==='cuti')  return '🌴 Cuti'
  if(j?.status_override==='sakit') return '🤒 Sakit'
  if(j?.status_override==='izin')  return '📋 Izin'
  return KAL_SHIFT_INFO[String(j?.shift_code || '')]?.full || '-'
}
function shiftJam(j) {
  if(j?.status_override) return '-'
  return KAL_SHIFT_INFO[String(j?.shift_code || '')]?.jam || '-'
}
function shiftColor(j) {
  if(j?.status_override==='cuti')  return '#22c55e'
  if(j?.status_override==='sakit') return '#f59e0b'
  if(j?.status_override==='izin')  return '#3b82f6'
  return KAL_SHIFT_INFO[String(j?.shift_code || '')]?.color || '#94a3b8'
}
window.renderKalenderHR = renderKalenderHR
