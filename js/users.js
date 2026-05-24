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

  // ====================================================================
  // AUDIT AMAN: MENCEGAH MODAL MACET JIKA QUERY DATABASE ERROR
  // ====================================================================
  window.openFormTambah = async function() {
    let opsiLokasi = ''
    try {
      const { data: lokAsiList, error } = await supabase.from('lokasi_absen').select('*')
      if (!error && lokAsiList) {
        opsiLokasi = lokAsiList.map(l => {
          // Fallback cerdas jika nama kolomnya bukan 'nama_titik'
          const namaTitik = l.nama_titik || l.nama_lokasi || l.nama || '';
          return `<option value="${namaTitik}">${namaTitik}</option>`
        }).join('')
      }
    } catch (e) {
      console.error("Gagal memuat list lokasi absen:", e)
    }

    const currentViewerRole = window.currentUser?.role || 'admin'

    window.showUserModal(`
      <div class="modal-header">
        <h3><i class="fa fa-user-plus" style="color:var(--primary);"></i> Tambah Data Karyawan</h3>
        <button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:10px;">
        <div class="field full" style="grid-column:1/-1;">
          <label>Nama Lengkap <span class="req">*</span></label>
          <input id="pNama" placeholder="Nama lengkap karyawan">
        </div>
        <div class="field"><label>Jabatan</label><input id="pJabatan" placeholder="Jabatan"></div>
        <div class="field"><label>Departemen</label><input id="pDept" placeholder="Departemen"></div>
        <div class="field"><label>No. HP</label><input id="pHp" placeholder="08xx"></div>
        <div class="field"><label>Tanggal Bergabung</label><input type="date" id="pTgl" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="field"><label>Tanggal Lahir</label><input type="date" id="pLahir"></div>
        <div class="field"><label>Role</label>
          <select id="pRole">
            <option value="staff">Staff</option>
            ${currentViewerRole === 'super_admin' ? `<option value="admin">Admin</option><option value="super_admin">Super Admin</option>` : ''}
          </select>
        </div>
        <div class="field">
          <label>Jatah Titik Radius</label>
          <select id="pTitikRadius" style="width:100%; padding:10px; border-radius:var(--r-md); border:1.5px solid var(--border); font-size:.85rem; font-weight:700; background:#fff; color:#000;">
            <option value="">-- Bebas Radius --</option>
            ${opsiLokasi}
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="window.closeUserModal()">Batal</button>
        <button class="btn-primary" onclick="savePendingKaryawan()"><i class="fa fa-save"></i> Simpan Data</button>
      </div>
    `)
  }

  window.savePendingKaryawan = async function() {
    const nama = document.getElementById('pNama').value.trim()
    if (!nama) { alert('Nama wajib diisi'); return }

    const { error } = await supabase.from('pending_profiles').insert([{
      nama_lengkap:      nama,
      jabatan:           document.getElementById('pJabatan').value.trim(),
      departemen:        document.getElementById('pDept').value.trim(),
      no_hp:             document.getElementById('pHp').value.trim(),
      tanggal_bergabung: document.getElementById('pTgl').value || null,
      tanggal_lahir:     document.getElementById('pLahir').value || null,
      role:              document.getElementById('pRole').value,
      titik_radius:      document.getElementById('pTitikRadius').value || null,
      created_by:        window.currentUser.id,
    }])

    if (error) { alert('Gagal simpan ke pending_profiles: ' + error.message); return }
    window.closeUserModal()
    alert(`✅ Data ${nama} disimpan ke daftar tunggu!`)
    await renderUsers()
  }
}

