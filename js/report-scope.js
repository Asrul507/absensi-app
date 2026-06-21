import { supabase } from './supabase.js'
import { normalizeRole } from './access-control.js'

export const ATTENDANCE_REPORT_SELECT = `
  *,
  profiles:user_id(
    id,
    nama_lengkap,
    username,
    client_id,
    department_id,
    departemen,
    clients:client_id(id,nama_client,kode_client,domain_login,status),
    departments:department_id(id,nama_department,status)
  )
`

export function getReportRoleScope(user) {
  const role = normalizeRole(user?.role)
  return {
    role,
    isSuperAdmin: role === 'super_admin',
    isOfficeWide: role === 'admin_all' || role === 'admin_hr',
    isDeptAdmin: role === 'admin',
    isStaff: role === 'staff'
  }
}

export function getRelatedProfile(row) {
  return Array.isArray(row?.profiles) ? row.profiles[0] : row?.profiles
}

export function getRowOffice(row) {
  const profile = getRelatedProfile(row)
  const client = Array.isArray(profile?.clients) ? profile.clients[0] : profile?.clients
  return client?.nama_client || row?.office_name || row?.nama_client || row?.client_id || '-'
}

export function getRowOfficeDomain(row) {
  const profile = getRelatedProfile(row)
  const client = Array.isArray(profile?.clients) ? profile.clients[0] : profile?.clients
  return client?.domain_login || client?.kode_client || row?.domain_login || row?.kode_client || '-'
}

export function getRowDepartment(row) {
  const profile = getRelatedProfile(row)
  const department = Array.isArray(profile?.departments) ? profile.departments[0] : profile?.departments
  return department?.nama_department || profile?.departemen || row?.departemen || row?.department_id || '-'
}

export function getRowEmployeeName(row) {
  const profile = getRelatedProfile(row)
  return profile?.nama_lengkap || row?.nama || '-'
}

export function getRowUsername(row) {
  const profile = getRelatedProfile(row)
  return profile?.username || row?.username || '-'
}

export function filterRowsByUserScope(rows, user) {
  const { role } = getReportRoleScope(user)
  const list = Array.isArray(rows) ? rows : []
  if (role === 'super_admin') return list
  if (role === 'staff') return list.filter(r => String(r.user_id || '') === String(user?.id || ''))
  if (role === 'admin_all' || role === 'admin_hr') {
    return list.filter(r => {
      const profile = getRelatedProfile(r)
      const clientId = r.client_id || profile?.client_id
      return Boolean(clientId && user?.client_id && String(clientId) === String(user.client_id))
    })
  }
  if (role === 'admin') {
    return list.filter(r => {
      const profile = getRelatedProfile(r)
      const clientId = r.client_id || profile?.client_id
      const deptId = r.department_id || profile?.department_id
      const deptName = r.departemen || profile?.departemen
      const sameClient = Boolean(clientId && user?.client_id && String(clientId) === String(user.client_id))
      const sameDeptId = Boolean(deptId && user?.department_id && String(deptId) === String(user.department_id))
      const sameDeptLegacy = Boolean(deptName && user?.departemen && String(deptName).trim().toLowerCase() === String(user.departemen).trim().toLowerCase())
      return sameClient && (sameDeptId || sameDeptLegacy)
    })
  }
  return []
}

export function applyAttendanceReportQueryScope(query, user) {
  // Staff can be safely filtered in SQL. Office/Department roles are filtered in JS
  // after joining profiles so legacy absensi rows with null client_id/department_id
  // can still be included only when their profile scope matches.
  const { role } = getReportRoleScope(user)
  if (role === 'staff') return query.eq('user_id', user.id)
  return query
}

export async function loadOfficeOptionsForReport(user) {
  const { role } = getReportRoleScope(user)
  if (role !== 'super_admin') return []
  const { data, error } = await supabase.from('clients').select('id,nama_client,kode_client,domain_login,status').order('nama_client')
  if (error) throw error
  return (data || []).filter(c => ['active', 'aktif'].includes(String(c.status || '').toLowerCase()))
}

export async function loadDepartmentOptionsForReport(user, officeId = '') {
  const { role } = getReportRoleScope(user)
  let query = supabase.from('departments').select('id,client_id,nama_department,status').order('nama_department')
  if (role === 'super_admin') {
    if (officeId) query = query.eq('client_id', officeId)
  } else if ((role === 'admin_all' || role === 'admin_hr') && user?.client_id) {
    query = query.eq('client_id', user.client_id)
  } else if (role === 'admin' && user?.department_id) {
    query = query.eq('id', user.department_id)
  } else {
    return []
  }
  const { data, error } = await query
  if (error) throw error
  return (data || []).filter(d => ['active', 'aktif'].includes(String(d.status || '').toLowerCase()))
}

export function filterRowsByReportControls(rows, { officeId = '', departmentId = '', name = '' } = {}) {
  const needle = String(name || '').trim().toLowerCase()
  return (rows || []).filter(row => {
    const profile = getRelatedProfile(row)
    const rowClientId = row.client_id || profile?.client_id || ''
    const rowDeptId = row.department_id || profile?.department_id || ''
    const employeeName = getRowEmployeeName(row).toLowerCase()
    const username = getRowUsername(row).toLowerCase()
    if (officeId && String(rowClientId) !== String(officeId)) return false
    if (departmentId && String(rowDeptId) !== String(departmentId)) return false
    if (needle && !employeeName.includes(needle) && !username.includes(needle)) return false
    return true
  })
}
