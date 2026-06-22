import { renderLaporanKeseluruhan } from './laporan-keseluruhan.js'
import { normalizeRole } from './access-control.js'
import './excel-download-formatter.js'
import './report-excel-workbook.js'
import './dashboard-date-filter.js'

const ADMIN_REPORT_ROLES = new Set(['super_admin', 'admin_all', 'admin_hr', 'admin'])

function canOpenAdminOverallReport(user = window.currentUser) {
  return ADMIN_REPORT_ROLES.has(normalizeRole(user?.role))
}

function ensureOverallReportMenu() {
  const user = window.currentUser
  const role = normalizeRole(user?.role)
  if (!canOpenAdminOverallReport(user)) return
  const nav = document.querySelector('.sidebar-nav')
  if (!nav || document.getElementById('menu-laporan-keseluruhan')) return
  const rekapMenu = document.getElementById('menu-rekap')
  const html = `<a href="#" id="menu-laporan-keseluruhan" onclick="navigate('laporan-keseluruhan'); closeSidebar(); return false;"><i class="fa fa-file-lines"></i> Laporan Keseluruhan <span class="sidebar-badge-info">ADMIN</span></a>`
  if (rekapMenu) rekapMenu.insertAdjacentHTML('afterend', html)
  else nav.insertAdjacentHTML('beforeend', html)
}

function setOverallReportActive() {
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'))
  document.getElementById('menu-laporan-keseluruhan')?.classList.add('active')
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'))
}

function hookOverallReportNavigation() {
  if (typeof window.navigate !== 'function' || window.navigate.__adminReportAccessWrapped) return
  const originalNavigate = window.navigate
  window.navigate = async function(page, ...args) {
    if (page === 'laporan-keseluruhan' && canOpenAdminOverallReport(window.currentUser)) {
      window.currentPage = page
      ensureOverallReportMenu()
      setOverallReportActive()
      return renderLaporanKeseluruhan(window.currentUser)
    }
    return originalNavigate.call(this, page, ...args)
  }
  window.navigate.__adminReportAccessWrapped = true
}

function retryInstall(attempt = 0) {
  hookOverallReportNavigation()
  ensureOverallReportMenu()
  if (attempt < 30 && typeof window.navigate !== 'function') {
    setTimeout(() => retryInstall(attempt + 1), 400)
  }
}

retryInstall()
document.addEventListener('DOMContentLoaded', () => retryInstall())
document.addEventListener('click', () => setTimeout(ensureOverallReportMenu, 50))