function renderUserList(users) {
  const el = document.getElementById('userListContainer')
  if (!el) return
  if (!users.length) {
    el.innerHTML = `<div class="empty-state"><i class="fa fa-users"></i><p>Tidak ada karyawan</p></div>`
    return
  }
  
  const me = window.currentUser

  el.innerHTML = users.map(u => {
    const masaKerja = hitungMasaKerja(u.tanggal_bergabung)
    const isAktif   = u.status_akun !== 'Non-Aktif'

    let bisaEdit = false
    if (me.role === 'super_admin') {
      bisaEdit = true
    } else if (me.role === 'admin') {
      if (u.role === 'staff' || u.id === me.id) bisaEdit = true
    } else if (me.role === 'staff') {
      if (u.id === me.id) bisaEdit = true
    }

    const avatarHtml = u.foto_url
      ? `<img src="${u.foto_url}" style="width:40px;height:40px;border-radius:var(--r-md);object-fit:cover;flex-shrink:0;">`
      : `<div class="user-avatar" style="${!isAktif?'background:var(--gray-300);':''}">${(u.nama_lengkap||'?')[0].toUpperCase()}</div>`

    return `
      <div class="user-item" style="cursor: pointer;">
        <div style="display: flex; gap: 12px; flex: 1;" onclick="window.openDetailKaryawan('${u.id}')">
          ${avatarHtml}
          <div class="ui-info">
            <div class="ui-name" style="color: var(--primary); font-weight:700;">${u.nama_lengkap || '-'}</div>
            <div class="ui-email">${u.email || '-'}
              <span class="badge badge-${u.role==='super_admin'?'red':u.role==='admin'?'blue':'gray'}" style="margin-left:4px;">${u.role}</span>
            </div>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap;">
              <span>⏳ ${formatMasaKerja(masaKerja)}</span>
              ${u.jabatan?`<span>💼 ${u.jabatan}</span>`:''}
              <span>📍 ${u.titik_radius || 'Bebas Radius'}</span>
            </div>
          </div>
        </div>
        
        <div style="display:flex; flex-direction:row; align-items:center; gap:8px;">
          <span class="badge ${u.status_akun==='Aktif'?'badge-green':u.status_akun==='Menunggu Verifikasi'?'badge-yellow':'badge-red'}">
            ${u.status_akun||'Aktif'}
          </span>
          
          ${bisaEdit ? `
            <button class="action-btn" title="Edit Data" onclick="window.openEditKaryawan('${u.id}'); event.stopPropagation();" style="background: var(--gray-100); color: var(--text);">
              <i class="fa fa-edit"></i>
            </button>
          ` : ''}

          ${(me.role === 'super_admin' || (me.role === 'admin' && u.role === 'staff')) ? `
            <button class="action-btn ${isAktif?'delete':''}" title="${isAktif?'Non-aktifkan':'Aktifkan'}"
              onclick="toggleStatusUser('${u.id}','${u.status_akun||'Aktif'}'); event.stopPropagation();">
              <i class="fa fa-${isAktif?'ban':'check'}"></i>
            </button>
          ` : ''}
        </div>
      </div>`
  }).join('')
}

window.openDetailKaryawan = function(id) {
  const target = window._allUsers.find(u => u.id === id)
  if(!target) return

  window.showUserModal suicide(`
    <div class="modal-header">
      <h3><i class="fa fa-id-card" style="color:var(--primary);"></i> Detail Informasi Karyawan</h3>
      <button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
    </div>
    <div style="padding: 10px 0; text-align:center; border-bottom: 1px solid var(--border); margin-bottom: 14px;">
       ${target.foto_url ? `<img src="${target.foto_url}" style="width:70px; height:70px; border-radius:50%; object-fit:cover;">` : `<div class="profile-avatar" style="margin:0 auto 10px;">${target.nama_lengkap[0].toUpperCase()}</div>`}
       <h4 style="margin:6px 0 2px; font-size:1.1rem;">${target.nama_lengkap}</h4>
       <span class="badge badge-gray">${target.role.toUpperCase()}</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px; font-size: .85rem;">
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Email:</span><strong>${target.email || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Jabatan:</span><strong>${target.jabatan || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Departemen:</span><strong>${target.departemen || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">No. HP:</span><strong>${target.no_hp || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Tanggal Bergabung:</span><strong>${target.tanggal_bergabung || '-'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Plot Titik Radius:</span><strong style="color:var(--primary); font-weight:800;">📍 ${target.titik_radius || 'Bebas Area (Bypass)'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Status Akun:</span><strong>${target.status_akun || 'Aktif'}</strong></div>
      <div style="display:flex; justify-content:space-between;"><span style="color:var(--text-muted);">Sisa Jatah Cuti:</span><strong>🌴 ${target.sisa_cuti || 0} Hari</strong></div>
    </div>
    <div class="modal-actions" style="margin-top:20px;">
      <button class="btn-secondary" style="width:100%;" onclick="window.closeUserModal()">Tutup Detail</button>
    </div>
  `)
}

