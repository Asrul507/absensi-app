import { supabase } from './supabase.js'
import { registerKaryawan } from './auth.js'
import { showToast } from './feedback.js'

/* ===============================================================
   HALAMAN DAFTAR KARYAWAN BARU
   - Tampilkan daftar nama dari pending_profiles (status: waiting)
   - Karyawan pilih nama → isi email + password → verifikasi email
=============================================================== */

let selectedPending = null

export async function initRegisterPage() {
  await loadPendingList()
  bindEvents()
}

/* ---- Load daftar nama karyawan yang belum daftar ---- */
async function loadPendingList() {
  const listEl = document.getElementById('pendingList')
  const emptyEl = document.getElementById('pendingEmpty')
  if (!listEl) return

  listEl.innerHTML = `
    <div style="text-align:center;padding:24px;color:var(--text-muted);">
      <i class="fa fa-spinner fa-spin"></i> Memuat daftar...
    </div>`

  const { data, error } = await supabase
    .from('pending_profiles')
    .select('id, nama_lengkap, jabatan, departemen')
    .eq('status', 'waiting')
    .order('nama_lengkap')

  if (error || !data?.length) {
    listEl.innerHTML = ''
    if (emptyEl) emptyEl.style.display = 'block'
    return
  }

  if (emptyEl) emptyEl.style.display = 'none'

  listEl.innerHTML = data.map(p => `
    <div class="pending-item" data-id="${p.id}" data-nama="${p.nama_lengkap}"
      onclick="selectPending('${p.id}', '${p.nama_lengkap}')">
      <div class="pi-avatar">${p.nama_lengkap[0].toUpperCase()}</div>
      <div class="pi-info">
        <div class="pi-name">${p.nama_lengkap}</div>
        <div class="pi-sub">${p.jabatan || '-'}${p.departemen ? ' · ' + p.departemen : ''}</div>
      </div>
      <i class="fa fa-chevron-right" style="color:var(--gray-300);font-size:.8rem;"></i>
    </div>`
  ).join('')
}

/* ---- Pilih nama ---- */
window.selectPending = function(id, nama) {
  selectedPending = id

  // Highlight selected
  document.querySelectorAll('.pending-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id)
  })

  // Tampilkan form registrasi
  const formEl = document.getElementById('regForm')
  const namaEl = document.getElementById('regNamaDisplay')
  if (formEl) formEl.style.display = 'block'
  if (namaEl) namaEl.textContent = nama

  // Scroll ke form
  formEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

  // Clear error
  const errEl = document.getElementById('regError')
  if (errEl) errEl.style.display = 'none'
}

/* ---- Bind events ---- */
function bindEvents() {
  // Search filter
  const searchEl = document.getElementById('searchPending')
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.toLowerCase()
      document.querySelectorAll('.pending-item').forEach(el => {
        el.style.display = el.dataset.nama.toLowerCase().includes(q) ? '' : 'none'
      })
    })
  }

  // Submit daftar
  const btnDaftar = document.getElementById('btnDaftar')
  if (btnDaftar) {
    btnDaftar.addEventListener('click', async () => {
      if (!selectedPending) {
        showToast('Pilih nama kamu dari daftar terlebih dahulu', 'warning')
        return
      }

      const email     = document.getElementById('regEmail').value.trim()
      const password  = document.getElementById('regPassword').value
      const konfirm   = document.getElementById('regKonfirmasi').value
      const errEl     = document.getElementById('regError')
      if (errEl) errEl.style.display = 'none'

      const ok = await registerKaryawan(selectedPending, email, password, konfirm)

      if (ok) {
        // Tampilkan pesan sukses
        document.getElementById('regForm').style.display = 'none'
        document.getElementById('pendingList').style.display = 'none'
        document.getElementById('regSuccess').style.display = 'block'
      }
    })
  }

  // Tombol kembali ke login
  document.getElementById('btnKeLogin')?.addEventListener('click', () => {
    window.location.href = 'index.html'
  })
}
