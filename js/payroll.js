import { supabase } from './supabase.js'
import { showToast, confirmAction, promptAction } from './feedback.js'
import { applyTenantFilter, getAccessibleProfiles, normalizeRole } from './access-control.js'
import { packageHasFeature } from './package-service.js'

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
const val = id => document.getElementById(id)?.value?.trim() || ''
const num = id => Number(document.getElementById(id)?.value || 0)
const clientId = () => window.currentUser?.client_id || null
const payrollRoles = Object.freeze(['admin_all', 'admin_hr'])

export function canAccessPayroll(user = window.currentUser) {
  const role = normalizeRole(user?.role)
  // Super admin SELALU bisa akses payroll, atau admin_all/admin_hr dengan paket Standard/Pro
  if (role === 'super_admin') return true
  const client = Array.isArray(user?.clients) ? user.clients[0] : user?.clients
  return payrollRoles.includes(role) && packageHasFeature(client?.package_type || 'basic', 'payroll')
}

export function canManagePayroll(user = window.currentUser) {
  return canAccessPayroll(user)
}

function scoped(query, opts = {}) { return applyTenantFilter(query, { user: window.currentUser, userColumn: null, ...opts }) }
function content() { return document.getElementById('content') }
function guard() { if (canAccessPayroll()) return true; content().innerHTML = `<div class="card"><h2><i class="fa fa-lock"></i> Payroll terkunci</h2><p>Payroll hanya tersedia untuk Admin HR/Admin All atau Super Admin dengan paket Standard/Pro.</p></div>`; return false }

