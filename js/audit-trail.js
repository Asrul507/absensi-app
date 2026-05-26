import { supabase } from './supabase.js'

function getActor() {
  const u = window.currentUser || {}
  return {
    actor_id: u.id || null,
    actor_name: u.nama_lengkap || u.email || 'System',
    actor_role: u.role || null
  }
}

export async function logAuditEvent({ action, entityType, entityId, before = null, after = null, metadata = null }) {
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
    if (error) console.warn('audit_logs insert gagal:', error.message)
  } catch (err) {
    console.warn('logAuditEvent error:', err.message)
  }
}

export async function fetchAuditTimeline(entityType, entityId) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', String(entityId))
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return data || []
}
