import { supabase } from './supabase.js'

let auditFeatureUnavailable = false

function getActor() {
  const u = window.currentUser || {}
  return {
    actor_id: u.id || null,
    actor_name: u.nama_lengkap || u.email || 'System',
    actor_role: u.role || null
  }
}

function isAuditTableMissingError(err) {
  if (!err) return false
  const msg = String(err.message || '').toLowerCase()
  return err.code === '42P01' || msg.includes("could not find the table 'public.audit_logs'") || msg.includes('relation "audit_logs" does not exist')
}

export async function logAuditEvent({ action, entityType, entityId, before = null, after = null, metadata = null }) {
  if (auditFeatureUnavailable) return

  try {
    const actor = getActor()
    const payload = {
      ...actor,
      action,
      entity_type: entityType,
      entity_id: String(entityId || ''),
      before_data: before,
      after_data: after,
      metadata,
      created_at: new Date().toISOString()
    }

    const { error } = await supabase.from('audit_logs').insert([payload])
    if (!error) return

    if (isAuditTableMissingError(error)) {
      auditFeatureUnavailable = true
      console.info('Audit trail nonaktif: tabel public.audit_logs belum dibuat.')
      return
    }

    console.warn('audit_logs insert gagal:', error.message)
  } catch (err) {
    console.warn('logAuditEvent error:', err.message)
  }
}

export async function fetchAuditTimeline(entityType, entityId) {
  if (auditFeatureUnavailable) return []

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', String(entityId))
    .order('created_at', { ascending: false })
    .limit(20)

  if (!error) return data || []

  if (isAuditTableMissingError(error)) {
    auditFeatureUnavailable = true
    return []
  }

  throw error
}
