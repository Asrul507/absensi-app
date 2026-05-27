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

export function confirmAction(message, okLabel = 'Ya, lanjutkan') {
  return new Promise(resolve => {
    const bg = document.createElement('div')
    bg.className = 'modal-bg open'
    bg.innerHTML = `
      <div class="modal-box" style="max-width:420px;">
        <div class="modal-header">
          <h3><i class="fa fa-circle-question" style="color:var(--warning,#d97706)"></i> Konfirmasi</h3>
        </div>
        <p style="font-size:.85rem;color:var(--text);margin-bottom:16px;">${message}</p>
        <div class="modal-actions">
          <button class="btn-secondary" id="cfNo">Batal</button>
          <button class="btn-primary" id="cfYes">${okLabel}</button>
        </div>
      </div>
    `
    const done = (v) => { bg.remove(); resolve(v) }
    bg.querySelector('#cfNo')?.addEventListener('click', () => done(false))
    bg.querySelector('#cfYes')?.addEventListener('click', () => done(true))
    bg.addEventListener('click', (e) => { if (e.target === bg) done(false) })
    document.body.appendChild(bg)
  })
}

export function promptAction(message, placeholder = '', okLabel = 'Simpan') {
  return new Promise(resolve => {
    const bg = document.createElement('div')
    bg.className = 'modal-bg open'
    bg.innerHTML = `
      <div class="modal-box" style="max-width:420px;">
        <div class="modal-header"><h3><i class="fa fa-pen"></i> Input</h3></div>
        <p style="font-size:.85rem;margin-bottom:10px;">${message}</p>
        <textarea id="promptActionInput" placeholder="${placeholder}" style="width:100%;min-height:90px;padding:10px;border:1.5px solid var(--border);border-radius:10px;"></textarea>
        <div class="modal-actions">
          <button class="btn-secondary" id="paCancel">Batal</button>
          <button class="btn-primary" id="paOk">${okLabel}</button>
        </div>
      </div>
    `
    const done = (v) => { bg.remove(); resolve(v) }
    bg.querySelector('#paCancel')?.addEventListener('click', () => done(null))
    bg.querySelector('#paOk')?.addEventListener('click', () => done(bg.querySelector('#promptActionInput')?.value ?? ''))
    bg.addEventListener('click', e => { if (e.target === bg) done(null) })
    document.body.appendChild(bg)
  })
}