window.openEditKaryawan = async function(id) {
  const target = window._allUsers.find(u => u.id === id)
  if(!target) return

  const me = window.currentUser
  const isMe = me.id === target.id
  const canEditAllFields = (me.role === 'super_admin') || (me.role === 'admin' && target.role === 'staff')

  let opsiLokasi = ''
  try {
    const { data: lokasiList } = await supabase.from('lokasi_absen').select('*')
    opsiLokasi = (lokasiList || []).map(l => {
      const nameT = l.nama_titik || l.nama_lokasi || l.nama || '';
      return `<option value="${nameT}" ${target.titik_radius === nameT ? 'selected' : ''}>${nameT}</option>`
    }).join('')
  } catch(e){}

  window.showUserModal(`
    <div class="modal-header">
      <h3><i class="fa fa-user-edit" style="color:var(--warning);"></i> Edit Data: ${target.nama_lengkap}</h3>
      <button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button>
    </div>

    <div style="text-align:center;padding:14px 0 10px;border-bottom:1px solid var(--border);margin-bottom:14px;">
      <div style="position:relative;display:inline-block;">
        ${target.foto_url
          ? `<img src="${target.foto_url}" id="editAvatarPreview" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);">`
          : `<div class="profile-avatar" id="editAvatarPreview" style="width:64px;height:64px;font-size:1.4rem;display:flex;align-items:center;justify-content:center;">${target.nama_lengkap[0].toUpperCase()}</div>`
        }
        ${isMe || canEditAllFields ? `
          <label for="editFotoInput" title="Ganti foto" style="position:absolute;bottom:-2px;right:-2px;width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.6rem;box-shadow:0 2px 6px rgba(0,0,0,.25);border:2px solid #fff;">
            <i class="fa fa-camera"></i>
          </label>
          <input type="file" id="editFotoInput" accept="image/*" style="display:none;" onchange="uploadFotoEditModal(this,'${target.id}')">
        ` : ''}
      </div>
      <div id="editFotoStatus" style="font-size:.72rem;color:var(--text-muted);margin-top:6px;min-height:16px;"></div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; padding-top:4px;">
      <div class="field full" style="grid-column:1/-1;">
        <label>Nama Lengkap</label>
        <input id="editNama" value="${target.nama_lengkap}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Jabatan</label>
        <input id="editJabatan" value="${target.jabatan || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Departemen</label>
        <input id="editDept" value="${target.departemen || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>No. HP</label>
        <input id="editHp" value="${target.no_hp || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Tanggal Lahir</label>
        <input type="date" id="editLahir" value="${target.tanggal_lahir || ''}" ${canEditAllFields ? '' : 'disabled'}>
      </div>
      <div class="field">
        <label>Atur Jatah Titik Radius</label>
        <select id="editTitikRadius" ${canEditAllFields ? '' : 'disabled'} style="width:100%; padding:10px; border-radius:var(--r-md); border:1.5px solid var(--border); font-size:.85rem; font-weight:700; background:#fff; color:#000;">
          <option value="">-- Bebas Radius (Bypass) --</option>
          ${opsiLokasi}
        </select>
      </div>

      <div class="field full" style="grid-column:1/-1; border-top:1px solid var(--border); padding-top:10px; margin-top:5px;">
        <label style="color:var(--primary); font-weight:800;"><i class="fa fa-key"></i> ${isMe ? 'Ganti Password Anda' : 'Reset Password Karyawan'}</label>
        <input type="password" id="editPassword" placeholder="Masukkan password baru jika ingin diubah">
        <small style="font-size:.65rem; color:var(--text-muted);">Biarkan kosong jika password tidak ingin diganti.</small>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="window.closeUserModal()">Batal</button>
      <button class="btn-primary" onclick="window.saveEditKaryawan('${target.id}', ${canEditAllFields}, ${isMe})"><i class="fa fa-save"></i> Perbarui Data</button>
    </div>
  `)
}

window.uploadFotoEditModal = async function(input, targetUserId) {
  const file = input.files[0]
  const statusEl = document.getElementById('editFotoStatus')
  if (!file) return

  if (file.size > 2 * 1024 * 1024) {
    if (statusEl) statusEl.textContent = '⚠ Ukuran foto max 2MB'
    return
  }

  if (statusEl) statusEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mengupload...'

  const ext      = file.name.split('.').pop()
  const fileName = `avatar-${targetUserId}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, { upsert: true })

  if (uploadErr) {
    if (statusEl) statusEl.textContent = '⚠ Upload gagal: ' + uploadErr.message
    return
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
  const foto_url = urlData.publicUrl + '?t=' + Date.now()

  const { error: dbErr } = await supabase
    .from('profiles')
    .update({ foto_url })
    .eq('id', targetUserId)

  if (dbErr) {
    if (statusEl) statusEl.textContent = '⚠ Gagal simpan ke DB: ' + dbErr.message
    return
  }

  const preview = document.getElementById('editAvatarPreview')
  if (preview) {
    preview.src = foto_url
  }

  if (targetUserId === window.currentUser.id) {
    window.currentUser.foto_url = foto_url
    const topAvatar = document.getElementById('topbarAvatar')
    if (topAvatar) {
      topAvatar.style.backgroundImage = `url(${foto_url})`
      topAvatar.style.backgroundSize  = 'cover'
      topAvatar.textContent = ''
    }
  }

  const idx = (window._allUsers || []).findIndex(u => u.id === targetUserId)
  if (idx !== -1) window._allUsers[idx].foto_url = foto_url

  if (statusEl) statusEl.innerHTML = '<i class="fa fa-check" style="color:var(--success,#22c55e);"></i> Foto berhasil diperbarui!'
}

window.saveEditKaryawan = async function(id, canEditAll, isMe) {
  const newPassword = document.getElementById('editPassword').value.trim()

  try {
    if (canEditAll) {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          nama_lengkap: document.getElementById('editNama').value.trim(),
          jabatan:      document.getElementById('editJabatan').value.trim(),
          departemen:   document.getElementById('editDept').value.trim(),
          no_hp:        document.getElementById('editHp').value.trim(),
          tanggal_lahir: document.getElementById('editLahir').value || null,
          titik_radius:  document.getElementById('editTitikRadius').value || null
        })
        .eq('id', id)

      if (profileErr) throw profileErr
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        alert('⚠ Password minimal 6 karakter!')
        return
      }
      if (isMe) {
        const { error: passErr } = await supabase.auth.updateUser({ password: newPassword })
        if (passErr) throw passErr
      } else {
        alert('ℹ️ Reset password karyawan lain memerlukan Supabase Admin Function. Hubungi super admin atau aktifkan Edge Function untuk fitur ini.')
      }
    }

    window.closeUserModal()
    alert('✅ Seluruh perubahan data berhasil disimpan!')
    await renderUsers()

  } catch (err) {
    alert('Gagal memperbarui data: ' + err.message)
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
