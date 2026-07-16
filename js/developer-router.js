import { normalizeRole } from './access-control.js'
import { showToast } from './feedback.js'
import { renderDeveloperPanel } from './developer-panel.js'
import { renderSettingsApp } from './settings-app.js'

const SUPER_ADMIN_ALLOWED_PAGES = new Set(['developer-panel', 'settings-app', 'profile'])
const OPERATIONAL_PAGE_FALLBACK = 'developer-panel'
const FULL_APP_MODE_KEY = 'genproSuperAdminFullAppMode'

function isSuperAdminUser() {
  return normalizeRole(window.currentUser?.role) === 'super_admin'
}

function isFullAppMode() {
  return sessionStorage.getItem(FULL_APP_MODE_KEY) === 'true'
}

function closeSidebarSafe() {
  try { window.closeSidebar?.() } catch (_) {}
}

window.openSuperAdminFullApp = function() {
  sessionStorage.setItem(FULL_APP_MODE_KEY, 'true')
  location.reload()
}

window.backToDeveloperPanel = function() {
  sessionStorage.removeItem(FULL_APP_MODE_KEY)
  location.reload()
}

function renderDeveloperSidebar() {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar || !isSuperAdminUser()) return

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sb-name">GenPro</div>
      <div class="sb-office">Developer / Owner Panel</div>
    </div>
    <nav class="sidebar-nav">
      <div class="sidebar-section-title">DEVELOPER</div>
      <a href="#" id="menu-developer-panel" onclick="navigate('developer-panel'); closeSidebar(); return false;"><i class="fa fa-code"></i> Developer Panel</a>
      <a href="#" id="menu-settings-app" onclick="navigate('settings-app'); closeSidebar(); return false;"><i class="fa fa-building-user"></i> Client & Package Settings</a>
      <a href="#" id="menu-full-app" onclick="openSuperAdminFullApp(); closeSidebar(); return false;"><i class="fa fa-layer-group"></i> Buka Aplikasi Penuh</a>

      <div class="sidebar-section-title">AKUN OWNER</div>
      <a href="#" id="menu-profile" onclick="navigate('profile'); closeSidebar(); return false;"><i class="fa fa-user-gear"></i> Profil Owner</a>
    </nav>
    <div style="padding: 15px; border-top: 1px solid rgba(255,255,255,0.08);">
      <button onclick="logout()" class="btn-danger" style="width:100%; padding: 10px; font-size: 0.8rem; font-weight:700; border-radius:8px; cursor:pointer;">
        <i class="fa fa-sign-out-alt"></i> Keluar Developer Panel
      </button>
      <div style="margin-top:10px; text-align:center; font-size:.65rem; color:rgba(255,255,255,.3); letter-spacing:.3px; line-height:1.5;">
        &copy; ${new Date().getFullYear()} GenPro<br>Hak Cipta Dilindungi
      </div>
    </div>
  `
}

function injectBackToDeveloperButton() {
  if (!isSuperAdminUser() || !isFullAppMode()) return
  const sidebar = document.getElementById('sidebar')
  if (!sidebar || document.getElementById('menu-back-developer')) return
  const nav = sidebar.querySelector('.sidebar-nav') || sidebar
  const wrap = document.createElement('div')
  wrap.innerHTML = `
    <div class="sidebar-section-title">OWNER MODE</div>
    <a href="#" id="menu-back-developer" onclick="backToDeveloperPanel(); closeSidebar(); return false;"><i class="fa fa-code"></i> Kembali Developer Panel</a>
  `
  nav.insertBefore(wrap, nav.firstChild)
}

function hideDeveloperBottomNav() {
  const nav = document.getElementById('bottomNav')
  if (nav && isSuperAdminUser() && !isFullAppMode()) nav.innerHTML = ''
}

function setActiveDeveloperMenu(page) {
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'))
  document.getElementById(`menu-${page}`)?.classList.add('active')
  document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'))
}

async function navigateDeveloper(page = OPERATIONAL_PAGE_FALLBACK) {
  if (!window.currentUser) return

  let targetPage = page
  if (!SUPER_ADMIN_ALLOWED_PAGES.has(targetPage)) {
    targetPage = OPERATIONAL_PAGE_FALLBACK
    if (page !== 'dashboard') showToast('Menu operasional tidak tersedia untuk Super Admin. Gunakan Developer Panel atau Buka Aplikasi Penuh.', 'warning')
  }

  window.currentPage = targetPage
  renderDeveloperSidebar()
  hideDeveloperBottomNav()
  setActiveDeveloperMenu(targetPage)

  switch (targetPage) {
    case 'settings-app':
      await renderSettingsApp(window.currentUser)
      break
    case 'profile':
      await window.__genproOriginalNavigate?.('profile')
      renderDeveloperSidebar()
      hideDeveloperBottomNav()
      setActiveDeveloperMenu('profile')
      break
    case 'developer-panel':
    default:
      await renderDeveloperPanel(window.currentUser)
      break
  }
}

function installDeveloperRouter() {
  if (window.__developerRouterInstalled) return
  if (typeof window.navigate !== 'function') return

  window.__developerRouterInstalled = true
  window.__genproOriginalNavigate = window.navigate

  window.navigate = async function(page) {
    if (isSuperAdminUser() && !isFullAppMode()) return navigateDeveloper(page)
    return window.__genproOriginalNavigate(page)
  }

  setTimeout(() => {
    if (isSuperAdminUser() && !isFullAppMode()) navigateDeveloper(window.currentPage || OPERATIONAL_PAGE_FALLBACK)
    if (isSuperAdminUser() && isFullAppMode()) injectBackToDeveloperButton()
  }, 0)
}

installDeveloperRouter()
let tries = 0
const timer = setInterval(() => {
  installDeveloperRouter()
  if (isSuperAdminUser() && !isFullAppMode()) {
    renderDeveloperSidebar()
    hideDeveloperBottomNav()
    if (!SUPER_ADMIN_ALLOWED_PAGES.has(window.currentPage)) navigateDeveloper(OPERATIONAL_PAGE_FALLBACK)
  }
  if (isSuperAdminUser() && isFullAppMode()) injectBackToDeveloperButton()
  tries += 1
  if (window.__developerRouterInstalled && tries > 20) clearInterval(timer)
}, 250)
