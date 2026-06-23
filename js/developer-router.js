import { normalizeRole } from './access-control.js'
import { showToast } from './feedback.js'
import { renderDeveloperPanel } from './developer-panel.js'
import { renderSettingsApp } from './settings-app.js'

const SUPER_ADMIN_ALLOWED_PAGES = new Set(['developer-panel', 'settings-app', 'profile'])
const OPERATIONAL_PAGE_FALLBACK = 'developer-panel'

function isSuperAdminUser() {
  return normalizeRole(window.currentUser?.role) === 'super_admin'
}

function closeSidebarSafe() {
  try { window.closeSidebar?.() } catch (_) {}
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

      <div class="sidebar-section-title">AKUN OWNER</div>
      <a href="#" id="menu-profile" onclick="navigate('profile'); closeSidebar(); return false;"><i class="fa fa-user-gear"></i> Profil Owner</a>
    </nav>
    <div style="padding: 15px; border-top: 1px solid rgba(255,255,255,0.08);">
      <button onclick="logout()" class="btn-danger" style="width:100%; padding: 10px; font-size: 0.8rem; font-weight:700; border-radius:8px; cursor:pointer;">
        <i class="fa fa-sign-out-alt"></i> Keluar Developer Panel
      </button>
    </div>
  `
}

function hideDeveloperBottomNav() {
  const nav = document.getElementById('bottomNav')
  if (nav && isSuperAdminUser()) nav.innerHTML = ''
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
    if (page !== 'dashboard') showToast('Menu operasional tidak tersedia untuk Super Admin. Gunakan Developer Panel.', 'warning')
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
    if (isSuperAdminUser()) return navigateDeveloper(page)
    return window.__genproOriginalNavigate(page)
  }

  // Jika app.js sudah selesai login dan sudah sempat render dashboard lama, paksa pindah ke Developer Panel.
  setTimeout(() => {
    if (isSuperAdminUser()) navigateDeveloper(window.currentPage || OPERATIONAL_PAGE_FALLBACK)
  }, 0)
}

// Modul ini dimuat setelah app.js. Pasang router segera, lalu ulang beberapa kali untuk kasus app.js belum selesai inisialisasi.
installDeveloperRouter()
let tries = 0
const timer = setInterval(() => {
  installDeveloperRouter()
  if (isSuperAdminUser()) {
    renderDeveloperSidebar()
    hideDeveloperBottomNav()
    if (!SUPER_ADMIN_ALLOWED_PAGES.has(window.currentPage)) navigateDeveloper(OPERATIONAL_PAGE_FALLBACK)
  }
  tries += 1
  if (window.__developerRouterInstalled && tries > 20) clearInterval(timer)
}, 250)
