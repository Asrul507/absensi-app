import { supabase } from './supabase.js'
import { updateUserPassword } from './auth.js'
import { hitungMasaKerja, formatMasaKerja, hitungJatahCuti, resetCutiKaryawan } from './cuti.js'

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('getProfile error:', error)
    return null
  }

  return data
}

export async function renderUsers() {
  const content  = document.getElementById('content')
  const viewerRole = window.currentUser.role

  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fa fa-users"></i> Manajemen Karyawan</h2>
      ${viewerRole !== 'staff' ? `
        <button class="btn-primary btn-sm" onclick="openFormTambah()">
          <i class="fa fa-plus"></i> Tambah Karyawan
        </button>
      ` : ''}
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button id="tabAktif" class="btn-primary btn-sm" onclick="switchTab('aktif')">
        <i class="fa fa-users"></i> Karyawan Aktif
      </button>
      ${viewerRole !== 'staff' ? `
        <button id="tabPending" class="btn-secondary btn-sm" onclick="switchTab('pending')">
          <i class="fa fa-hourglass-half"></i> Menunggu Daftar
        </button>
      ` : ''}
    </div>

    <div class="card fade-up" style="padding:14px 18px;margin-bottom:12px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="search-box" style="flex:2;min-width:180px;margin:0;">
          <i class="fa fa-search"></i>
          <input id="searchUser" placeholder="Cari nama atau email..." oninput="filterUsers()">
        </div>
        <select id="filterStatusUser" onchange="filterUsers()"
          style="flex:1;min-width:120px;padding:10px 12px;border:1.5px solid var(--border);
            border-radius:var(--r-md);font-size:.85rem;outline:none;font-family:inherit;background:var(--white);color:var(--text);">
          <option value="">Semua Status</option>
          <option value="Aktif">Aktif</option>
          <option value="Non-Aktif">Non-Aktif</option>
          <option value="Menunggu Verifikasi">Menunggu Verifikasi</option>
        </select>
      </div>
    </div>

    <div id="userListContainer" class="fade-up-1">
      <div class="card" style="text-align:center;padding:28px;">
        <i class="fa fa-spinner fa-spin" style="font-size:1.5rem;color:var(--primary);"></i>
      </div>
    </div>
  `

  const { data: users } = await supabase.from('profiles').select('*').order('nama_lengkap')
  const { data: pending } = await supabase.from('pending_profiles').select('*').eq('status','waiting').order('nama_lengkap')

  const tahunIni = new Date().getFullYear()
  const { data: cutiData } = await supabase.from('pengajuan').select('user_id, jumlah_hari')
    .eq('jenis','cuti').eq('status','approved').gte('tanggal_pengajuan',`${tahunIni}-01-01`)
  
  window._cutiMap = {}
  ;(cutiData||[]).forEach(c => { window._cutiMap[c.user_id] = (window._cutiMap[c.user_id]||0) + (parseInt(c.jumlah_hari)||0) })
  
  window._allUsers    = users    || []
  window._pendingList = pending  || []
  window._currentTab  = 'aktif'

  renderUserList(window._allUsers)

  window.switchTab = function(tab) {
    window._currentTab = tab
    document.getElementById('tabAktif').className   = tab==='aktif'   ? 'btn-primary btn-sm'   : 'btn-secondary btn-sm'
    const tabPending = document.getElementById('tabPending')
    if(tabPending) tabPending.className = tab==='pending' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'
    
    if (tab === 'aktif') renderUserList(window._allUsers)
    else renderPendingList(window._pendingList)
  }

  window.filterUsers = function() {
    const q  = document.getElementById('searchUser').value.toLowerCase()
    const st = document.getElementById('filterStatusUser').value
    if (window._currentTab === 'aktif') {
      renderUserList(window._allUsers.filter(u =>
        ((u.nama_lengkap||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)) &&
        (!st || u.status_akun === st)
      ))
    } else {
      renderPendingList(window._pendingList.filter(p =>
        (p.nama_lengkap||'').toLowerCase().includes(q)
      ))
    }
  }
}

function renderPendingList(list) {
  const el = document.getElementById('userListContainer')
  if (!el) return
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa fa-hourglass-half"></i><p>Tidak ada karyawan dalam daftar tunggu</p></div>`
    return
  }
  el.innerHTML = `
    <div class="alert info" style="margin-bottom:12px;">
      <i class="fa fa-info-circle"></i>
      <span>Karyawan berikut belum mendaftar. Minta mereka buka <strong>register.html</strong></span>
    </div>
    ${list.map(p => `
      <div class="user-item">
        <div class="user-avatar" style="background:linear-gradient(135deg,#64748b,#475569);">
          ${(p.nama_lengkap||'?')[0].toUpperCase()}
        </div>
        <div class="ui-info">
          <div class="ui-name">${p.nama_lengkap}</div>
          <div class="ui-email">${p.jabatan||'-'} ${p.departemen?'· '+p.departemen:''}</div>
          <div style="font-size:.72rem;color:var(--text-muted);margin-top:3px;">
            📅 ${p.tanggal_bergabung||'-'} · Role: ${p.role} · 📍 Jatah: ${p.titik_radius || 'Bebas'}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge badge-yellow"><i class="fa fa-hourglass-half"></i> Menunggu</span>
          <button class="action-btn delete" title="Hapus" onclick="deletePending('${p.id}','${p.nama_lengkap}')">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>`).join('')}
  `
}

