import { supabase } from './supabase.js'

export async function renderJadwalManagement(user) {
  const content = document.getElementById('content')
  
  // Ambil otomatis dari variabel global session jika user tidak dikirim dari app.js
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
    <style>
      .freeze-container {
        width: 100% !important;
        max-height: 450px !important;
        overflow: auto !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 8px !important;
        position: relative !important;
        background: #ffffff !important;
      }
      .freeze-table {
        width: 100% !important;
        border-collapse: separate !important;
        border-spacing: 0 !important;
        font-size: 0.75rem !important;
      }
      /* Kunci Baris Tanggal ke Atas */
      .freeze-table th {
        position: sticky !important;
        top: 0 !important;
        background: #f8fafc !important;
        z-index: 10 !important;
        border-bottom: 2px solid #cbd5e1 !important;
        border-right: 1px solid #e2e8f0 !important;
        padding: 12px 6px !important;
        font-weight: 800 !important;
        color: #475569 !important;
      }
      /* Kunci Kolom Nama ke Kiri */
      .freeze-table td.sticky-col {
        position: sticky !important;
        left: 0 !important;
        background: #ffffff !important;
        z-index: 20 !important;
        font-weight: 700 !important;
        border-right: 2px solid #cbd5e1 !important;
        border-bottom: 1px solid #e2e8f0 !important;
        padding: 12px 10px !important;
        white-space: nowrap !important;
        box-shadow: 3px 0 5px rgba(0,0,0,0.05) !important;
      }
      /* Kunci Persimpangan Pojok Kiri Atas (Nama Karyawan) agar tidak goyang */
      .freeze-table th.sticky-corner {
        position: sticky !important;
        left: 0 !important;
        top: 0 !important;
        background: #f1f5f9 !important;
        z-index: 30 !important;
        border-right: 2px solid #cbd5e1 !important;
        border-bottom: 2px solid #cbd5e1 !important;
        box-shadow: 3px 3px 0 rgba(0,0,0,0.05) !important;
      }
      .freeze-table td {
        padding: 12px 6px !important;
        text-align: center !important;
        border-bottom: 1px solid #e2e8f0 !important;
        border-right: 1px solid #e2e8f0 !important;
      }
    </style>

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

    <div id="jadwalContainer" style="width: 100%;">
      <div class="card" style="padding: 20px 0; text-align: center; color: var(--text-muted); font-size: .85rem;">
        Silakan klik tombol Tampilkan untuk memuat data jadwal.
      </div>
    </div>
  `
}

window.loadDaftarJadwalMaster = async function() {
  const m = document.getElementById('selMonth').value
  const y = document.getElementById('selYear').value
  const container = document.getElementById('jadwalContainer')
  
  container.innerHTML = `<div class="card" style="text-align:center; padding:30px 0;"><i class="fa fa-spinner fa-spin" style="color:var(--primary); font-size: 1.5rem;"></i><p style="font-size:.85rem; color:var(--text-muted); margin-top:10px;">Memuat data jadwal...</p></div>`
  
  try {
    const daysInMonth = new Date(y, m, 0).getDate()
    const startStr = `${y}-${String(m).padStart(2,'0')}-01`
    const


    
