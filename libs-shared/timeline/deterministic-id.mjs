import { v5 as uuidv5 } from 'uuid'

// Stable namespace for timeline entry ids. Distinct from the session-id
// namespace at libs-server/threads/generate-thread-id-from-session.mjs so
// the two id spaces cannot collide, and so future namespace rotation can
// happen independently. Do not change — would invalidate every existing id.
const TIMELINE_ENTRY_NAMESPACE = '0d9c5b86-7d4f-5d59-9fd4-9b6a9b9f9c00'

// Build a deterministic uuid5 timeline entry id from stable source fields.
// Same input always produces the same id, so re-importing a raw session
// produces a byte-identical timeline.jsonl. Importers MUST call this
// instead of leaving id undefined or using v4. Runtime call sites that
// have no source key own their `uuid()` call explicitly — see
// libs-server/threads/add-timeline-entry.mjs which throws on missing id.
export function deterministic_timeline_entry_id({
  thread_id,
  timestamp,
  type,
  system_type = '',
  source_uuid = '',
  discriminator = '',
  // Accepted for backward compatibility during rollout; no longer part of key.
  // eslint-disable-next-line no-unused-vars
  sequence = ''
}) {
  if (!thread_id) throw new Error('deterministic_timeline_entry_id: thread_id required')
  if (!timestamp) throw new Error('deterministic_timeline_entry_id: timestamp required')
  if (!type) throw new Error('deterministic_timeline_entry_id: type required')
  if (!source_uuid && !discriminator) {
    throw new Error(
      'deterministic_timeline_entry_id: source_uuid or discriminator required'
    )
  }

  const ts = timestamp instanceof Date ? timestamp.toISOString() : String(timestamp)
  const key = [thread_id, ts, type, system_type, source_uuid, discriminator].join('|')
  return uuidv5(key, TIMELINE_ENTRY_NAMESPACE)
}