window.deletePending = async function(id, nama) {
  if (!confirm(`Hapus data karyawan "${nama}" dari daftar tunggu?`)) return
  await supabase.from('pending_profiles').delete().eq('id', id)
  window._pendingList = window._pendingList.filter(p => p.id !== id)
  renderPendingList(window._pendingList)
}

window.toggleStatusUser = async function(userId, statusSekarang) {
  const statusBaru = statusSekarang === 'Aktif' ? 'Non-Aktif' : 'Aktif'
  if (!confirm(`${statusBaru==='Non-Aktif'?'Non-aktifkan':'Aktifkan kembali'} karyawan ini?`)) return
  await supabase.from('profiles').update({ status_akun: statusBaru }).eq('id', userId)
  if (statusBaru === 'Non-Aktif') {
    await resetCutiKaryawan(userId)
    alert('Karyawan di-non-aktifkan dan sisa cuti direset.')
  } else {
    alert('Karyawan berhasil diaktifkan.')
  }
  await renderUsers()
}

window.showUserModal = function(html) {
  let el = document.getElementById('userModal')
  if (el) el.remove()
  
  const bg = document.createElement('div')
  bg.id = 'userModal'
  bg.className = 'modal-bg open'
  bg.innerHTML = `<div class="modal-box">${html}</div>`
  
  bg.addEventListener('click', e => { 
    if(e.target === bg) window.closeUserModal() 
  })
  
  document.body.appendChild(bg)
}

window.closeUserModal = function() { 
  const modal = document.getElementById('userModal')
  if (modal) modal.remove() 
}

window.toggleSidebar = () => {
  document.getElementById('sidebar')?.classList.toggle('open')
  document.getElementById('overlay')?.classList.toggle('active')
}
window.closeSidebar = () => {
  document.getElementById('sidebar')?.classList.remove('open')
  document.getElementById('overlay')?.classList.remove('active')
}
document.addEventListener('keydown', e => { if(e.key==='Escape') closeSidebar() })

window.toggleTheme = function() {
  document.documentElement.classList.toggle('dark')
  const isDark = document.documentElement.classList.contains('dark')
  const icon   = document.getElementById('themeIcon')
  if (icon) icon.className = isDark ? 'fa fa-sun' : 'fa fa-moon'
  localStorage.setItem('theme', isDark ? 'dark' : 'light')
}