async function loadComponents(activeOnly = false) {
  let q = scoped(supabase.from('payroll_components').select('*').order('sort_order').order('component_name'))
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
export async function loadPayrollTemplatesForOffice(officeId = clientId(), { activeOnly = true } = {}) {
  if (!officeId || !canAccessPayroll()) return []
  let query = supabase.from('payroll_templates').select('id,template_name,client_id,is_active').eq('client_id', officeId).order('template_name')
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data || []
}
async function loadTemplates() { return loadPayrollTemplatesForOffice(clientId(), { activeOnly: false }) }

export async function validatePayrollTemplateForOffice(templateId, officeId = clientId()) {
  if (!templateId) return null
  const { data, error } = await supabase.from('payroll_templates').select('id,template_name,client_id,is_active').eq('id', templateId).eq('client_id', officeId).maybeSingle()
  if (error) throw error
  return data || null
}

export function validateBankAccountNumber(accountNumber) {
  const value = String(accountNumber || '').trim()
  return !value || /^[0-9]{1,34}$/.test(value)
}

export async function renderPayrollEmployeeFields(prefix, employee = {}, officeId = clientId()) {
  if (!canAccessPayroll()) return ''
  const templates = await loadPayrollTemplatesForOffice(officeId)
  const payrollTypeValue = employee.payroll_type || ''
  return `<div class="field full" style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:12px;margin-top:6px;"><label style="font-weight:900;color:var(--primary);"><i class="fa fa-calculator"></i> Payroll Employee Setup</label></div>
      <div class="field"><label>Payroll Template <span class="req">*</span></label><select id="${prefix}PayrollTemplate"><option value="">-- Pilih Payroll Template --</option>${templates.map(t => `<option value="${t.id}" ${String(t.id) === String(employee.payroll_template_id || '') ? 'selected' : ''}>${esc(t.template_name)}</option>`).join('')}</select></div>
      <div class="field"><label>Tipe Penggajian</label><select id="${prefix}PayrollType"><option value="">-- Pilih Tipe --</option><option value="Harian"${payrollTypeValue === 'Harian' ? ' selected' : ''}>Harian</option><option value="Bulanan Tetap"${payrollTypeValue === 'Bulanan Tetap' ? ' selected' : ''}>Bulanan Tetap</option></select></div>
      <div class="field"><label>Gaji Harian (Rp)</label><input type="number" id="${prefix}GajiPerHari" min="0" value="${esc(String(employee.gaji_per_hari || 0))}" placeholder="0"></div>
      <div class="field"><label>Gaji Bulanan (Rp)</label><input type="number" id="${prefix}GajiPokokBulanan" min="0" value="${esc(String(employee.gaji_pokok_bulanan || 0))}" placeholder="0"></div>
    <div class="field"><label>Bank</label><input id="${prefix}BankName" list="${prefix}BankOptions" value="${esc(employee.bank_name || '')}" placeholder="BCA / Mandiri / BRI"><datalist id="${prefix}BankOptions"><option value="BCA"><option value="Mandiri"><option value="BRI"><option value="CIMB Niaga"><option value="BTN"><option value="Danamon"></datalist></div>
    <div class="field"><label>Account Number</label><input id="${prefix}BankAccountNumber" inputmode="numeric" maxlength="34" value="${esc(employee.bank_account_number || '')}" placeholder="Hanya angka, max 34 digit"></div>
    <div class="field"><label>Account Holder Name</label><input id="${prefix}BankAccountHolder" value="${esc(employee.bank_account_holder || employee.nama_lengkap || '')}" placeholder="Nama pemilik rekening"></div>`
}

export function readPayrollEmployeePayload(prefix) {
  if (!canAccessPayroll() || !document.getElementById(`${prefix}PayrollTemplate`)) return {}
  return {
    payroll_template_id: val(`${prefix}PayrollTemplate`) || null,
    payroll_type: val(`${prefix}PayrollType`) || null,
    gaji_per_hari: Number(document.getElementById(`${prefix}GajiPerHari`)?.value || 0),
    gaji_pokok_bulanan: Number(document.getElementById(`${prefix}GajiPokokBulanan`)?.value || 0),
    bank_name: val(`${prefix}BankName`) || null,
    bank_account_number: val(`${prefix}BankAccountNumber`) || null,
    bank_account_holder: val(`${prefix}BankAccountHolder`) || null,
  }
}

export async function validatePayrollEmployeePayload(payload, officeId = clientId(), { requiredTemplate = true } = {}) {
  if (!canAccessPayroll()) return true
  if (requiredTemplate && !payload.payroll_template_id) { showToast('Payroll Template wajib dipilih.', 'warning'); return false }
  if (payload.payroll_template_id && !(await validatePayrollTemplateForOffice(payload.payroll_template_id, officeId))) { showToast('Payroll Template tidak valid untuk Office ini.', 'warning'); return false }
  if (!validateBankAccountNumber(payload.bank_account_number)) { showToast('Nomor rekening hanya boleh angka maksimal 34 digit.', 'warning'); return false }
  return true
}

export async function renderPayroll(tab = 'dashboard') {
  if (!guard()) return
  const tabs = ['dashboard','components','templates','periods','processing','slips','history']
  const labels = { dashboard:'Dashboard', components:'Payroll Components', templates:'Payroll Templates', periods:'Payroll Periods', processing:'Payroll Processing', slips:'Salary Slips', history:'History' }
  content().innerHTML = `<div class="page-header"><div><h2><i class="fa fa-money-check-dollar"></i> Payroll</h2><p>Kelola komponen, template, periode, proses payroll, slip gaji, dan riwayat.</p></div></div><div class="card fade-up" style="padding:0;border:none;border-radius:0;"><div style="display:flex;gap:0;border-bottom:1px solid var(--border);">${tabs.map(t=>`<button class="tab-button ${t===tab?'active':''}" onclick="window.renderPayroll('${t}')" style="flex:1;padding:12px 14px;border:none;background:none;color:var(--text);font-weight:${t===tab?'700':'500'};border-bottom:${t===tab?'3px solid var(--primary)':'none'};cursor:pointer;transition:all .2s;">${labels[t]}</button>`).join('')}</div><div id="payrollBody" style="padding:16px;"></div></div>`
  const fn = { dashboard: renderPayrollDashboard, components: renderPayrollComponents, templates: renderPayrollTemplates, periods: renderPayrollPeriods, processing: renderPayrollProcessing, slips: renderPayrollSlips, history: renderPayrollHistory }
  await fn[tab]?.()
}

async function renderPayrollDashboard() {
  const [components, templates, periods] = await Promise.all([loadComponents(), loadTemplates(), scoped(supabase.from('payroll_periods').select('*'))])
  document.getElementById('payrollBody').innerHTML = `<div class="stats-grid"><div class="stat-card"><div class="stat-label">Komponen</div><div class="stat-value">${components.length}</div></div><div class="stat-card"><div class="stat-label">Template</div><div class="stat-value">${templates.length}</div></div><div class="stat-card"><div class="stat-label">Periode</div><div class="stat-value">${periods.data?.length || 0}</div></div></div><p style="color:var(--text-muted);font-size:.85rem;margin-top:14px;">Mulai dari Components → Templates → Periods → Processing untuk generate payroll.</p>`
}

async function renderPayrollComponents() {
  const rows = await loadComponents()
  document.getElementById('payrollBody').innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:12px;"><h3>Master Payroll Components</h3><button class="btn-primary btn-sm" onclick="window.openPayrollComponentForm()"><i class="fa fa-plus"></i> Tambah Component</button></div>${rows.map(r=>`<div class="card" style="padding:12px;margin-bottom:10px;"><div style="display:flex;justify-content:space-between;"><div><strong>${esc(r.component_name)}</strong><div style="font-size:.8rem;color:var(--text-muted);">Type: ${r.type} | Input: ${r.input_type} | Sort: ${r.sort_order}</div></div><div style="display:flex;gap:6px;"><button class="btn-secondary btn-sm" onclick="window.openPayrollComponentForm('${r.id}')"><i class="fa fa-edit"></i> Edit</button><button class="btn-danger btn-sm" onclick="window.deletePayrollComponent('${r.id}')"><i class="fa fa-trash"></i> Hapus</button></div></div></div>`).join('')}`
}
window.openPayrollComponentForm = async id => { const row = id ? (await supabase.from('payroll_components').select('*').eq('id', id).maybeSingle()).data : {}; window.showUserModal(`<div class="modal-header"><h3>${id?'Edit':'Tambah'} Payroll Component</h3><button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px;"><div class="field full" style="grid-column:1/-1;"><label>Component Code</label><input id="pcCode" value="${esc(row.code||'')}"></div><div class="field full" style="grid-column:1/-1;"><label>Component Name</label><input id="pcName" value="${esc(row.component_name||'')}"></div><div class="field"><label>Type</label><select id="pcType"><option value="Income" ${row.type==='Income'?'selected':''}>Income</option><option value="Deduction" ${row.type==='Deduction'?'selected':''}>Deduction</option></select></div><div class="field"><label>Input Type</label><select id="pcInput"><option value="Fixed Amount" ${row.input_type==='Fixed Amount'?'selected':''}>Fixed Amount</option><option value="Manual Amount" ${row.input_type==='Manual Amount'?'selected':''}>Manual Amount</option></select></div><div class="field"><label>Sort Order</label><input type="number" id="pcSort" value="${row.sort_order||0}"></div><div class="field full" style="grid-column:1/-1;"><label>Description</label><textarea id="pcDesc" style="resize:vertical;min-height:60px;">${esc(row.description||'')}</textarea></div></div><div class="modal-actions"><button class="btn-secondary" onclick="window.closeUserModal()">Batal</button><button class="btn-primary" onclick="window.savePayrollComponent('${id||''}')"><i class="fa fa-save"></i> Simpan</button></div>`) }
window.savePayrollComponent = async id => { const payload = { code: val('pcCode'), component_name: val('pcName'), type: val('pcType'), input_type: val('pcInput'), sort_order: num('pcSort'), description: val('pcDesc'), client_id: clientId() }; const q = id ? supabase.from('payroll_components').update(payload).eq('id', id) : supabase.from('payroll_components').insert(payload); const { error } = await q; if (error) showToast('Gagal simpan: '+error.message, 'error'); else { window.closeUserModal(); showToast(id?'Component updated':'Component created','success'); await renderPayrollComponents() } }
window.deletePayrollComponent = async id => { if (!(await confirmAction('Hapus komponen payroll?','Hapus'))) return; const { error } = await supabase.from('payroll_components').delete().eq('id', id); if (error) showToast('Gagal hapus: '+error.message,'error'); else { showToast('Component deleted','success'); await renderPayrollComponents() } }

async function renderPayrollTemplates() {
  const rows = await loadTemplates()
  document.getElementById('payrollBody').innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:12px;"><h3>Payroll Templates</h3><button class="btn-primary btn-sm" onclick="window.openPayrollTemplateForm()"><i class="fa fa-plus"></i> Tambah Template</button></div>${rows.map(r=>`<div class="card" style="padding:12px;margin-bottom:10px;"><div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>${esc(r.template_name)}</strong><div style="font-size:.8rem;color:var(--text-muted);">Status: ${r.is_active?'✅ Active':'⛔ Inactive'}</div></div><div style="display:flex;gap:6px;"><button class="btn-info btn-sm" onclick="window.managePayrollTemplate('${r.id}')"><i class="fa fa-cogs"></i> Manage</button><button class="btn-secondary btn-sm" onclick="window.duplicatePayrollTemplate('${r.id}')"><i class="fa fa-copy"></i> Duplicate</button><button class="btn-secondary btn-sm" onclick="window.openPayrollTemplateForm('${r.id}')"><i class="fa fa-edit"></i> Edit</button><button class="btn-danger btn-sm" onclick="window.deletePayrollTemplate('${r.id}')"><i class="fa fa-trash"></i> Hapus</button></div></div></div>`).join('')}`
}
window.openPayrollTemplateForm = async id => { const row = id ? (await supabase.from('payroll_templates').select('*').eq('id', id).maybeSingle()).data : {}; window.showUserModal(`<div class="modal-header"><h3>${id?'Edit':'Tambah'} Payroll Template</h3><button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px;"><div class="field full" style="grid-column:1/-1;"><label>Template Name</label><input id="ptName" value="${esc(row.template_name||'')}"></div><div class="field full" style="grid-column:1/-1;"><label>Description</label><textarea id="ptDesc" style="resize:vertical;min-height:60px;">${esc(row.description||'')}</textarea></div><div class="field full" style="grid-column:1/-1;"><label><input type="checkbox" id="ptActive" ${row.is_active!==false?'checked':''}> Aktif</label></div></div><div class="modal-actions"><button class="btn-secondary" onclick="window.closeUserModal()">Batal</button><button class="btn-primary" onclick="window.savePayrollTemplate('${id||''}')"><i class="fa fa-save"></i> Simpan</button></div>`) }
window.savePayrollTemplate = async id => { const payload = { template_name: val('ptName'), description: val('ptDesc'), is_active: document.getElementById('ptActive')?.checked, client_id: clientId() }; const q = id ? supabase.from('payroll_templates').update(payload).eq('id', id) : supabase.from('payroll_templates').insert(payload); const { error } = await q; if (error) showToast('Gagal simpan: '+error.message,'error'); else { window.closeUserModal(); showToast(id?'Template updated':'Template created','success'); await renderPayrollTemplates() } }
window.duplicatePayrollTemplate = async id => { const name = await promptAction('Nama template duplikat:', 'Copy Template'); if (!name) return; const { data:t } = await supabase.from('payroll_templates').select('*').eq('id',id).maybeSingle(); if (t) { const { data:newT } = await supabase.from('payroll_templates').insert({...t,id:undefined,template_name:name}).select().maybeSingle(); if (newT) { const { data:tc } = await supabase.from('payroll_template_components').select('*').eq('template_id',id); for (const c of (tc||[])) await supabase.from('payroll_template_components').insert({...c,id:undefined,template_id:newT.id}); showToast('Template duplicated','success'); await renderPayrollTemplates() } } }
window.deletePayrollTemplate = async id => { if (await confirmAction('Hapus template payroll?','Hapus')) { const { error } = await supabase.from('payroll_templates').delete().eq('id', id); if (error) showToast('Gagal hapus: '+error.message,'error'); else { showToast('Template deleted','success'); await renderPayrollTemplates() } } }
window.managePayrollTemplate = async id => { const [tc, comps] = await Promise.all([supabase.from('payroll_template_components').select('*, payroll_components(*)').eq('template_id', id).order('sort_order'), loadComponents()]); window.showUserModal(`<div class="modal-header"><h3>Manage Template Components</h3><button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button></div><div style="padding:14px;"><div style="margin-bottom:14px;"><select id="tplCompId"><option value="">-- Select Component --</option>${comps.map(c=>`<option value="${c.id}">${esc(c.component_name)}</option>`).join('')}</select> <input type="number" id="tplCompVal" placeholder="Value" style="width:100px;"> <button class="btn-primary btn-sm" onclick="window.addTemplateComponent('${id}')"><i class="fa fa-plus"></i> Add</button></div><div>${(tc.data||[]).map(c=>`<div style="padding:8px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;"><div><strong>${esc(c.payroll_components?.component_name||'-')}</strong><div style="font-size:.75rem;color:var(--text-muted);">Value: ${c.component_value}</div></div><div style="display:flex;gap:4px;"><button class="btn-secondary btn-xs" onclick="window.editTemplateComponent('${c.id}','${id}',${c.component_value})"><i class="fa fa-edit"></i></button><button class="btn-danger btn-xs" onclick="window.removeTemplateComponent('${c.id}','${id}')"><i class="fa fa-trash"></i></button></div></div>`).join('')}</div></div><div class="modal-actions"><button class="btn-secondary" onclick="window.closeUserModal()">Done</button></div>`) }
window.addTemplateComponent = async id => { const { error } = await supabase.from('payroll_template_components').insert({ template_id:id, component_id:val('tplCompId'), component_value:num('tplCompVal'), sort_order:0 }); if (error) showToast('Gagal: '+error.message,'error'); else { window.managePayrollTemplate(id) } }
window.editTemplateComponent = async (rowId, tplId, old) => { const v = await promptAction('Nilai komponen:', String(old)); if (v === null) return; const { error } = await supabase.from('payroll_template_components').update({ component_value: Number(v) }).eq('id', rowId); if (error) showToast('Gagal: '+error.message,'error'); else { window.managePayrollTemplate(tplId) } }
window.removeTemplateComponent = async (rowId, tplId) => { if (await confirmAction('Remove component?','Remove')) { await supabase.from('payroll_template_components').delete().eq('id', rowId); await window.managePayrollTemplate(tplId) } }
async function askTemplatePropagation(templateId) { const choice = await promptAction('Apply changes to: existing | new | selected. Ketik existing untuk update karyawan yang masih memakai Template ini:', 'existing'); return choice?.toLowerCase() }

async function renderPayrollPeriods() { const { data } = await scoped(supabase.from('payroll_periods').select('*').order('start_date',{ascending:false})); document.getElementById('payrollBody').innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:12px;"><h3>Payroll Periods</h3><button class="btn-primary btn-sm" onclick="window.openPayrollPeriodForm()"><i class="fa fa-plus"></i> Tambah Period</button></div>${(data||[]).map(r=>`<div class="card" style="padding:12px;margin-bottom:10px;"><div style="display:flex;justify-content:space-between;"><div><strong>${esc(r.period_name)}</strong><div style="font-size:.8rem;color:var(--text-muted);">${r.start_date} s/d ${r.end_date} | Status: ${r.status}</div></div><div style="display:flex;gap:6px;"><button class="btn-secondary btn-sm" onclick="window.openPayrollPeriodForm('${r.id}')"><i class="fa fa-edit"></i> Edit</button><button class="btn-danger btn-sm" onclick="window.deletePayrollPeriod('${r.id}')"><i class="fa fa-trash"></i> Hapus</button></div></div></div>`).join('')}` }
window.openPayrollPeriodForm = async id => { const row = id ? (await supabase.from('payroll_periods').select('*').eq('id',id).maybeSingle()).data : {}; window.showUserModal(`<div class="modal-header"><h3>${id?'Edit':'Tambah'} Payroll Period</h3><button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px;"><div class="field full" style="grid-column:1/-1;"><label>Period Name</label><input id="ppName" value="${esc(row.period_name||'')}"></div><div class="field"><label>Start Date</label><input type="date" id="ppStart" value="${row.start_date||''}"></div><div class="field"><label>End Date</label><input type="date" id="ppEnd" value="${row.end_date||''}"></div><div class="field full" style="grid-column:1/-1;"><label>Status</label><select id="ppStatus"><option ${row.status==='Draft'?'selected':''}>Draft</option><option ${row.status==='Processing'?'selected':''}>Processing</option><option ${row.status==='Approved'?'selected':''}>Approved</option><option ${row.status==='Paid'?'selected':''}>Paid</option><option ${row.status==='Closed'?'selected':''}>Closed</option></select></div></div><div class="modal-actions"><button class="btn-secondary" onclick="window.closeUserModal()">Batal</button><button class="btn-primary" onclick="window.savePayrollPeriod('${id||''}')"><i class="fa fa-save"></i> Simpan</button></div>`) }
window.savePayrollPeriod = async id => { const payload = { client_id:clientId(), period_name:val('ppName'), start_date:val('ppStart'), end_date:val('ppEnd'), status:val('ppStatus') }; const q = id ? supabase.from('payroll_periods').update(payload).eq('id', id) : supabase.from('payroll_periods').insert(payload); const { error } = await q; if (error) showToast('Gagal simpan: '+error.message,'error'); else { window.closeUserModal(); showToast(id?'Period updated':'Period created','success'); await renderPayrollPeriods() } }
window.deletePayrollPeriod = async id => { if (await confirmAction('Hapus periode?','Hapus')) { const { error } = await supabase.from('payroll_periods').delete().eq('id', id); if (error) showToast('Gagal hapus: '+error.message,'error'); else { showToast('Period deleted','success'); await renderPayrollPeriods() } } }

async function renderPayrollProcessing() { const [periods, employees] = await Promise.all([scoped(supabase.from('payroll_periods').select('*').order('start_date',{ascending:false})), getAccessibleProfiles(window.currentUser)]); document.getElementById('payrollBody').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;"><div class="field"><label>Periode Payroll</label><select id="procPeriod"><option value="">-- Pilih Periode --</option>${(periods.data||[]).map(p=>`<option value="${p.id}">${esc(p.period_name)}</option>`).join('')}</select></div><div class="field"><label>Karyawan (kosongkan untuk semua)</label><select id="procEmployee"><option value="">-- Semua Karyawan --</option>${(employees||[]).map(e=>`<option value="${e.id}">${esc(e.nama_lengkap)}</option>`).join('')}</select></div></div><button class="btn-primary" onclick="window.generatePayroll()"><i class="fa fa-cogs"></i> Generate Payroll</button>` }
window.generatePayroll = async () => {
  const periodId = val('procPeriod')
  if (!periodId) { showToast('Pilih periode payroll terlebih dahulu.', 'warning'); return }
  const employeeId = val('procEmployee')
  const employees = employeeId ? [employeeId] : (await getAccessibleProfiles(window.currentUser)).map(e=>e.id)
  if (!employees.length) { showToast('Tidak ada karyawan yang bisa diproses.', 'warning'); return }
  for (const empId of employees) await generateEmployeePayroll(periodId, empId)
  showToast('Payroll generated','success')
  await renderPayrollProcessing()
}
async function generateEmployeePayroll(periodId, employeeId) {
  const [{ data: comps, error: compsError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.from('employee_payroll_components').select('*, payroll_components(*)').eq('employee_id', employeeId),
    supabase.from('profiles').select('payroll_type,gaji_per_hari,gaji_pokok_bulanan').eq('id', employeeId).maybeSingle()
  ])
  if (compsError) throw new Error(`Gagal mengambil komponen payroll karyawan: ${compsError.message}`)
  if (profileError) throw new Error(`Gagal mengambil profil payroll karyawan: ${profileError.message}`)

  const detailRows = (comps || [])
    .filter(c => c?.payroll_components?.type === 'Income' || c?.payroll_components?.type === 'Deduction')
    .map(c => ({
      component_id: c.component_id,
      component_name: c.payroll_components?.component_name || 'Komponen Payroll',
      type: c.payroll_components?.type,
      source: c.is_override ? 'Override' : 'Template',
      amount: Number(c.component_value || 0)
    }))

  const hasIncomeDetail = detailRows.some(d => d.type === 'Income')
  const payrollType = String(profile?.payroll_type || '')
  if (!hasIncomeDetail) {
    if (payrollType === 'Harian' && Number(profile?.gaji_per_hari || 0) > 0) {
      detailRows.push({ component_id: null, component_name: 'Gaji Harian', type: 'Income', source: 'System', amount: Number(profile.gaji_per_hari || 0) })
    } else if (payrollType === 'Bulanan Tetap' && Number(profile?.gaji_pokok_bulanan || 0) > 0) {
      detailRows.push({ component_id: null, component_name: 'Gaji Pokok Bulanan', type: 'Income', source: 'System', amount: Number(profile.gaji_pokok_bulanan || 0) })
    }
  }

  const totalIncome = detailRows.filter(d => d.type === 'Income').reduce((s, d) => s + Number(d.amount || 0), 0)
  const totalDeduction = detailRows.filter(d => d.type === 'Deduction').reduce((s, d) => s + Number(d.amount || 0), 0)
  const { data: existing, error: existingError } = await supabase.from('payroll_runs').select('id').eq('period_id', periodId).eq('employee_id', employeeId).maybeSingle()
  if (existingError) throw existingError
  const payload = { period_id: periodId, employee_id: employeeId, total_income: totalIncome, total_deduction: totalDeduction, net_salary: totalIncome - totalDeduction, status: 'Draft', client_id: clientId() }

  let payrollId = existing?.id || null
  if (existing?.id) {
    const { error: updateError } = await supabase.from('payroll_runs').update(payload).eq('id', existing.id)
    if (updateError) throw updateError
  } else {
    const { data: created, error: insertError } = await supabase.from('payroll_runs').insert(payload).select('id').maybeSingle()
    if (insertError) throw insertError
    payrollId = created?.id || null
  }

  if (!payrollId) return
  const { error: deleteError } = await supabase.from('payroll_run_details').delete().eq('payroll_id', payrollId)
  if (deleteError) throw deleteError
  if (!detailRows.length) return
  const { error: detailsError } = await supabase.from('payroll_run_details').insert(
    detailRows.map(row => ({ payroll_id: payrollId, ...row }))
  )
  if (detailsError) throw detailsError
}

async function renderPayrollSlips() { 
  const { data } = await scoped(supabase.from('payroll_runs').select('*, payroll_periods(period_name), profiles(nama_lengkap)').order('created_at',{ascending:false}))
  document.getElementById('payrollBody').innerHTML = `<div style="margin-bottom:14px;"><h3>Salary Slips</h3></div>${(data||[]).map(r=>`<div class="card" style="padding:12px;margin-bottom:10px;"><div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>${esc(r.profiles?.nama_lengkap||'-')} - ${esc(r.payroll_periods?.period_name||'-')}</strong><div style="font-size:.8rem;color:var(--text-muted);">Income: ${money.format(r.total_income)} | Deduction: ${money.format(r.total_deduction)} | Net: ${money.format(r.net_salary)}</div></div><div style="display:flex;gap:6px;"><button class="btn-info btn-sm" onclick="window.viewSalarySlip('${r.id}')"><i class="fa fa-eye"></i> View</button></div></div></div>`).join('')}`
}
window.viewSalarySlip = async id => { const { data:r } = await supabase.from('payroll_runs').select('*, payroll_periods(period_name), profiles(nama_lengkap), payroll_run_details(*)').eq('id',id).maybeSingle(); if (!r) return; window.showUserModal(`<div class="modal-header"><h3>Salary Slip: ${esc(r.profiles?.nama_lengkap)} - ${esc(r.payroll_periods?.period_name)}</h3><button class="modal-close" onclick="window.closeUserModal()"><i class="fa fa-times"></i></button></div><div style="padding:14px;"><table style="width:100%;"><tr><td><strong>Income:</strong></td><td style="text-align:right;">${money.format(r.total_income)}</td></tr><tr><td><strong>Deduction:</strong></td><td style="text-align:right;">${money.format(r.total_deduction)}</td></tr><tr style="border-top:2px solid var(--border);font-weight:bold;"><td>Net Salary:</td><td style="text-align:right;">${money.format(r.net_salary)}</td></tr></table><div style="margin-top:14px;"><h4>Details:</h4><div style="font-size:.8rem;">${(r.payroll_run_details||[]).map(d=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);"><span>${esc(d.component_name)}</span><span>${money.format(d.amount)}</span></div>`).join('')}</div></div></div><div class="modal-actions"><button class="btn-secondary" onclick="window.closeUserModal()">Close</button></div>`) }

async function renderPayrollHistory() { 
  const { data: periods } = await scoped(supabase.from('payroll_periods').select('*').order('start_date', {ascending: false}))
  document.getElementById('payrollBody').innerHTML = `
    <div style="margin-bottom:14px;">
      <h3>Payroll History</h3>
      <p style="color:var(--text-muted);font-size:.85rem;">Lihat dan download data payroll per periode</p>
    </div>
    ${(periods||[]).map(p => `
      <div class="card" style="padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${esc(p.period_name)}</strong>
            <div style="font-size:.8rem;color:var(--text-muted);">${p.start_date} s/d ${p.end_date} | Status: <span style="font-weight:700;">${p.status}</span></div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn-info btn-sm" onclick="window.downloadPayrollPeriodExcel('${p.id}', '${esc(p.period_name)}', this)">
              <i class="fa fa-download"></i> Download Excel
            </button>
          </div>
        </div>
      </div>
    `).join('')}
  `
}

window.downloadPayrollPeriodExcel = async (periodId, periodName, triggerEl = null) => {
  let btn = null
  let oldHtml = null
  const defaultButtonHtml = '<i class="fa fa-download"></i> Download Excel'
  try {
    if (typeof XLSX === 'undefined') {
      showToast('Library XLSX belum siap, coba lagi.', 'warning')
      return
    }

    // Tampilkan loading
    btn = triggerEl
    if (btn) oldHtml = btn.innerHTML
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...'
    }

    // Fetch payroll data
    const { data } = await scoped(
      supabase
        .from('payroll_runs')
        .select('*, payroll_periods(period_name), profiles(nama_lengkap, jabatan, departemen, bank_name, bank_account_number), payroll_run_details(*)')
        .eq('period_id', periodId)
        .order('profiles(nama_lengkap)')
    )

    if (!data || data.length === 0) {
      showToast('Tidak ada data payroll untuk periode ini', 'warning')
      if (btn) {
        btn.disabled = false
        btn.innerHTML = oldHtml || defaultButtonHtml
      }
      return
    }

    // Siapkan data untuk Excel
    const headers = ['No', 'Nama', 'Jabatan', 'Departemen', 'Bank', 'No. Rekening', 'Total Income', 'Total Deduction', 'Net Salary', 'Status']
    const rows = data.map((row, idx) => [
      idx + 1,
      row.profiles?.nama_lengkap || '-',
      row.profiles?.jabatan || '-',
      row.profiles?.departemen || '-',
      row.profiles?.bank_name || '-',
      row.profiles?.bank_account_number || '-',
      row.total_income || 0,
      row.total_deduction || 0,
      row.net_salary || 0,
      row.status || '-'
    ])

    // Buat sheet
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [
      { wch: 4 }, { wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 18 },
      { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }
    ]

    // Format currency untuk kolom income/deduction/net
    const moneyFormat = '#,##0;[Red]-#,##0'
    for (let i = 1; i <= rows.length; i++) {
      ws[`G${i+1}`].z = moneyFormat
      ws[`H${i+1}`].z = moneyFormat
      ws[`I${i+1}`].z = moneyFormat
    }

    // Buat workbook
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll')

    // Download
    const fileName = `Payroll_${periodName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)

    showToast(`Download ${data.length} payroll data berhasil!`, 'success')
    if (btn) {
      btn.disabled = false
      btn.innerHTML = oldHtml || defaultButtonHtml
    }

  } catch (err) {
    console.error('Download payroll error:', err)
    showToast('Gagal download: ' + err.message, 'error')
    if (btn) {
      btn.disabled = false
      btn.innerHTML = oldHtml || defaultButtonHtml
    }
  }
}

export async function renderEmployeePayroll(employee) { if (!guard()) return ''; const template = employee.payroll_template_id ? await validatePayrollTemplateForOffice(employee.payroll_template_id, employee.client_id) : null; const { data: comps } = await supabase.from('employee_payroll_components').select('*, payroll_components(*)').eq('employee_id', employee.id); const { data: allComps } = await supabase.from('payroll_components').select('*').eq('client_id', employee.client_id); const income = (comps?.filter(c=>c.payroll_components?.type==='Income')||[]).reduce((s,c)=>s+Number(c.component_value||0),0); const deduction = (comps?.filter(c=>c.payroll_components?.type==='Deduction')||[]).reduce((s,c)=>s+Number(c.component_value||0),0); const net = income - deduction; return `<div style="padding:12px;background:var(--gray-50);border-radius:var(--r-md);margin-bottom:12px;"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:.85rem;"><div><span style="color:var(--text-muted);">Payroll Template:</span><div style="font-weight:700;">${template?.template_name || 'Not Assigned'}</div></div><div><span style="color:var(--text-muted);">Bank:</span><div style="font-weight:700;">${employee.bank_name || '-'} (${employee.bank_account_number || '-'})</div></div><div><span style="color:var(--text-muted);">Income:</span><div style="font-weight:700;color:var(--success);">${money.format(income)}</div></div><div><span style="color:var(--text-muted);">Deduction:</span><div style="font-weight:700;color:var(--danger);">${money.format(deduction)}</div></div><div style="grid-column:1/-1;"><span style="color:var(--text-muted);">Net Salary:</span><div style="font-weight:700;font-size:1.1rem;color:var(--primary);">${money.format(net)}</div></div></div></div><div style="margin-top:12px;"><label style="font-weight:700;margin-bottom:8px;display:block;">Payroll Components:</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.8rem;"><select id="empCompId" style="grid-column:1/-1;padding:8px;"><option value="">-- Add Component --</option>${(allComps||[]).filter(c=>!(comps||[]).find(x=>x.component_id===c.id)).map(c=>`<option value="${c.id}">${esc(c.component_name)}</option>`).join('')}</select><input type="number" id="empCompVal" placeholder="Value" style="padding:8px;"><button class="btn-primary btn-xs" onclick="window.addEmployeePayrollComponent('${employee.id}')" style="grid-column:1/-1;">Add Component</button></div><div style="margin-top:10px;">${(comps||[]).map(c=>`<div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);align-items:center;"><div><strong>${esc(c.payroll_components?.component_name||'-')}</strong><div style="font-size:.7rem;color:var(--text-muted);">Value: ${c.component_value}</div></div><div style="display:flex;gap:4px;"><button class="btn-secondary btn-xs" onclick="window.editEmployeePayrollComponent('${c.id}',${c.component_value})"><i class="fa fa-edit"></i></button><button class="btn-danger btn-xs" onclick="window.deleteEmployeePayrollComponent('${c.id}','${employee.id}')"><i class="fa fa-trash"></i></button></div></div>`).join('')}</div></div></div>` }
window.assignEmployeePayrollTemplate = async employeeId => { await applyTemplateToEmployees(val('empTemplateId'), [employeeId]); showToast('Template assigned','success'); window.openDetailKaryawan(employeeId, 'payroll') }
window.addEmployeePayrollComponent = async employeeId => {
  const componentId = val('empCompId')
  if (!componentId) { showToast('Pilih komponen payroll terlebih dahulu.', 'warning'); return }
  const { error } = await supabase.from('employee_payroll_components').insert({ employee_id:employeeId, component_id:componentId, component_value:num('empCompVal'), source:'Override', is_override:true })
  if (error) { showToast('Gagal menambahkan komponen payroll: ' + error.message, 'error'); return }
  window.openDetailKaryawan(employeeId, 'payroll')
}
window.editEmployeePayrollComponent = async (id, old) => { const v = await promptAction('Override value:', String(old)); if (v === null) return; await supabase.from('employee_payroll_components').update({ component_value: Number(v), is_override: true }).eq('id', id); const empId = window._currentDetailEmployeeId; window.openDetailKaryawan(empId, 'payroll') }
window.restoreEmployeePayrollComponent = async id => { const { data:r } = await supabase.from('employee_payroll_components').select('template_component_id,employee_id').eq('id',id).single(); if (r) { const { data:tc } = await supabase.from('payroll_template_components').select('component_value').eq('id', r.template_component_id).maybeSingle(); await supabase.from('employee_payroll_components').update({ component_value: tc?.component_value||0, is_override: false }).eq('id',id) }; window.openDetailKaryawan(r.employee_id, 'payroll') }
window.deleteEmployeePayrollComponent = async (id, employeeId) => { await supabase.from('employee_payroll_components').delete().eq('id', id); window.openDetailKaryawan(employeeId, 'payroll') }

async function applyTemplateToEmployees(templateId, employeeIds = null) {
  const { data: tcs } = await supabase.from('payroll_template_components').select('*').eq('template_id', templateId)
  const ids = employeeIds || (await supabase.from('employee_payroll_profiles').select('employee_id').eq('template_id', templateId)).data?.map(r => r.employee_id) || []
  for (const employeeId of ids) {
    await supabase.from('employee_payroll_profiles').upsert({ employee_id: employeeId, template_id: templateId }, { onConflict: 'employee_id' })
    for (const c of (tcs || [])) {
      const { data: existing } = await supabase.from('employee_payroll_components').select('id,is_override').eq('employee_id', employeeId).eq('component_id', c.component_id).maybeSingle()
      if (existing?.is_override) continue
      if (existing?.id) {
        await supabase.from('employee_payroll_components').update({ template_id: templateId, template_component_id: c.id, component_value: c.component_value, source: 'Template', is_override: false }).eq('id', existing.id)
      } else {
        await supabase.from('employee_payroll_components').insert({ employee_id: employeeId, template_id: templateId, template_component_id: c.id, component_id: c.component_id, component_value: c.component_value, source: 'Template', is_override: false })
      }
    }
  }
}

function table(head, rows) { return `<div class="table-responsive"><table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${head.length}" style="text-align:center;padding:20px;color:var(--text-muted);">No data</td></tr>`}</tbody></table></div>` }

window.renderPayroll = renderPayroll
