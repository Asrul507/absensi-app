import { supabase } from './supabase.js'

export const DEPARTMENT_SCOPED_ROLES = ['admin', 'spv', 'supervisor']

export function canAccessAllDepartments(user) {
  return user?.role === 'super_admin'
}

export function getUserDepartment(user) {
  return String(user?.departemen || user?.department || '').trim()
}

export function isDepartmentScopedRole(user) {
  return DEPARTMENT_SCOPED_ROLES.includes(user?.role)
}

export function canManageUserByDepartment(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false
  if (canAccessAllDepartments(currentUser)) return true
  if (currentUser.id && targetUser.id && currentUser.id === targetUser.id) return true
  if (!isDepartmentScopedRole(currentUser)) return false

  const currentDepartment = getUserDepartment(currentUser).toLowerCase()
  const targetDepartment = getUserDepartment(targetUser).toLowerCase()
  return Boolean(currentDepartment && targetDepartment && currentDepartment === targetDepartment)
}

export function assertSameDepartment(currentUser, targetUser) {
  if (!canManageUserByDepartment(currentUser, targetUser)) {
    throw new Error('Anda tidak memiliki akses ke data departemen lain.')
  }
  return true
}

export async function getAccessibleProfiles(currentUser, { activeOnly = true, select = 'id, nama_lengkap, departemen, role, status_akun' } = {}) {
  if (!currentUser) return []

  let query = supabase.from('profiles').select(select).order('nama_lengkap')
  if (activeOnly) query = query.eq('status_akun', 'Aktif')

  if (canAccessAllDepartments(currentUser)) {
    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  if (isDepartmentScopedRole(currentUser)) {
    const department = getUserDepartment(currentUser)
    if (!department) return []
    const { data, error } = await query.eq('departemen', department)
    if (error) throw error
    return data || []
  }

  const { data, error } = await query.eq('id', currentUser.id)
  if (error) throw error
  return data || []
}

export async function getProfileForAccess(userId, select = 'id, nama_lengkap, departemen, role, status_akun') {
  if (!userId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select(select)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export function buildDepartmentScopeInfo(user) {
  if (canAccessAllDepartments(user)) return 'Anda mengelola semua departemen.'
  const department = getUserDepartment(user)
  return department ? `Anda mengelola departemen: ${department}.` : 'Departemen akun Anda belum diatur.'
}

export async function getProfileForAccessByName(name, select = 'id, nama_lengkap, departemen, role, status_akun') {
  const cleanName = String(name || '').trim()
  if (!cleanName) return null
  const { data, error } = await supabase
    .from('profiles')
    .select(select)
    .eq('nama_lengkap', cleanName)
    .maybeSingle()
  if (error) throw error
  return data || null
}
