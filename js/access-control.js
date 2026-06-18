import { supabase } from './supabase.js'

export const ROLES = Object.freeze(['super_admin', 'admin_all', 'admin_hr', 'admin', 'staff'])
export const TENANT_ADMIN_ROLES = Object.freeze(['admin_all', 'admin_hr'])
export const DEPARTMENT_SCOPED_ROLES = Object.freeze(['admin'])

export function normalizeRole(role) {
  const value = String(role || 'staff').trim().toLowerCase()
  if (value === 'hr') return 'admin_hr'
  if (value === 'spv' || value === 'supervisor') return 'admin'
  return ROLES.includes(value) ? value : 'staff'
}

export function isLegacyRole(role) {
  return ['hr', 'spv', 'supervisor'].includes(String(role || '').trim().toLowerCase())
}

export async function getCurrentUserProfile() {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*, clients:client_id(id,nama_client,kode_client,domain_login,status), departments:department_id(id,nama_department,status)')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  return data ? { ...data, role: normalizeRole(data.role) } : null
}

export function getCurrentClientId(user = window.currentUser) { return user?.client_id || null }
export function getCurrentDepartmentId(user = window.currentUser) { return user?.department_id || null }
export function isSuperAdmin(user = window.currentUser) { return normalizeRole(user?.role) === 'super_admin' }
export function isAdminAll(user = window.currentUser) { return normalizeRole(user?.role) === 'admin_all' }
export function isAdminHR(user = window.currentUser) { return normalizeRole(user?.role) === 'admin_hr' }
export function isAdmin(user = window.currentUser) { return normalizeRole(user?.role) === 'admin' }
export function isStaff(user = window.currentUser) { return normalizeRole(user?.role) === 'staff' }

export function canAccessClient(targetClientId, user = window.currentUser) {
  if (!user) return false
  if (isSuperAdmin(user)) return true
  return Boolean(targetClientId && user.client_id && String(targetClientId) === String(user.client_id))
}

export function canAccessDepartment(targetDepartmentId, user = window.currentUser) {
  if (!user) return false
  if (isSuperAdmin(user) || isAdminAll(user) || isAdminHR(user)) return canAccessClient(user.client_id, user)
  if (isAdmin(user)) return Boolean(targetDepartmentId && user.department_id && String(targetDepartmentId) === String(user.department_id))
  return false
}

export function getUserScope(user = window.currentUser) {
  const role = normalizeRole(user?.role)
  const tenantContext = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('tenantContext') || '{}') : {}
  if (role === 'super_admin') {
    if (tenantContext?.mode === 'client' && tenantContext?.client_id) return { role, type: 'client', client_id: tenantContext.client_id, super_admin_context: true }
    return { role, type: 'global' }
  }
  if (role === 'admin_all' || role === 'admin_hr') return { role, type: 'client', client_id: user?.client_id || null }
  if (role === 'admin') return { role, type: 'department', client_id: user?.client_id || null, department_id: user?.department_id || null, departemen: getUserDepartment(user) }
  return { role, type: 'self', client_id: user?.client_id || null, user_id: user?.id || null }
}

export function applyTenantFilter(query, options = {}) {
  const user = options.user || window.currentUser
  const scope = getUserScope(user)
  const userColumn = options.userColumn || 'user_id'
  const clientColumn = options.clientColumn || 'client_id'
  const departmentColumn = options.departmentColumn || 'department_id'
  const legacyDepartmentColumn = options.legacyDepartmentColumn || null
  const enforceDepartment = options.enforceDepartment !== false
  const enforceSelf = options.enforceSelf !== false
  if (!query || !user) return query
  if (scope.type === 'global') return query
  if (scope.client_id && clientColumn) query = query.eq(clientColumn, scope.client_id)
  if (scope.type === 'department' && enforceDepartment) {
    if (scope.department_id && departmentColumn) query = query.eq(departmentColumn, scope.department_id)
    else if (scope.departemen && legacyDepartmentColumn) query = query.eq(legacyDepartmentColumn, scope.departemen)
  }
  if (scope.type === 'self' && enforceSelf && scope.user_id && userColumn) query = query.eq(userColumn, scope.user_id)
  return query
}

export function requireRole(allowedRoles, user = window.currentUser) {
  const allowed = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]).map(normalizeRole)
  if (!allowed.includes(normalizeRole(user?.role))) throw new Error('Anda tidak memiliki akses untuk aksi ini.')
  return true
}

export function canAccessAllDepartments(user) { return isSuperAdmin(user) || isAdminAll(user) || isAdminHR(user) }
export function getUserDepartment(user) { return String(user?.departemen || user?.department || user?.departments?.nama_department || '').trim() }
export function isDepartmentScopedRole(user) { return isAdmin(user) }

export function canManageUserByDepartment(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false
  if (isSuperAdmin(currentUser)) return true
  if (currentUser.id && targetUser.id && currentUser.id === targetUser.id) return true
  if ((isAdminAll(currentUser) || isAdminHR(currentUser)) && canAccessClient(targetUser.client_id || currentUser.client_id, currentUser)) return true
  if (!isAdmin(currentUser)) return false
  if (currentUser.department_id && targetUser.department_id) return String(currentUser.department_id) === String(targetUser.department_id)
  const a = getUserDepartment(currentUser).toLowerCase(); const b = getUserDepartment(targetUser).toLowerCase()
  return Boolean(a && b && a === b)
}

export function assertSameDepartment(currentUser, targetUser) {
  if (!canManageUserByDepartment(currentUser, targetUser)) throw new Error('Anda tidak memiliki akses ke data departemen/client lain.')
  return true
}

export async function getAccessibleProfiles(currentUser, { activeOnly = true, select = 'id, nama_lengkap, departemen, department_id, client_id, role, status_akun' } = {}) {
  if (!currentUser) return []
  let query = supabase.from('profiles').select(select).order('nama_lengkap')
  if (activeOnly) query = query.eq('status_akun', 'Aktif')
  query = applyTenantFilter(query, { user: currentUser, userColumn: 'id', legacyDepartmentColumn: 'departemen' })
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(row => ({ ...row, role: normalizeRole(row.role) }))
}

export async function getProfileForAccess(userId, select = 'id, nama_lengkap, departemen, department_id, client_id, role, status_akun') {
  if (!userId) return null
  let query = supabase.from('profiles').select(select).eq('id', userId)
  query = applyTenantFilter(query, { userColumn: 'id', legacyDepartmentColumn: 'departemen' })
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? { ...data, role: normalizeRole(data.role) } : null
}

export function buildDepartmentScopeInfo(user) {
  const scope = getUserScope(user)
  if (scope.type === 'global') return 'Anda mengelola semua client dan departemen.'
  if (scope.type === 'client') return `Anda mengelola client: ${user?.clients?.nama_client || user?.nama_client || user?.client_id || '-'}.`
  if (scope.type === 'department') return `Anda mengelola departemen: ${getUserDepartment(user) || user?.department_id || '-'}.`
  return 'Anda hanya dapat mengakses data pribadi.'
}

export async function getProfileForAccessByName(name, select = 'id, nama_lengkap, departemen, department_id, client_id, role, status_akun') {
  const cleanName = String(name || '').trim()
  if (!cleanName) return null
  let query = supabase.from('profiles').select(select).eq('nama_lengkap', cleanName)
  query = applyTenantFilter(query, { legacyDepartmentColumn: 'departemen' })
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? { ...data, role: normalizeRole(data.role) } : null
}
