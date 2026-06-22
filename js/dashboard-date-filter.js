import { supabase } from './supabase.js'
import { getTodayLokal } from './timezone.js'

const STORAGE_KEY = 'genpro.dashboardDateFilter'
const DASHBOARD_TABLES = new Set(['absensi', 'jadwal'])

function getDefaultRange() {
  const today = getTodayLokal()
  const [year, month] = today.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1, 1)).toISOString().split('T')[0]
  const last = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0]
  return { from: first, to: last, active: false }
}

function getSavedRange() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
    if (saved?.from && saved?.to) return { from: saved.from, to: saved.to, active: true }
  } catch (_) {}
  return getDefaultRange()
}

function setSavedRange(from, to) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to }))
  window.__dashboardDateFilter = { from, to, active: true }
}

function clearSavedRange() {
  sessionStorage.removeItem(STORAGE_KEY)
  window.__dashboardDateFilter = getDefaultRange()
}

function getActiveRange() {
  window.__dashboardDateFilter = window.__dashboardDateFilter || getSavedRange()
  return window.__dashboardDateFilter
}

function isDashboardFilterActive(table, column) {
  const filter = getActiveRange()
  return Boolean(
    filter?.active &&
    filter.from &&
    filter.to &&
    window.currentPage === 'dashboard' &&
    DASHBOARD_TABLES.has(String(table)) &&
    String(column) === 'tanggal'
  )
}

function wrapFilterBuilder(builder, table) {
  if (!builder || builder.__dashboardDateFilterWrapped) return builder
  const originalGte = typeof builder.gte === 'function' ? builder.gte.bind(builder) : null
  const originalLte = typeof builder.lte === 'function' ? builder.lte.bind(builder) : null

  if (originalGte) {
    builder.gte = function(column, value) {
      if (isDashboardFilterActive(table, column)) return originalGte(column, getActiveRange().from)
      return originalGte(column, value)
    }
  }

  if (originalLte) {
    builder.lte = function(column, value) {
      if (isDashboardFilterActive(table, column)) return originalLte(column, getActiveRange().to)
      return originalLte(column, value)
    }
  }

  builder.__dashboardDateFilterWrapped = true
  return builder
}

function wrapQueryBuilder(queryBuilder, table) {
  if (!queryBuilder || queryBuilder.__dashboardDateQueryWrapped) return queryBuilder
  const originalSelect = typeof queryBuilder.select === 'function' ? queryBuilder.select.bind(queryBuilder) : null

  if (originalSelect) {
    queryBuilder.select = function(...args) {
      return wrapFilterBuilder(originalSelect(...args), table)
    }
  }

  queryBuilder.__dashboardDateQueryWrapped = true
  return queryBuilder
}

function installSupabaseDashboardDateFilter() {
  if (!supabase?.from || supabase.from.__dashboardDateWrapped) return
  const originalFrom = supabase.from.bind(supabase)
  const wrappedFrom = function(table) {
    const queryBuilder = originalFrom(table)
    return wrapQueryBuilder(queryBuilder, table)
  }
  wrappedFrom.__dashboardDateWrapped = true
  supabase.from = wrappedFrom
}

function ensureDashboardFilterCard() {
  if (window.currentPage !== 'dashboard') return
  const content = document.getElementById('content')
  if (!content || document.getElementById('dashboardDateFilterCard')) return
  const header = content.querySelector('.page-header')
  if (!header) return
  const range = getSavedRange()
  window.__dashboardDateFilter = range
  header.insertAdjacentHTML('afterend', `
    <div id="dashboardDateFilterCard" class="card fade-up" style="padding:14px 16px;margin-bottom:16px;">
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div style="font-weight:900;color:var(--text);margin-right:auto;min-width:180px;">
          <i class="fa fa-calendar-days" style="color:var(--primary);"></i> Filter Data Dashboard
          <div style="font-size:.7rem;color:var(--text-muted);font-weight:600;margin-top:3px;">Mengatur data chart absensi dan jadwal dashboard</div>
        </div>
        <div style="min-width:145px;flex:1;">
          <label>Dari Tanggal</label>
          <input type="date" id="dashboardFilterFrom" value="${range.from}">
        </div>
        <div style="min-width:145px;flex:1;">
          <label>Sampai Tanggal</label>
          <input type="date" id="dashboardFilterTo" value="${range.to}">
        </div>
        <button class="btn-primary btn-sm" onclick="window.applyDashboardDateFilter()"><i class="fa fa-search"></i> Terapkan</button>
        <button class="btn-secondary btn-sm" onclick="window.resetDashboardDateFilter()"><i class="fa fa-rotate-left"></i> Bulan Ini</button>
      </div>
      <div style="font-size:.72rem;color:var(--text-muted);margin-top:8px;">Filter aktif: <strong>${range.from}</strong> sampai <strong>${range.to}</strong>${range.active ? '' : ' (default bulan ini)'}</div>
    </div>
  `)
}

window.applyDashboardDateFilter = async function() {
  const from = document.getElementById('dashboardFilterFrom')?.value
  const to = document.getElementById('dashboardFilterTo')?.value
  if (!from || !to) {
    window.showToast?.('Pilih tanggal awal dan akhir dulu.', 'warning')
    return
  }
  if (from > to) {
    window.showToast?.('Tanggal awal tidak boleh lebih besar dari tanggal akhir.', 'warning')
    return
  }
  setSavedRange(from, to)
  await window.navigate?.('dashboard')
}

window.resetDashboardDateFilter = async function() {
  clearSavedRange()
  await window.navigate?.('dashboard')
}

function hookDashboardNavigation() {
  if (typeof window.navigate !== 'function' || window.navigate.__dashboardDateFilterWrapped) return
  const originalNavigate = window.navigate
  window.navigate = async function(page, ...args) {
    window.__dashboardDateFilter = getSavedRange()
    const result = await originalNavigate.call(this, page, ...args)
    if (page === 'dashboard') setTimeout(ensureDashboardFilterCard, 80)
    return result
  }
  window.navigate.__dashboardDateFilterWrapped = true
}

function retryInstall(attempt = 0) {
  installSupabaseDashboardDateFilter()
  hookDashboardNavigation()
  if (window.currentPage === 'dashboard') ensureDashboardFilterCard()
  if (attempt < 30 && typeof window.navigate !== 'function') {
    setTimeout(() => retryInstall(attempt + 1), 400)
  }
}

window.__dashboardDateFilter = getSavedRange()
retryInstall()
document.addEventListener('DOMContentLoaded', () => retryInstall())
document.addEventListener('click', () => {
  if (window.currentPage === 'dashboard') setTimeout(ensureDashboardFilterCard, 50)
})
