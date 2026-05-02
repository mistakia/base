// Dedupe gate for THREAD_UPDATED WebSocket emits.
//
// Both the PUT session-status route and the thread watcher write to
// metadata.json and then emit THREAD_UPDATED. When the writer and the watcher
// race for the same change, or when @parcel/watcher fires multiple events for
// a single atomic rename, clients see 2-5 redundant emits per transition,
// which restarts the active-indicator pulse animation and triggers visible
// flicker.
//
// This helper compares the current payload's client-rendered fields against
// the previous emit's signature for the same thread_id. If nothing the client
// renders has changed, the WebSocket emit is suppressed. The metadata.json
// write itself is unaffected.
//
// IMPORTANT: any addition to the THREAD_UPDATED payload that the client
// renders MUST be added to CLIENT_RENDERED_FIELDS explicitly. PRs that extend
// the payload without updating this list should be rejected by reviewers.
//
// Cache-cold restart behavior is intentionally non-persistent: on base-api
// restart each thread emits one extra THREAD_UPDATED on its first watcher
// event because the cache has no prior signature. Accepted; do not add disk
// persistence.

const CLIENT_RENDERED_FIELDS = Object.freeze([
  'session_status',
  'thread_state',
  'title',
  'short_description',
  'prompt_snippet',
  'working_directory',
  'message_count',
  'user_message_count',
  'assistant_message_count',
  'tool_call_count',
  'models',
  'updated_at'
])

const TTL_MS = 60 * 60 * 1000

// Sample-based eviction: only walk the cache once per ~256 emits to keep the
// hot path O(1) on average. Walking on every call is O(n) per emit and starts
// to matter under heavy lifecycle traffic.
const EVICTION_SAMPLE_INTERVAL = 256

// Map<thread_id, { signature: string, last_emit_ms: number }>
const last_emit_by_thread = new Map()
let emit_call_count = 0

const compute_signature = (payload) => {
  const fields = {}
  for (const key of CLIENT_RENDERED_FIELDS) {
    fields[key] = payload?.[key] ?? null
  }
  return JSON.stringify(fields)
}

const evict_expired = (now_ms) => {
  for (const [thread_id, entry] of last_emit_by_thread.entries()) {
    if (now_ms - entry.last_emit_ms > TTL_MS) {
      last_emit_by_thread.delete(thread_id)
    }
  }
}

export const should_emit_thread_updated = ({ thread_id, payload }) => {
  if (!thread_id) return true

  const now_ms = Date.now()
  emit_call_count = (emit_call_count + 1) % EVICTION_SAMPLE_INTERVAL
  if (emit_call_count === 0) evict_expired(now_ms)

  const signature = compute_signature(payload)
  const prior = last_emit_by_thread.get(thread_id)

  if (prior && prior.signature === signature) {
    return false
  }

  last_emit_by_thread.set(thread_id, { signature, last_emit_ms: now_ms })
  return true
}

// Test helpers -- not part of the public production surface.
export const __reset_dedupe_cache_for_tests = () => {
  last_emit_by_thread.clear()
  emit_call_count = 0
}

export const __set_dedupe_entry_for_tests = ({
  thread_id,
  signature,
  last_emit_ms
}) => {
  last_emit_by_thread.set(thread_id, { signature, last_emit_ms })
}

export { CLIENT_RENDERED_FIELDS, TTL_MS as DEDUPE_TTL_MS }
