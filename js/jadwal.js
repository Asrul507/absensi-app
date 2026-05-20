import { supabase } from './supabase.js'

function getShiftInfo(code) {
  if (code=='2') return { nama:'Shift Pagi',  jam:'07:00 - 15:00', color:'#3b82f6' }
  if (code=='3') return { nama:'Shift Sore',  jam:'15:00 - 23:00', color:'#f59e0b' }
  if (code=='4') return { nama:'Shift Malam', jam:'23:00 - 07:00', color:'#6366f1' }
  if (code=='8') return { nama:'OFF',          jam:'-',             color:'#94a3b8' }
  return { nama:'-', jam:'-', color:'#e2e8f0' }
}

function getOverrideInfo(status) {
  if (status==='cuti')  return { nama:'CUTI',  color:'#22c55e' }
  if (status==='sakit') return { nama:'SAKIT', color:'#f59e0b' }
  if (status==='izin')  return { nama:'IZIN',  color:'#3b82f6' }
  return null
}

/* ================= RENDER UTAMA ================= */
export async function renderJadwalManagement() {
  const content = document.getElementById('content')

  const { data: users } = await supabase
    .from('profiles')
    .select('id, nama_lengkap, jabatan, departemen')
    .eq('status_akun', 'Aktif')
    .order('nama_lengkap')

  const safeUsers = users || []

  // Hitung ringkasan shift bulan ini per user
  const today = new Date()
  const bulanStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

  const { data: jadwalBulanIni } = await supabase
    .from('jadwal')
    .select('user_id, shift_code, status_override, tanggal')
    .gte('tanggal', `${bulanStr}-01`)
    .lte('tanggal', `${bulanStr}-31`)

  // Mapping: user_id → jumlah shift hari ini
  const { data: jadwalHariIni } = await supabase
    .from('jadwal')
    .select('user_id, shift_code, status_override')
    .eq('tanggal', today.toISOString().split('T')[0])

  const shiftHariIni = {}
  ;(jadwalHariIni||[]).forEach(j => { shiftHariIni[j.user_id] = j })

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-calendar-days"></i> Jadwal Karyawan</h2>
      <button class="btn-primary btn-sm" onclick="openFormTambahJadwal()">
        <i class="fa fa-plus"></i> Tambah Jadwal
      </button>
    </div>

    <!-- Filter bulan -->
    <div class="card fade-up" style="padding:14px 18px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <label style="font-size:.78rem;font-weight:700;color:var(--text-muted);">Bulan</label>
        <input type="month" id="filterBulan" value="${bulanStr}"
          style="border:1.5px solid var(--border);border-radius:var(--r-md);padding:8px 12px;font-size:.85rem;outline:none;font-family:inherit;">
        <button class="btn-secondary btn-sm" onclick="refreshJadwalList()">
          <i class="fa fa-filter"></i> Tampilkan
        </button>
        <button class="btn-secondary btn-sm" onclick="openFormUploadExcel()">
          <i class="fa fa-upload"></i> Upload Excel
        </button>
      </div>
    </div>

    <!-- Daftar Karyawan -->
    <div id="userJadwalList" class="fade-up-1">
      ${safeUsers.map(u => {
        const shiftNow = shiftHariIni[u.id]
        let badgeText = 'Belum dijadwalkan'
        let badgeColor = '#94a3b8'

        if (shiftNow) {
          if (shiftNow.status_override) {
            const info = getOverrideInfo(shiftNow.status_override)
            badgeText  = info?.nama || shiftNow.status_override
            badgeColor = info?.color || '#94a3b8'
          } else {
            const info = getShiftInfo(shiftNow.shift_code)
            badgeText  = info.nama
            badgeColor = info.color
          }
        }

        return `
          <div class="user-item" onclick="openJadwalUser('${u.id}','${u.nama_lengkap}')"
            style="cursor:pointer;">
            <div class="user-avatar">${(u.nama_lengkap||'?')[0].toUpperCase()}</div>
            <div class="ui-info">
              <div class="ui-name">${u.nama_lengkap}</div>
              <div class="ui-email">${u.jabatan || '-'} ${u.departemen ? '· '+u.departemen : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:999px;color:#fff;background:${badgeColor};">
                ${badgeText}
              </span>
              <i class="fa fa-chevron-right" style="color:var(--gray-400);font-size:.75rem;"></i>
            </div>
          </div>
        `
      }).join('')}
      ${safeUsers.length === 0 ? `<div class="empty-state"><i class="fa fa-users"></i><p>Belum ada karyawan aktif</p></div>` : ''}
    </div>
  `

  // Window functions
  window.refreshJadwalList = renderJadwalManagement

  window.openFormTambahJadwal = function() {
    showModal(`
      <div class="modal-header">
        <h3><i class="fa fa-calendar-plus" style="color:var(--primary);"></i> Tambah Jadwal</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa fa-times"></i></button>
      </div>
      <div class="field">
        <label>Karyawan</label>
        <select id="mUserJadwal">
          ${safeUsers.map(u => `<option value="${u.id}">${u.nama_lengkap}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Tanggal</label>
        <input type="date" id="mTanggal" value="${today.toISOString().split('T')[0]}">
      </div>
      <div class="field">
        <label>Shift</label>
        <select id="mShift">
          <option value="2">Shift Pagi (07:00-15:00)</option>
          <option value="3">Shift Sore (15:00-23:00)</option>
          <option value="4">Shift Malam (23:00-07:00)</option>
          <option value="8">OFF</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal()">Batal</button>
        <button class="btn-primary" onclick="simpanJadwal()"><i class="fa fa-save"></i> Simpan</button>
      </div>
    `)
  }

  window.simpanJadwal = async function() {
    const user_id   = document.getElementById('mUserJadwal').value
    const tanggal   = document.getElementById('mTanggal').value
    const shift_code= document.getElementById('mShift').value
    if (!tanggal || !user_id) { alert('Lengkapi data'); return }

    const { data: existing } = await supabase.from('jadwal').select('id').eq('tanggal',tanggal).eq('user_id',user_id).maybeSingle()
    if (existing) {
      await supabase.from('jadwal').update({ shift_code, status_override: null }).eq('id', existing.id)
    } else {
      await supabase.from('jadwal').insert([{ tanggal, user_id, shift_code }])
    }
    closeModal()
    alert('✅ Jadwal disimpan')
    renderJadwalManagement()
  }

  window.openFormUploadExcel = function() {
    showModal(`
      <div class="modal-header">
        <h3><i class="fa fa-upload" style="color:var(--primary);"></i> Upload Jadwal Excel</h3>
        <button class="modal-close" onclick="closeModal()"><i class="fa fa-times"></i></button>
      </div>
      <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px;">
        Format Excel: kolom <b>nama</b>, lalu kolom <b>1-31</b> berisi kode shift (2=Pagi, 3=Sore, 4=Malam, 8=OFF)
      </p>
      <div class="field"><label>Bulan</label>
        <select id="mBulanUpload">
          ${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
            .map((b,i)=>`<option value="${String(i+1).padStart(2,'0')}">${b}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Tahun</label>
        <input type="number" id="mTahunUpload" value="${today.getFullYear()}">
      </div>
      <div class="field"><label>File Excel</label>
        <input type="file" id="mExcelFile" accept=".xlsx,.xls">
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal()">Batal</button>
        <button class="btn-primary" onclick="uploadJadwalExcel()"><i class="fa fa-upload"></i> Upload</button>
      </div>
    `)
  }
}

/* ================= POPUP JADWAL USER ================= */
window.openJadwalUser = async function(userId, namaUser) {
  const bulan = document.getElementById('filterBulan')?.value || new Date().toISOString().slice(0,7)

  showModal(`
    <div class="modal-header">
      <h3><i class="fa fa-calendar" style="color:var(--primary);"></i> ${namaUser}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fa fa-times"></i></button>
    </div>
    <p style="color:var(--text-muted);font-size:.8rem;margin-bottom:12px;">Jadwal bulan ${bulan}</p>
    <div id="jadwalUserContent"><i class="fa fa-spinner fa-spin"></i> Loading...</div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Tutup</button>
    </div>
  `)

  // Load jadwal user bulan ini
  const { data: jadwal } = await supabase
    .from('jadwal')
    .select('*')
    .eq('user_id', userId)
    .gte('tanggal', `${bulan}-01`)
    .lte('tanggal', `${bulan}-31`)
    .order('tanggal')

  const map = {}
  ;(jadwal||[]).forEach(j => { map[j.tanggal] = j })

  // Generate semua hari dalam bulan
  const [yr, mo] = bulan.split('-').map(Number)
  const daysInMonth = new Date(yr, mo, 0).getDate()

  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:8px;">'
  const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
  dayNames.forEach(d => { html += `<div style="font-size:.65rem;text-align:center;font-weight:700;color:var(--text-muted);">${d}</div>` })
  html += '</div>'

  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">'

  // Offset hari pertama
  const firstDay = new Date(yr, mo-1, 1).getDay()
  for (let i=0; i<firstDay; i++) html += '<div></div>'

  for (let d=1; d<=daysInMonth; d++) {
    const tgl = `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const j   = map[tgl]
    let bg='var(--gray-100)', label='', textColor='var(--text-muted)'

    if (j) {
      if (j.status_override) {
        const info = getOverrideInfo(j.status_override)
        bg = info?.color+'22' || '#eee'
        label = info?.nama?.slice(0,3) || j.status_override
        textColor = info?.color || 'var(--text)'
      } else if (j.shift_code) {
        const info = getShiftInfo(j.shift_code)
        bg = info.color+'22'
        label = info.nama==='OFF' ? 'OFF' : info.nama.replace('Shift ','').slice(0,4)
        textColor = info.color
      }
    }

    const isToday = tgl === new Date().toISOString().split('T')[0]
    html += `
      <div style="
        background:${bg};border-radius:6px;padding:4px 2px;text-align:center;
        ${isToday ? 'outline:2px solid var(--primary);' : ''}
      ">
        <div style="font-size:.7rem;font-weight:700;color:var(--text-muted);">${d}</div>
        <div style="font-size:.6rem;font-weight:800;color:${textColor};">${label}</div>
      </div>
    `
  }
  html += '</div>'

  // Legenda
  html += `
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;font-size:.72rem;">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#3b82f622;border:1px solid #3b82f6;margin-right:3px;"></span>Pagi</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f59e0b22;border:1px solid #f59e0b;margin-right:3px;"></span>Sore</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#6366f122;border:1px solid #6366f1;margin-right:3px;"></span>Malam</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#22c55e22;border:1px solid #22c55e;margin-right:3px;"></span>Cuti</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#94a3b822;border:1px solid #94a3b8;margin-right:3px;"></span>OFF</span>
    </div>
  `

  const el = document.getElementById('jadwalUserContent')
  if (el) el.innerHTML = html
}

/* ================= UPLOAD EXCEL ================= */
window.uploadJadwalExcel = async function() {
  const file  = document.getElementById('mExcelFile')?.files[0]
  const bulan = document.getElementById('mBulanUpload')?.value
  const tahun = document.getElementById('mTahunUpload')?.value
  if (!file) { alert('Pilih file Excel'); return }

  const reader = new FileReader()
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result)
    const wb   = XLSX.read(data, { type:'array' })
    const sheet= wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(sheet)

    let berhasil = 0, gagal = 0
    for (const row of json) {
      const nama = row.nama
      if (!nama) continue
      const { data: user } = await supabase.from('profiles').select('id').eq('nama_lengkap', nama).maybeSingle()
      if (!user) { gagal++; continue }
      for (const key in row) {
        if (key === 'nama') continue
        const shift_code = String(row[key]||'').trim()
        if (!shift_code) continue
        const tanggal = `${tahun}-${bulan}-${String(key).padStart(2,'0')}`
        const { data: existing } = await supabase.from('jadwal').select('id').eq('tanggal',tanggal).eq('user_id',user.id).maybeSingle()
        if (existing) {
          await supabase.from('jadwal').update({ shift_code }).eq('id', existing.id)
        } else {
          await supabase.from('jadwal').insert([{ tanggal, user_id:user.id, shift_code }])
        }
        berhasil++
      }
    }
    closeModal()
    alert(`✅ Upload selesai: ${berhasil} jadwal diproses${gagal ? `, ${gagal} user tidak ditemukan` : ''}`)
    renderJadwalManagement()
  }
  reader.readAsArrayBuffer(file)
}

/* ================= MODAL HELPER ================= */
function showModal(html) {
  let existing = document.getElementById('globalModal')
  if (existing) existing.remove()
  const bg = document.createElement('div')
  bg.id = 'globalModal'
  bg.className = 'modal-bg open'
  bg.innerHTML = `<div class="modal-box">${html}</div>`
  bg.addEventListener('click', e => { if (e.target === bg) closeModal() })
  document.body.appendChild(bg)
}
window.closeModal = function() {
  const m = document.getElementById('globalModal')
  if (m) m.remove()
}
