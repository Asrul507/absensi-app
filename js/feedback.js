export function showToast(message, type = 'info', timeout = 3000) {
  const host = document.getElementById('toast-container')
  if (!host) {
    console[type === 'error' ? 'error' : 'log'](message)
    return
  }
  const tone = {
    success: 'var(--success, #16a34a)',
    error: 'var(--danger, #dc2626)',
    warning: 'var(--warning, #d97706)',
    info: 'var(--primary, #2563eb)'
  }[type] || 'var(--primary, #2563eb)'
  const el = document.createElement('div')
  el.className = `toast ${type === 'warning' ? 'info' : type}`
  el.style.borderLeft = `4px solid ${tone}`
  el.textContent = message
  host.appendChild(el)
  setTimeout(() => el.remove(), timeout)
}

export function setButtonLoading(btn, isLoading, labelHtml = '') {
  if (!btn) return
  if (isLoading) {
    btn.dataset.originalHtml = btn.innerHTML
    btn.disabled = true
    btn.innerHTML = labelHtml || '<i class="fa fa-spinner fa-spin"></i> Memproses...'
    return
  }
  btn.disabled = false
  btn.innerHTML = btn.dataset.originalHtml || labelHtml || btn.innerHTML
}
