export const ACTIVE_SESSION_STATUSES = Object.freeze([
  'queued',
  'starting',
  'active',
  'idle'
])

// Thread `session_status` -> display `status` expected by UI components.
export const SESSION_STATUS_DISPLAY_MAP = Object.freeze({
  queued: 'queued',
  starting: 'active',
  active: 'active',
  idle: 'idle'
})
