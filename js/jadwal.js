import { supabase } from './supabase.js'
import { showToast } from './feedback.js'

/* ===============================================================
   DEFINISI SHIFT — sumber kebenaran tunggal untuk seluruh file
=============================================================== */
const SHIFT_INFO = {
  '2': { label: 'Pagi',   jam: '07:00 – 15:00', bg: '#e0f2fe', color: '#0369a1', badge: '#0ea5e9' },
  '3': { label: 'Sore',   jam: '15:00 – 23:00', bg: '#fef3c7', color: '#b45309', badge: '#f59e0b' },
  '4': { label: 'Malam',  jam: '23:00 – 07:00', bg: '#e0e7ff', color: '#4338ca', badge: '#6366f1' },
  '8': { label: 'OFF',    jam: 'Libur / Tidak Bekerja', bg: '#f1f5f9', color: '#64748b', badge: '#94a3b8' },
}

function shiftBadgeHtml(code) {
  const s = SHIFT_INFO[code]
  if (!s) return `<span style="color:var(--text-muted);">-</span>`
  return `<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-weight:800;font-size:.7rem;background:${s.bg};color:${s.color};">${s.label}</span>`
}

export async function renderJadwalManagement(user) {
  const content = document.getElementById('content')
  const currentUserObj = user || window.currentUser
  
  if (!currentUserObj) {
    content.innerHTML = `<div class="card"><p>Silakan login terlebih dahulu.</p></div>`
    return
  }

  const isAdmin = currentUserObj.role === 'admin' || currentUserObj.role === 'super_admin'

  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  let monthOptions = months.map((m, idx) => `<option value="${idx+1}" ${idx === currentMonth ? 'selected' : ''}>${m}</option>`).join('')
  let yearOptions = `<option value="${currentYear-1}">${currentYear-1}</option>
                     <option value="${currentYear}" selected>${currentYear}</option>
                     <option value="${currentYear+1}">${currentYear+1}</option>`

  content.innerHTML = `
    <style>
      .schedule-split-wrapper {
        display: flex;
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        overflow: hidden;
        background: #ffffff;
      }
      .left-name-side {
        width: 140px;
        min-width: 140px;
        flex-shrink: 0;
        background: #f8fafc;
        border-right: 2px solid #cbd5e1;
        box-shadow: 3px 0 5px rgba(0,0,0,0.05);
      }
      .right-data-side {
        flex-grow: 1;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .table-split {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.75rem;
      }
      .table-split th, .table-split td {
        box-sizing: border-box;
        border-bottom: 1px solid #e2e8f0;
        border-right: 1px solid #e2e8f0;
        text-align: center;
      }
      .table-split th {
        background: #f1f5f9;
        font-weight: 800;
        color: #475569;
        padding: 12px 4px;
        height: 43px;
      }
      .table-split td {
        padding: 12px 4px;
        height: 43px;
        font-weight: 700;
      }
      .name-cell-fixed {
        padding: 12px 8px;
        font-weight: 700;
        font-size: 0.75rem;
        color: #1e293b;
        border-bottom: 1px solid #e2e8f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        height: 43px;
        display: flex;
        align-items: center;
      }
      .header-corner-fixed {
        padding: 12px 8px;
        font-weight: 800;
        font-size: 0.75rem;
        color: #475569;
        background: #f1f5f9;
        border-bottom: 2px solid #cbd5e1;
        height: 43px;
        display: flex;
        align-items: center;
      }
      .jadwal-mode-toggle {
        display: flex;
        gap: 0;
        background: var(--gray-50);
        border: 1.5px solid var(--border);
        border-radius: var(--r-md);
        padding: 3px;
        width: fit-content;
      }
      .jadwal-mode-btn {
        padding: 7px 16px;
        border: none;
        border-radius: calc(var(--r-md) - 2px);
        font-size: .82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all .15s;
        background: transparent;
        color: var(--text-muted);
      }
      .jadwal-mode-btn.active {
        background: var(--primary);
        color: #fff;
        box-shadow: 0 2px 6px rgba(37,99,235,.3);
      }
    </style>

    <div class="page-header">
      <h2><i class="fa fa-calendar-alt"></i> Pengaturan Jadwal Kerja</h2>
    </div>

    <!-- Legenda Kode Shift -->
    <div class="card fade-up" style="padding:14px 18px; margin-bottom:14px;">
      <div style="font-size:.78rem; font-weight:800; color:var(--text-muted); margin-bottom:10px; letter-spacing:.04em;">
        <i class="fa fa-info-circle" style="color:var(--primary);"></i> KETERANGAN KODE SHIFT
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        ${Object.entries(SHIFT_INFO).map(([code, s]) => `
          <div style="display:flex;align-items:center;gap:8px;background:${s.bg};border:1px solid ${s.badge}44;border-radius:8px;padding:8px 14px;">
            <span style="background:${s.badge};color:#fff;border-radius:5px;padding:2px 10px;font-weight:800;font-size:.8rem;min-width:36px;text-align:center;">${code}</span>
            <div>
              <div style="font-weight:700;font-size:.82rem;color:${s.color};">${s.label}</div>
              <div style="font-size:.7rem;color:var(--text-muted);">${s.jam}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Toggle Mode Input -->
    ${isAdmin ? `
    <div class="card fade-up" style="padding:16px 18px; margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
        <div>
          <div style="font-size:.78rem; font-weight:800; color:var(--text-muted); margin-bottom:6px; letter-spacing:.04em;">CARA INPUT JADWAL</div>
          <div class="jadwal-mode-toggle">
            <button class="jadwal-mode-btn active" id="btnModeSatu" onclick="window.switchJadwalMode('satu')">
              <i class="fa fa-user-edit"></i> Input Satu Per Satu
            </button>
            <button class="jadwal-mode-btn" id="btnModeUpload" onclick="window.switchJadwalMode('upload')">
              <i class="fa fa-file-excel" style="color:#16a34a;"></i> Upload Excel (Massal)
            </button>
          </div>
        </div>
      </div>

      <!-- Panel: Input Satu Per Satu -->
      <div id="panelInputSatu" style="display:block;">
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:10px; align-items:flex-end; flex-wrap:wrap;">
          <div class="field" style="margin-bottom:0;">
            <label style="font-size:.75rem; margin-bottom:4px;">Pilih Karyawan</label>
            <select id="inputJadwalUser" style="width:100%;padding:9px 10px;border-radius:var(--r-md);border:1.5px solid var(--border);font-size:.83rem;">
              <option value="">-- Pilih Karyawan --</option>
            </select>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label style="font-size:.75rem; margin-bottom:4px;">Tanggal</label>
            <input type="date" id="inputJadwalTanggal" style="width:100%;padding:9px 10px;border-radius:var(--r-md);border:1.5px solid var(--border);font-size:.83rem;box-sizing:border-box;">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label style="font-size:.75rem; margin-bottom:4px;">Kode Shift</label>
            <select id="inputJadwalShift" style="width:100%;padding:9px 10px;border-radius:var(--r-md);border:1.5px solid var(--border);font-size:.83rem;" onchange="window.updateShiftPreview()">
              ${Object.entries(SHIFT_INFO).map(([code, s]) => `<option value="${code}">${code} — ${s.label} (${s.jam})</option>`).join('')}
            </select>
          </div>
          <button class="btn-primary" onclick="window.simpanJadwalSatu()" style="padding:9px 16px;font-size:.83rem;white-space:nowrap;">
            <i class="fa fa-save"></i> Simpan
          </button>
        </div>
        <div id="shiftPreviewInfo" style="margin-top:10px;"></div>
        <p id="statusInputSatu" style="font-size:.75rem; margin-top:8px; font-weight:700; min-height:16px;"></p>
      </div>

      <!-- Panel: Upload Excel -->
      <div id="panelInputUpload" style="display:none;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <input type="file" id="excelFile" accept=".xlsx, .xls"
            style="font-size:.8rem;padding:6px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--gray-50);max-width:260px;">
          <button class="btn-success btn-sm" onclick="window.uploadJadwalExcel()" id="btnUploadExcel" style="padding:8px 14px;cursor:pointer;">
            <i class="fa fa-upload"></i> Jalankan Bulk Import
          </button>
          <button class="btn-secondary btn-sm" onclick="window.downloadTemplateJadwal()" style="padding:8px 14px;">
            <i class="fa fa-file-excel" style="color:#16a34a;"></i> Download Template
          </button>
        </div>
        <p id="uploadStatusText" style="font-size:.75rem;margin-top:8px;font-weight:700;min-height:16px;"></p>
        <div style="font-size:.73rem;color:var(--text-muted);margin-top:4px;">
          <i class="fa fa-info-circle"></i> Format kolom Excel: <strong>nama</strong> (nama lengkap), lalu kolom tanggal berupa angka <strong>1, 2, 3, … 31</strong> diisi kode shift (<strong>2</strong>=Pagi, <strong>3</strong>=Sore, <strong>4</strong>=Malam, <strong>8</strong>=OFF)
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Tabel Tampilan Jadwal Bulanan -->
    <div class="card fade-up" style="padding:16px; margin-bottom:16px;">
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
        <div class="field" style="margin-bottom:0; flex:1; min-width:140px;">
          <label style="font-size:.75rem; margin-bottom:4px;">Pilih Bulan</label>
          <select id="selMonth" style="width:100%;padding:8px 10px;border-radius:var(--r-md);border:1.5px solid var(--border);font-size:.85rem;">
            ${monthOptions}
          </select>
        </div>
        <div class="field" style="margin-bottom:0; flex:1; min-width:100px;">
          <label style="font-size:.75rem; margin-bottom:4px;">Pilih Tahun</label>
          <select id="selYear" style="width:100%;padding:8px 10px;border-radius:var(--r-md);border:1.5px solid var(--border);font-size:.85rem;">
            ${yearOptions}
          </select>
        </div>
        <button class="btn-primary" onclick="loadDaftarJadwalMaster()" style="padding:9px 16px;font-size:.85rem;">
          <i class="fa fa-search"></i> Tampilkan
        </button>
      </div>
    </div>

    <div id="jadwalContainer" style="width:100%;">
      <div class="card" style="padding:20px 0;text-align:center;color:var(--text-muted);font-size:.85rem;">
        Silakan klik tombol Tampilkan untuk memuat data jadwal.
      </div>
    </div>
  `

  // Isi dropdown karyawan untuk input satu per satu
  if (isAdmin) {
    try {
      const { data: profiles } = await supabase.from('profiles').select('id, nama_lengkap').order('nama_lengkap')
      const sel = document.getElementById('inputJadwalUser')
      if (sel && profiles?.length) {
        profiles.forEach(p => {
          const opt = document.createElement('option')
          opt.value = p.id
          opt.textContent = p.nama_lengkap
          sel.appendChild(opt)
        })
      }
    } catch(e) { /* ignore */ }

    // Set tanggal default = hari ini
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    const tglInput = document.getElementById('inputJadwalTanggal')
    if (tglInput) tglInput.value = todayStr

    window.updateShiftPreview()
  }
}

/* ===============================================================
   SWITCH MODE: Satu Per Satu vs Upload Excel
=============================================================== */
window.switchJadwalMode = function(mode) {
  const btnSatu   = document.getElementById('btnModeSatu')
  const btnUpload = document.getElementById('btnModeUpload')
  const panelSatu   = document.getElementById('panelInputSatu')
  const panelUpload = document.getElementById('panelInputUpload')
  if (!btnSatu || !panelSatu) return

  if (mode === 'satu') {
    btnSatu.classList.add('active')
    btnUpload?.classList.remove('active')
    panelSatu.style.display = 'block'
    if (panelUpload) panelUpload.style.display = 'none'
  } else {
    btnUpload?.classList.add('active')
    btnSatu.classList.remove('active')
    panelSatu.style.display = 'none'
    if (panelUpload) panelUpload.style.display = 'block'
  }
}

/* ===============================================================
   UPDATE PREVIEW INFO SHIFT (saat dropdown shift diganti)
=============================================================== */
window.updateShiftPreview = function() {
  const sel = document.getElementById('inputJadwalShift')
  const box = document.getElementById('shiftPreviewInfo')
  if (!sel || !box) return
  const code = sel.value
  const s = SHIFT_INFO[code]
  if (!s) { box.innerHTML = ''; return }
  box.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:10px;background:${s.bg};border:1px solid ${s.badge}44;border-radius:8px;padding:8px 14px;">
      <span style="background:${s.badge};color:#fff;border-radius:5px;padding:2px 10px;font-weight:800;font-size:.8rem;">${code}</span>
      <span style="font-weight:700;font-size:.83rem;color:${s.color};">${s.label}</span>
      <span style="font-size:.75rem;color:var(--text-muted);">${s.jam}</span>
    </div>`
}

/* ===============================================================
   INPUT JADWAL SATU PER SATU
=============================================================== */
window.simpanJadwalSatu = async function() {
  const userId   = document.getElementById('inputJadwalUser')?.value
  const tanggal  = document.getElementById('inputJadwalTanggal')?.value
  const shiftCode = document.getElementById('inputJadwalShift')?.value
  const statusEl = document.getElementById('statusInputSatu')

  if (statusEl) { statusEl.textContent = ''; statusEl.style.color = 'var(--text-muted)' }

  if (!userId) {
    if (statusEl) { statusEl.style.color = 'var(--danger)'; statusEl.textContent = '⚠ Pilih karyawan terlebih dahulu.' }
    return
  }
  if (!tanggal) {
    if (statusEl) { statusEl.style.color = 'var(--danger)'; statusEl.textContent = '⚠ Pilih tanggal terlebih dahulu.' }
    return
  }

  const payload = { user_id: userId, tanggal, shift_code: shiftCode }

  const { error } = await supabase
    .from('jadwal')
    .upsert(payload, { onConflict: 'user_id,tanggal' })

  if (error) {
    if (statusEl) { statusEl.style.color = 'var(--danger)'; statusEl.textContent = '❌ Gagal simpan: ' + error.message }
    return
  }

  const s = SHIFT_INFO[shiftCode]
  if (statusEl) {
    statusEl.style.color = 'var(--success)'
    statusEl.textContent = `✅ Jadwal berhasil disimpan: ${document.getElementById('inputJadwalUser').options[document.getElementById('inputJadwalUser').selectedIndex].text} — ${tanggal} — Shift ${s?.label || shiftCode} (${s?.jam || ''})`
  }

  // Refresh tabel jika sudah ditampilkan
  if (document.getElementById('jadwalContainer')?.querySelector('.schedule-split-wrapper')) {
    await loadDaftarJadwalMaster()
  }
}

/* ===============================================================
   DOWNLOAD TEMPLATE EXCEL JADWAL
=============================================================== */
window.downloadTemplateJadwal = function() {
  if (typeof XLSX === 'undefined') { showToast('Library XLSX belum siap.', 'warning'); return }

  const now = new Date()
  const bln = now.getMonth() + 1
  const thn = now.getFullYear()

  // Header: bulan | tahun | nama | 1 | 2 | ... | 31
  const header  = ['bulan', 'tahun', 'nama', ...Array.from({length:31}, (_,i) => i+1)]
  const contoh1 = [bln, thn, 'Budi Santoso', ...Array.from({length:31}, (_,i) => i%3===0 ? '8' : i%3===1 ? '2' : '3')]
  const contoh2 = [bln, thn, 'Siti Rahayu',  ...Array.from({length:31}, (_,i) => i%2===0 ? '3' : '4')]

  const ws = XLSX.utils.aoa_to_sheet([header, contoh1, contoh2])

  // Styling: freeze 3 kolom pertama, lebar kolom bulan/tahun lebih kecil
  ws['!cols'] = [
    { wch: 7 },  // bulan
    { wch: 7 },  // tahun
    { wch: 22 }, // nama
    ...Array.from({length:31}, () => ({ wch: 5 })) // tanggal 1-31
  ]
  ws['!freeze'] = { xSplit: 3, ySplit: 1 } // freeze header + 3 kolom kiri

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Jadwal')
  XLSX.writeFile(wb, `template_jadwal_${thn}-${String(bln).padStart(2,'0')}.xlsx`)
}

/* ===============================================================
   LOAD TABEL JADWAL BULANAN
=============================================================== */
window.loadDaftarJadwalMaster = async function() {
  const m = document.getElementById('selMonth').value
  const y = document.getElementById('selYear').value
  const container = document.getElementById('jadwalContainer')
  
  container.innerHTML = `<div class="card" style="text-align:center;padding:30px 0;"><i class="fa fa-spinner fa-spin" style="color:var(--primary);font-size:1.5rem;"></i><p style="font-size:.85rem;color:var(--text-muted);margin-top:10px;">Memuat data jadwal...</p></div>`
  
  try {
    const daysInMonth = new Date(y, m, 0).getDate()
    const startStr = `${y}-${String(m).padStart(2,'0')}-01`
    const endStr   = `${y}-${String(m).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`

    const { data: profiles } = await supabase.from('profiles').select('id, nama_lengkap').order('nama_lengkap')
    const { data: jadwalData } = await supabase.from('jadwal').select('*').gte('tanggal', startStr).lte('tanggal', endStr)

    if (!profiles?.length) {
      container.innerHTML = `<div class="card" style="padding:20px;text-align:center;font-size:.85rem;color:var(--text-muted);">Tidak ada karyawan terdaftar.</div>`
      return
    }

    const jadwalMap = {}
    jadwalData?.forEach(j => {
      if (!jadwalMap[j.user_id]) jadwalMap[j.user_id] = {}
      jadwalMap[j.user_id][j.tanggal] = j.shift_code
    })

    const COL_W = 52

    let leftHtml = `<div class="left-name-side"><div class="header-corner-fixed">Nama Karyawan</div>`
    let rightHtml = `<div class="right-data-side"><table class="table-split" style="min-width:${daysInMonth*COL_W}px;"><thead><tr>`

    for (let i = 1; i <= daysInMonth; i++) {
      rightHtml += `<th style="width:${COL_W}px;min-width:${COL_W}px;">${i}</th>`
    }
    rightHtml += `</tr></thead><tbody>`

    profiles.forEach(p => {
      leftHtml += `<div class="name-cell-fixed">${p.nama_lengkap}</div>`
      rightHtml += `<tr>`
      for (let d = 1; d <= daysInMonth; d++) {
        const currentTgl = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        const sCode = jadwalMap[p.id]?.[currentTgl] || null
        const s     = sCode ? SHIFT_INFO[sCode] : null
        const bgCell   = s ? s.bg    : 'transparent'
        const textCell = s ? s.color : '#cbd5e1'
        const label    = s ? s.label : '·'
        rightHtml += `<td style="background:${bgCell}!important;color:${textCell}!important;width:${COL_W}px;min-width:${COL_W}px;font-size:.68rem;" title="${s ? sCode + ' · ' + s.label + ' · ' + s.jam : 'Belum dijadwalkan'}">${label}</td>`
      }
      rightHtml += `</tr>`
    })

    leftHtml  += `</div>`
    rightHtml += `</tbody></table></div>`

    container.innerHTML = `<div class="schedule-split-wrapper">${leftHtml}${rightHtml}</div>`

  } catch(err) {
    container.innerHTML = `<div class="card" style="color:var(--danger);font-size:.85rem;text-align:center;padding:20px;">Gagal memuat tabel: ${err.message}</div>`
  }
}

/* ===============================================================
   UPLOAD JADWAL MASSAL VIA EXCEL (format lama dipertahankan)
=============================================================== */
window.uploadJadwalExcel = async function() {
  if (typeof XLSX === 'undefined') {
    showToast('Library XLSX belum siap dimuat. Mohon tunggu sebentar.', 'warning')
    return
  }

  const fileInput  = document.getElementById('excelFile')
  const statusText = document.getElementById('uploadStatusText')
  const btn        = document.getElementById('btnUploadExcel')
  
  if (!fileInput.files.length) {
    if (statusText) { statusText.style.color = 'var(--danger)'; statusText.textContent = '⚠ Mohon pilih file Excel terlebih dahulu.' }
    return
  }

  if (statusText) { statusText.style.color = 'var(--primary)'; statusText.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Membaca file...' }
  if (btn) btn.disabled = true

  const file   = fileInput.files[0]
  const reader = new FileReader()

  reader.onload = async function(e) {
    try {
      const data      = new Uint8Array(e.target.result)
      const workbook  = XLSX.read(data, { type: 'array' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData  = XLSX.utils.sheet_to_json(worksheet)

      if (!jsonData?.length) throw new Error('File Excel kosong atau format tidak sesuai.')

      // ── Baca bulan & tahun dari file (baris pertama data)
      // Kolom baru: bulan | tahun | nama | 1..31
      // Fallback ke dropdown jika file pakai format lama (tanpa kolom bulan/tahun)
      const firstRow    = jsonData[0]
      const hasNewFmt   = (firstRow['bulan'] || firstRow['Bulan']) && (firstRow['tahun'] || firstRow['Tahun'])
      const selMonth    = document.getElementById('selMonth')?.value
      const selYear     = document.getElementById('selYear')?.value

      // Kelompokkan baris per bulan-tahun (file bisa berisi multi-bulan sekaligus)
      // Setiap baris punya bulan & tahun sendiri → fleksibel
      const { data: users, error: errUser } = await supabase.from('profiles').select('id, nama_lengkap')
      if (errUser) throw errUser

      const userMap = {}
      users.forEach(u => { userMap[u.nama_lengkap.trim().toLowerCase()] = u.id })

      const bulkPayload = []
      const bulanList   = new Set() // untuk log info bulan yang diproses

      jsonData.forEach(row => {
        const excelName = row['nama'] || row['Nama']
        if (!excelName) return
        const matchedUserId = userMap[excelName.trim().toLowerCase()]
        if (!matchedUserId) return

        // Tentukan bulan & tahun baris ini
        const rowBulan = parseInt(row['bulan'] || row['Bulan'] || selMonth || 0)
        const rowTahun = parseInt(row['tahun'] || row['Tahun'] || selYear  || 0)

        if (!rowBulan || !rowTahun) return // skip baris tanpa info bulan/tahun

        const totalDays = new Date(rowTahun, rowBulan, 0).getDate()
        bulanList.add(`${rowTahun}-${String(rowBulan).padStart(2,'0')}`)

        for (let d = 1; d <= totalDays; d++) {
          const shiftCodeVal = row[String(d)] !== undefined ? row[String(d)] : row[d]
          if (shiftCodeVal === undefined || shiftCodeVal === null || shiftCodeVal === '') continue
          const tanggalStr = `${rowTahun}-${String(rowBulan).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          bulkPayload.push({ user_id: matchedUserId, tanggal: tanggalStr, shift_code: String(shiftCodeVal).trim() })
        }
      })

      if (!bulkPayload.length) throw new Error('Tidak ada baris valid. Pastikan kolom bulan, tahun, dan nama terisi, serta nama karyawan sesuai data di sistem.')

      const bulanInfo = [...bulanList].join(', ')
      if (statusText) statusText.innerHTML = `<i class="fa fa-cloud-upload-alt"></i> Mengunggah ${bulkPayload.length} jadwal untuk periode ${bulanInfo}...`

      const { error: upsertErr } = await supabase.from('jadwal').upsert(bulkPayload, { onConflict: 'user_id,tanggal' })
      if (upsertErr) throw upsertErr

      if (statusText) {
        statusText.style.color = 'var(--success)'
        statusText.innerHTML = `✅ Sukses! ${bulkPayload.length} jadwal tersimpan untuk periode: <strong>${bulanInfo}</strong>`
      }
      fileInput.value = ''

      // Sync tampilan tabel ke bulan pertama yang diupload
      const [thn, bln] = [...bulanList][0].split('-')
      const selMonthEl = document.getElementById('selMonth')
      const selYearEl  = document.getElementById('selYear')
      if (selMonthEl) selMonthEl.value = parseInt(bln)
      if (selYearEl)  selYearEl.value  = thn
      await loadDaftarJadwalMaster()

    } catch(err) {
      if (statusText) { statusText.style.color = 'var(--danger)'; statusText.textContent = `❌ Gagal Import: ${err.message}` }
    } finally {
      if (btn) btn.disabled = false
    }
  }
  reader.readAsArrayBuffer(file)
}
