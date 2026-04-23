// Single source of truth for the timeline-entry `provenance` contract.
// All producers of timeline.jsonl entries import PROVENANCE constants from
// here; string literals at call sites are prohibited. The write-time assert
// in libs-server/threads/timeline/timeline-jsonl.mjs enforces that every
// persisted entry carries a valid value.

export const PROVENANCE = Object.freeze({
  SESSION_IMPORT: 'session_import',
  RUNTIME_EVENT: 'runtime_event'
})

const VALID_VALUES = new Set(Object.values(PROVENANCE))

export function is_valid_provenance(value) {
  return typeof value === 'string' && VALID_VALUES.has(value)
}

export function assert_valid_provenance(entry) {
  if (!entry || typeof entry !== 'object')
    throw new Error('assert_valid_provenance: entry must be an object')
  if (!Object.prototype.hasOwnProperty.call(entry, 'provenance'))
    throw new Error(
      `assert_valid_provenance: entry ${entry.id ?? '(no id)'} missing provenance field`
    )
  if (!is_valid_provenance(entry.provenance))
    throw new Error(
      `assert_valid_provenance: entry ${entry.id ?? '(no id)'} has invalid provenance value ${JSON.stringify(entry.provenance)}`
    )
}

// Rebuild-preservation predicate: true if an entry must survive a full
// session-derived timeline rebuild. Returns true when `provenance` is
// missing as a defensive fallback; the write-time assert guarantees every
// new entry carries a valid value.
export function must_preserve_across_rebuild(entry) {
  return entry?.provenance !== PROVENANCE.SESSION_IMPORT
}
