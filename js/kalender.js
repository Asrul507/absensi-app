import { supabase } from './supabase.js'

export async function renderKalenderHR() {
  const user    = window.currentUser
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
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
  const monthName   = firstDay.toLocaleString('id-ID', { month:'long', year:'numeric' })

  let query = supabase.from('jadwal').select('*').gte('tanggal', start).lte('tanggal', end)
  if (!isAdmin) query = query.eq('user_id', user.id)
  const { data: jadwal } = await query

  const map = {}
  ;(jadwal||[]).forEach(j => {
    if (!map[j.tanggal]) map[j.tanggal] = []
    map[j.tanggal].push(j)
  })

  const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
  const todayStr = new Date().toISOString().split('T')[0]

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
      if (entries.length > 0) sub = `<div style="font-size:.58rem;color:var(--text-muted);margin-top:1px;">${entries.length} staff</div>`
    } else if (entries.length > 0) {
      const label = shiftShort(entries[0])
      const color = shiftColor(entries[0])
      sub = `<div style="font-size:.6rem;font-weight:800;color:${color};margin-top:1px;">${label}</div>`
    }

    cells += `
      <div onclick="openKalDetail('${tgl}')"
        style="border-radius:8px;padding:5px 3px;text-align:center;cursor:pointer;min-height:42px;
               background:${isToday?'var(--primary)':'var(--gray-50)'};
               border:1px solid ${isToday?'var(--primary)':'var(--gray-100)'};transition:.15s;"
        onmouseover="if(!${isToday})this.style.background='var(--gray-100)'"
        onmouseout="if(!${isToday})this.style.background='var(--gray-50)'">
        <div style="font-size:.75rem;font-weight:${isToday?900:700};color:${isToday?'#fff':isSun?'var(--danger)':'var(--text)'};">${d}</div>
        ${sub}
      </div>`
  }

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-calendar-alt"></i> Kalender ${isAdmin?'HR':'Jadwal Saya'}</h2>
    </div>
    <div class="card fade-up">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button class="btn-secondary btn-sm" onclick="kalPrev()"><i class="fa fa-chevron-left"></i></button>
        <span style="font-weight:800;font-size:.95rem;">${monthName}</span>
        <button class="btn-secondary btn-sm" onclick="kalNext()"><i class="fa fa-chevron-right"></i></button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;">
        ${dayNames.map(d=>`<div style="text-align:center;font-size:.62rem;font-weight:800;color:var(--text-muted);padding:3px 0;">${d}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">${cells}</div>
      ${!isAdmin ? `
        <div style="display:flex;gap:12px;margin-top:14px;flex-wrap:wrap;font-size:.72rem;color:var(--text-muted);">
          <span><span style="color:#3b82f6;">●</span> Pagi</span>
          <span><span style="color:#f59e0b;">●</span> Sore</span>
          <span><span style="color:#6366f1;">●</span> Malam</span>
          <span><span style="color:#22c55e;">●</span> Cuti</span>
          <span><span style="color:#94a3b8;">●</span> OFF</span>
        </div>` : `
        <div style="margin-top:10px;font-size:.75rem;color:var(--text-muted);">
          <i class="fa fa-info-circle"></i> Klik tanggal untuk melihat jadwal semua karyawan
        </div>`}
    </div>
  `

  window.kalPrev = async () => { window._kalMonth--; if(window._kalMonth<0){window._kalMonth=11;window._kalYear--} await buildKalender(isAdmin,user) }
  window.kalNext = async () => { window._kalMonth++; if(window._kalMonth>11){window._kalMonth=0;window._kalYear++} await buildKalender(isAdmin,user) }

  window.openKalDetail = async function(tanggal) {
    let q = supabase.from('jadwal').select('*,profiles:user_id(nama_lengkap)').eq('tanggal',tanggal)
    if (!isAdmin) q = q.eq('user_id', user.id)
    const { data } = await q

    const label = new Date(tanggal+'T00:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

    let body = data?.length ? data.map(j => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);">
        <div>
          <div style="font-weight:700;font-size:.88rem;">${isAdmin?(j.profiles?.nama_lengkap||'-'):'Jadwal Saya'}</div>
          <div style="font-size:.75rem;color:var(--text-muted);">${shiftJam(j)}</div>
        </div>
        <span style="font-size:.78rem;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--primary-light);color:var(--primary-dark);">${shiftFull(j)}</span>
      </div>`).join('')
      : `<div class="empty-state" style="padding:20px 0;"><i class="fa fa-calendar"></i><p>Tidak ada jadwal</p></div>`

    showModal(`
      <div class="modal-header">
        <h3><i class="fa fa-calendar-day" style="color:var(--primary);"></i> ${label}</h3>
        <button class="modal-close" onclick="closeKalModal()"><i class="fa fa-times"></i></button>
      </div>
      ${body}
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeKalModal()">Tutup</button>
      </div>
    `)
  }
}

function showModal(html) {
  let el = document.getElementById('kalModal')
  if (el) el.remove()
  const bg = document.createElement('div')
  bg.id = 'kalModal'; bg.className = 'modal-bg open'
  bg.innerHTML = `<div class="modal-box">${html}</div>`
  bg.addEventListener('click', e => { if(e.target===bg) closeKalModal() })
  document.body.appendChild(bg)
}
window.closeKalModal = () => { const m=document.getElementById('kalModal'); if(m) m.remove() }

function shiftShort(j) {
  if(j?.status_override==='cuti')  return 'CUTI'
  if(j?.status_override==='sakit') return 'SKT'
  if(j?.status_override==='izin')  return 'IZIN'
  if(j?.shift_code=='2') return 'PAG'
  if(j?.shift_code=='3') return 'SOR'
  if(j?.shift_code=='4') return 'MLM'
  if(j?.shift_code=='8') return 'OFF'
  return '-'
}
function shiftFull(j) {
  if(j?.status_override==='cuti')  return '🌴 Cuti'
  if(j?.status_override==='sakit') return '🤒 Sakit'
  if(j?.status_override==='izin')  return '📋 Izin'
  if(j?.shift_code=='2') return '🌅 Shift Pagi'
  if(j?.shift_code=='3') return '🌇 Shift Sore'
  if(j?.shift_code=='4') return '🌙 Shift Malam'
  if(j?.shift_code=='8') return '⚫ OFF'
  return '-'
}
function shiftJam(j) {
  if(j?.status_override) return '-'
  if(j?.shift_code=='2') return '07:00 - 15:00'
  if(j?.shift_code=='3') return '15:00 - 23:00'
  if(j?.shift_code=='4') return '23:00 - 07:00'
  return '-'
}
function shiftColor(j) {
  if(j?.status_override==='cuti')  return '#22c55e'
  if(j?.status_override==='sakit') return '#f59e0b'
  if(j?.status_override==='izin')  return '#3b82f6'
  if(j?.shift_code=='2') return '#3b82f6'
  if(j?.shift_code=='3') return '#f59e0b'
  if(j?.shift_code=='4') return '#6366f1'
  return '#94a3b8'
}
window.renderKalenderHR = renderKalenderHR
