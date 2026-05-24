import { supabase } from './supabase.js'

export async function renderJadwalManagement(user) {
  const content = document.getElementById('content')
  
  // FIX CRASH: Jika user tidak dikirim dari app.js, ambil otomatis dari variabel global session
  const currentUserObj = user || window.currentUser
  
  if (!currentUserObj) {
    content.innerHTML = `<div class="card"><p>Silakan login terlebih dahulu.</p></div>`
    return
  }

  const isAdmin = currentUserObj.role === 'admin' || currentUserObj.role === 'super_admin'

  // Buat opsi dropdown Bulan & Tahun dinamis
  const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  let monthOptions = months.map((m, idx) => `<option value="${idx+1}" ${idx === currentMonth ? 'selected' : ''}>${m}</option>`).join('')
  let yearOptions = `<option value="${currentYear-1}">${currentYear-1}</option>
                     <option value="${currentYear}" selected>${currentYear}</option>
                     <option value="${currentYear+1}">${currentYear+1}</option>`

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-calendar-alt"></i> Pengaturan Jadwal Kerja</h2>
    </div>

    <div class="card fade-up" style="padding: 16px; margin-bottom: 16px;">
      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
        <div class="field" style="margin-bottom:0; flex: 1; min-width: 140px;">
          <label style="font-size: .75rem; margin-bottom: 4px;">Pilih Bulan</label>
          <select id="selMonth" style="width:100%; padding:8px 10px; border-radius:var(--r-md); border:1.5px solid var(--border); font-size:.85rem;">
            ${monthOptions}
          </select>
        </div>
        <div class="field" style="margin-bottom:0; flex: 1; min-width: 100px;">
          <label style="font-size: .75rem; margin-bottom: 4px;">Pilih Tahun</label>
          <select id="selYear" style="width:100%; padding:8px 10px; border-radius:var(--r-md); border:1.5px solid var(--border); font-size:.85rem;">
            ${yearOptions}
          </select>
        </div>
        <button class="btn-primary" onclick="loadDaftarJadwalMaster()" style="padding: 9px 16px; font-size:.85rem;">
          <i class="fa fa-search"></i> Tampilkan
        </button>
      </div>

      ${isAdmin ? `
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1.5px dashed var(--border);">
          <label style="display:block; font-size:.8rem; font-weight:800; color:var(--text-muted); margin-bottom:8px;">
            <i class="fa fa-file-excel" style="color: #16a34a;"></i> UPLOAD JADWAL BULANAN MASSAL (EXCEL)
          </label>
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <input type="file" id="excelFile" accept=".xlsx, .xls" 
              style="font-size: .8rem; padding: 6px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--gray-50); max-width: 240px;">
            <button class="btn-success btn-sm" onclick="window.uploadJadwalExcel()" id="btnUploadExcel" style="padding: 8px 14px; cursor:pointer;">
              <i class="fa fa-upload"></i> Jalankan Bulk Import
            </button>
          </div>
          <p id="uploadStatusText" style="font-size: .75rem; margin-top: 6px; font-weight: 700; min-height: 16px;"></p>
        </div>
      ` : ''}
    </div>

    <div id="jadwalContainer" class="card fade-up-1" style="padding: 16px; overflow-x: auto;">
      <p style="color: var(--text-muted); font-size: .85rem; text-align: center; padding: 20px 0;">Silakan klik tombol Tampilkan untuk memuat data jadwal.</p>
    </div>
  `
}

window.loadDaftarJadwalMaster = async function() {
  const m = document.getElementById('selMonth').value
  const y = document.getElementById('selYear').value
  const container = document.getElementById('jadwalContainer')
  
  container.innerHTML = `<div style="text-align:center; padding:20px 0;"><i class="fa fa-spinner fa-spin" style="color:var(--primary);"></i><p style="font-size:.8rem; color:var(--text-muted); margin-top:6px;">Memuat data jadwal...</p></div>`
  
  try {
    const daysInMonth = new Date(y, m, 0).getDate()
    const startStr = `${y}-${String(m).padStart(2,'0')}-01`
    const endStr = `${y}-${String(m).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`

    const { data: profiles } = await supabase.from('profiles').select('id, nama_lengkap').order('nama_lengkap')
    const { data: jadwalData } = await supabase.from('jadwal').select('*').gte('tanggal', startStr).lte('tanggal', endStr)

    if(!profiles?.length) {
      container.innerHTML = `<p style="text-align:center; font-size:.85rem; color:var(--text-muted);">Tidak ada karyawan terdaftar.</p>`
      return
    }

    const jadwalMap = {}
    jadwalData?.forEach(j => {
      if (!jadwalMap[j.user_id]) jadwalMap[j.user_id] = {}
      jadwalMap[j.user_id][j.tanggal] = j.shift_code
    })

    const shiftLabels = { '2': 'Pagi', '3': 'Sore', '4': 'Malam', '8': 'OFF' }

    let tableHtml = `
      <table class="table-jadwal" style="width: 100%; border-collapse: collapse; font-size: .75rem; min-width: 900px;">
        <thead>
          <tr style="background: var(--gray-100); border-bottom: 2px solid var(--border);">
            <th style="padding: 10px; text-align: left; position: sticky; left: 0; background: var(--gray-100); z-index: 2; width: 140px;">Nama Karyawan</th>
            ${Array.from({ length: daysInMonth }, (_, i) => `<th style="padding: 6px; text-align: center; width: 35px;">${i + 1}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `

    profiles.forEach(p => {
      tableHtml += `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 10px; font-weight: 700; position: sticky; left: 0; background: #fff; box-shadow: 2px 0 5px rgba(0,0,0,0.03); z-index: 1;">${p.nama_lengkap}</td>
      `
      for (let d = 1; d <= daysInMonth; d++) {
        const currentTgl = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        const sCode = jadwalMap[p.id]?.[currentTgl] || '-'
        const label = shiftLabels[sCode] || sCode

        let bgCell = 'transparent', textCell = 'var(--text)'
        if (sCode === '2') { bgCell = '#e0f2fe'; textCell = '#0369a1' } 
        else if (sCode === '3') { bgCell = '#fef3c7'; textCell = '#b45309' } 
        else if (sCode === '4') { bgCell = '#e0e7ff'; textCell = '#4338ca' } 
        else if (sCode === '8') { bgCell = '#f1f5f9'; textCell = '#64748b' } 

        tableHtml += `<td style="padding: 6px; text-align: center; background: ${bgCell}; color: ${textCell}; font-weight: 700; border: 1px solid var(--border);">${label}</td>`
      }
      tableHtml += '</tr>'
    })

    tableHtml += '</tbody></table>'
    container.innerHTML = tableHtml

  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger); font-size:.82rem; text-align:center;">Gagal memuat tabel: ${err.message}</p>`
  }
}

window.uploadJadwalExcel = async function() {
  if (typeof XLSX === 'undefined') {
    alert('Library XLSX belum siap dimuat. Mohon tunggu sebentar.')
    return
  }

  const fileInput = document.getElementById('excelFile')
  const statusText = document.getElementById('uploadStatusText')
  const btn = document.getElementById('btnUploadExcel')
  
  const selectedMonth = document.getElementById('selMonth').value
  const selectedYear = document.getElementById('selYear').value

  if (!fileInput.files.length) {
    statusText.style.color = 'var(--danger)'
    statusText.textContent = '⚠ Mohon pilih file Excel terlebih dahulu.'
    return
  }

  statusText.style.color = 'var(--primary)'
  statusText.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Membaca file...'
  btn.disabled = true

  const file = fileInput.files[0]
  const reader = new FileReader()

  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (!jsonData || jsonData.length === 0) {
        throw new Error('File Excel kosong atau format tidak sesuai.')
      }

      const { data: users, error: errUser } = await supabase.from('profiles').select('id, nama_lengkap')
      if (errUser) throw errUser

      const userMap = {}
      users.forEach(u => {
        userMap[u.nama_lengkap.trim().toLowerCase()] = u.id
      })

      const bulkPayload = [] 
      const totalDays = new Date(selectedYear, selectedMonth, 0).getDate()

      jsonData.forEach((row, rowIndex) => {
        const excelName = row['nama'] || row['Nama']
        if (!excelName) return

        const matchedUserId = userMap[excelName.trim().toLowerCase()]
        if (!matchedUserId) return

        for (let d = 1; d <= totalDays; d++) {
          const shiftCodeVal = row[String(d)] || row[d]
          if (shiftCodeVal !== undefined && shiftCodeVal !== null) {
            const currentTanggalStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            bulkPayload.push({
              user_id: matchedUserId,
              tanggal: currentTanggalStr,
              shift_code: String(shiftCodeVal).trim()
            })
          }
        }
      })

      if (bulkPayload.length === 0) {
        throw new Error('Tidak ada baris data kecocokan karyawan yang valid.')
      }

      statusText.innerHTML = `<i class="fa fa-cloud-upload-alt"></i> Menunggah massal data ke Supabase...`

      const { error: upsertErr } = await supabase
        .from('jadwal')
        .upsert(bulkPayload, { onConflict: 'user_id,tanggal' })

      if (upsertErr) throw upsertErr

      statusText.style.color = 'var(--success)'
      statusText.innerHTML = `✅ Sukses mengunggah ${bulkPayload.length} jadwal secara instan.`
      fileInput.value = '' 

      await loadDaftarJadwalMaster()

    } catch (err) {
      statusText.style.color = 'var(--danger)'
      statusText.textContent = `❌ Gagal Import: ${err.message}`
    } finally {
      btn.disabled = false
    }
  }
  reader.readAsArrayBuffer(file)
}
