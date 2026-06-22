function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]))
}

function formatDateTime(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return String(value)
  }
}

function actionLabel(action) {
  if (action === 'approve_attendance') return { text: 'Approve Absensi', color: '#166534', bg: '#dcfce7', icon: 'fa-check' }
  if (action === 'reject_attendance') return { text: 'Reject Absensi', color: '#991b1b', bg: '#fee2e2', icon: 'fa-times' }
  return { text: action || '-', color: '#1d4ed8', bg: '#dbeafe', icon: 'fa-clock-rotate-left' }
}

function getAfterStatus(row) {
  const after = row?.after_data || {}
  return after.status_absensi || after.status_kehadiran || '-'
}

function getEmployeeName(row) {
  const after = row?.after_data || {}
  const before = row?.before_data || {}
  return after.nama || before.nama || row?.actor_name || '-'
}

async function renderApprovalAuditPanel() {
  const approvalList = document.getElementById('approvalList')
  if (!approvalList || !window.supabase) return

  let panel = document.getElementById('attendanceApprovalAuditPanel')
  if (!panel) {
    panel = document.createElement('div')
    panel.id = 'attendanceApprovalAuditPanel'
    panel.className = 'card fade-up'
    panel.style.cssText = 'padding:16px;margin-top:14px;'
    approvalList.insertAdjacentElement('afterend', panel)
  }

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
      <div>
        <div style="font-size:.78rem;font-weight:900;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Riwayat Approval Absensi</div>
        <div style="font-size:.74rem;color:var(--text-muted);margin-top:3px;">Menampilkan 10 audit log approval/reject terbaru.</div>
      </div>
      <button class="btn-secondary btn-sm" onclick="window.refreshAttendanceApprovalAudit?.()"><i class="fa fa-refresh"></i> Refresh Riwayat</button>
    </div>
    <div style="text-align:center;padding:18px;color:var(--text-muted);font-size:.84rem;"><i class="fa fa-spinner fa-spin"></i> Memuat riwayat...</div>
  `

  try {
    const { data, error } = await window.supabase
      .from('audit_logs')
      .select('id,action,entity_type,entity_id,actor_name,actor_role,before_data,after_data,metadata,created_at')
      .eq('entity_type', 'absensi')
      .in('action', ['approve_attendance', 'reject_attendance'])
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) throw error

    const rows = data || []
    if (!rows.length) {
      panel.innerHTML = `
        <div style="font-size:.78rem;font-weight:900;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Riwayat Approval Absensi</div>
        <div style="text-align:center;padding:18px;color:var(--text-muted);font-size:.84rem;"><i class="fa fa-inbox"></i><br>Belum ada riwayat approval absensi.</div>
      `
      return
    }

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
        <div>
          <div style="font-size:.78rem;font-weight:900;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Riwayat Approval Absensi</div>
          <div style="font-size:.74rem;color:var(--text-muted);margin-top:3px;">10 audit log approval/reject terbaru.</div>
        </div>
        <button class="btn-secondary btn-sm" onclick="window.refreshAttendanceApprovalAudit?.()"><i class="fa fa-refresh"></i> Refresh Riwayat</button>
      </div>
      <div style="display:grid;gap:10px;">
        ${rows.map(row => {
          const label = actionLabel(row.action)
          const metadata = row.metadata || {}
          return `
            <div style="border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--white);">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
                <div>
                  <div style="font-weight:900;color:var(--text);font-size:.9rem;">${escapeHtml(getEmployeeName(row))}</div>
                  <div style="font-size:.74rem;color:var(--text-muted);margin-top:3px;">Oleh: ${escapeHtml(row.actor_name || '-')} (${escapeHtml(row.actor_role || '-')}) · ${formatDateTime(row.created_at)}</div>
                </div>
                <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:${label.bg};color:${label.color};font-weight:900;font-size:.7rem;white-space:nowrap;"><i class="fa ${label.icon}"></i>${label.text}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px;font-size:.78rem;color:var(--text-muted);">
                <div><strong style="color:var(--text);">Status akhir:</strong><br>${escapeHtml(getAfterStatus(row))}</div>
                <div><strong style="color:var(--text);">Catatan:</strong><br>${escapeHtml(metadata.note || row.after_data?.approval_note || '-')}</div>
                <div><strong style="color:var(--text);">Edit jam:</strong><br>${metadata.edited_waktu_masuk || metadata.edited_waktu_pulang ? 'Ya' : 'Tidak'}</div>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `
  } catch (err) {
    panel.innerHTML = `
      <div style="font-size:.78rem;font-weight:900;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Riwayat Approval Absensi</div>
      <div style="padding:12px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:12px;font-size:.82rem;">
        Gagal memuat audit log: ${escapeHtml(err.message)}
      </div>
    `
  }
}

window.refreshAttendanceApprovalAudit = renderApprovalAuditPanel

function installApprovalAuditHook() {
  const original = window.loadAttendanceApproval
  if (typeof original !== 'function' || original.__auditPanelWrapped) return

  const wrapped = async function (...args) {
    const result = await original.apply(this, args)
    await renderApprovalAuditPanel()
    return result
  }
  wrapped.__auditPanelWrapped = true
  window.loadAttendanceApproval = wrapped
}

installApprovalAuditHook()
setTimeout(installApprovalAuditHook, 500)
setTimeout(installApprovalAuditHook, 1500)
