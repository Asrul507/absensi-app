import { showToast } from './feedback.js'

export async function initRegisterPage() {
  const listEl = document.getElementById('pendingList')
  const emptyEl = document.getElementById('pendingEmpty')
  if (listEl) listEl.innerHTML = ''
  if (emptyEl) {
    emptyEl.style.display = 'block'
    emptyEl.textContent = 'Pembuatan akun mandiri dinonaktifkan. Hubungi HRD/admin untuk dibuatkan akun username dan password awal.'
  }
  showToast('Pembuatan akun mandiri dinonaktifkan. Gunakan akun dari HRD/admin.', 'info')
}

export async function registerKaryawan() {
  showToast('Pembuatan akun mandiri dinonaktifkan. Hubungi HRD/admin untuk dibuatkan akun.', 'warning')
  return false
}
