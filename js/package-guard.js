import { normalizeRole } from './access-control.js'
import { getPackageLabel, mergeClientPackageConfig, packageHasFeature } from './package-service.js'
import { showToast } from './feedback.js'

const PAGE_FEATURE_MAP = Object.freeze({
  'approval-absensi': 'approval_absensi_open',
  personalia: 'personalia_kontrak',
  'laporan-keseluruhan': 'laporan_keseluruhan',
  payroll: 'payroll',
})

const FEATURE_LABELS = Object.freeze({
  approval_absensi_open: 'Approval Absensi OPEN',
  personalia_kontrak: 'HR Personalia / Kontrak',
  laporan_keseluruhan: 'Laporan Keseluruhan',
  employee_excel_import: 'Upload Excel Karyawan',
  payroll: 'Payroll',
})

function isSuperAdmin() {
  return normalizeRole(window.currentUser?.role) === 'super_admin'
}

function getCurrentClient() {
  const client = Array.isArray(window.currentUser?.clients)
    ? window.currentUser.clients[0]
    : window.currentUser?.clients
  return client ? mergeClientPackageConfig(client) : null
}

function getCurrentPackageType() {
  return getCurrentClient()?.package_type || 'basic'
}

function canUseFeature(featureKey) {
  if (isSuperAdmin()) return true
  return packageHasFeature(getCurrentPackageType(), featureKey)
}

function lockMessage(featureKey) {
  const client = getCurrentClient()
  const pkgLabel = getPackageLabel(client?.package_type || 'basic')
  const featureLabel = FEATURE_LABELS[featureKey] || 'Fitur ini'
  return `${featureLabel} tidak tersedia pada Paket ${pkgLabel}. Upgrade paket untuk membuka fitur ini.`
}

function removeMenu(page) {
  const menu = document.getElementById(`menu-${page}`)
  if (menu) menu.remove()
  const bnav = document.getElementById(`bnav-${page}`)
  if (bnav) bnav.remove()
}

function applyPackageMenuLocks() {
  if (!window.currentUser || isSuperAdmin()) return

  Object.entries(PAGE_FEATURE_MAP).forEach(([page, featureKey]) => {
    if (!canUseFeature(featureKey)) removeMenu(page)
  })

  // Basic tidak dapat upload/import karyawan Excel, tapi tetap bisa tambah manual.
  if (!canUseFeature('employee_excel_import')) {
    const uploadInput = document.getElementById('inputUploadKaryawanExcel')
    if (uploadInput) uploadInput.remove()
    document.querySelectorAll('button').forEach(btn => {
      const text = (btn.textContent || '').toLowerCase()
      if (text.includes('upload excel') || text.includes('template excel')) btn.remove()
    })
  }
}

function renderPackageBlockedPage(featureKey) {
  const content = document.getElementById('content')
  if (!content) return
  const client = getCurrentClient()
  const pkgLabel = getPackageLabel(client?.package_type || 'basic')
  content.innerHTML = `
    <div class="card" style="padding:22px;border-left:4px solid var(--warning);">
      <div style="font-size:1rem;font-weight:900;color:var(--warning);margin-bottom:8px;">
        <i class="fa fa-lock"></i> Fitur Terkunci
      </div>
      <div style="font-weight:800;margin-bottom:6px;">${FEATURE_LABELS[featureKey] || 'Fitur ini'} tidak termasuk Paket ${pkgLabel}.</div>
      <div style="color:var(--text-muted);font-size:.86rem;line-height:1.6;">
        Client ini memakai Paket <strong>${pkgLabel}</strong>. Silakan upgrade paket dari Developer Panel jika fitur ini ingin digunakan.
      </div>
    </div>
  `
}

function installPackageGuard() {
  if (window.__packageGuardInstalled) return
  if (typeof window.navigate !== 'function') return

  window.__packageGuardInstalled = true
  window.__genproPackageGuardOriginalNavigate = window.navigate

  window.canUsePackageFeature = canUseFeature
  window.getCurrentClientPackage = getCurrentClient
  window.applyPackageMenuLocks = applyPackageMenuLocks

  window.navigate = async function(page) {
    if (!isSuperAdmin()) {
      const featureKey = PAGE_FEATURE_MAP[page]
      if (featureKey && !canUseFeature(featureKey)) {
        window.currentPage = page
        renderPackageBlockedPage(featureKey)
        showToast(lockMessage(featureKey), 'warning')
        applyPackageMenuLocks()
        return
      }
    }

    const result = await window.__genproPackageGuardOriginalNavigate(page)
    setTimeout(applyPackageMenuLocks, 0)
    setTimeout(applyPackageMenuLocks, 300)
    return result
  }

  setTimeout(applyPackageMenuLocks, 0)
  setTimeout(applyPackageMenuLocks, 500)
}

installPackageGuard()
let guardTries = 0
const guardTimer = setInterval(() => {
  installPackageGuard()
  applyPackageMenuLocks()
  guardTries += 1
  if (window.__packageGuardInstalled && guardTries > 24) clearInterval(guardTimer)
}, 250)
