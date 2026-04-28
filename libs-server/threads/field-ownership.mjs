// Field-ownership classifier for thread metadata writes.
//
// Three classes drive the rules:
//   session-owned: writable only by the active lease holder
//   lifecycle:     writable on the lease holder; cross-machine writes redirect
//   analyzer:      writable by any machine when no active lease; redirect when held
//
// During shadow mode (config.thread_config.field_ownership_enforce !== true),
// `check_writable` always returns { allowed: true } and emits telemetry on the
// would-block decision. When the in-memory rolling-hour window crosses the
// hardcoded 5/hour threshold, a Discord alert fires (cooldown one hour).
//
// The 5/hour threshold lives in this file rather than config because it is a
// transient knob for the shadow-to-enforce transition, not a deployment-boundary
// value. Once enforcement flips on (Phase 3), the alert path is dead code.

import os from 'os'
import fs from 'fs'
import path from 'path'
import debug from 'debug'

import config from '#config'

const log = debug('threads:field-ownership')

const SESSION_OWNED_FIELDS = new Set([
  'session_status',
  'external_session',
  'execution',
  'started_at',
  'ended_at',
  'latest_timeline_entry',
  'message_count',
  'working_directory'
])

const LIFECYCLE_FIELDS = new Set([
  'thread_state',
  'archive_reason',
  'archived_at'
])

const ANALYZER_FIELDS = new Set([
  'title',
  'short_description',
  'tags',
  'relations',
  'prompt_properties'
])

const VIOLATION_THRESHOLD_PER_HOUR = 5
const ROLLING_WINDOW_MS = 60 * 60 * 1000
const ALERT_COOLDOWN_MS = 60 * 60 * 1000

const _violation_window = []
let _last_discord_alert_ms = 0

export const classify_field = (field) => {
  if (SESSION_OWNED_FIELDS.has(field)) return 'session-owned'
  if (LIFECYCLE_FIELDS.has(field)) return 'lifecycle'
  if (ANALYZER_FIELDS.has(field)) return 'analyzer'
  return 'unknown'
}

const _is_enforce_mode = () =>
  config.thread_config?.field_ownership_enforce === true

const _send_discord_alert = async ({ count, field, reason }) => {
  const webhook = config.job_tracker?.discord_webhook_url
  if (!webhook) return
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: 'Field-ownership violations exceeding threshold',
            description: `${count} violations in the last hour (latest field=\`${field}\`, reason=${reason})`,
            color: 15105570,
            fields: [
              { name: 'Server', value: os.hostname(), inline: true },
              {
                name: 'Threshold',
                value: `${VIOLATION_THRESHOLD_PER_HOUR}/hour`,
                inline: true
              }
            ],
            timestamp: new Date().toISOString()
          }
        ]
      }),
      signal: AbortSignal.timeout(10000)
    })
  } catch (error) {
    log('discord alert failed: %s', error.message)
  }
}

const _append_violation_sink = (entry) => {
  const base_dir = config.user_base_directory
  if (!base_dir) return
  try {
    const sink_path = path.join(base_dir, 'data', 'field-ownership-violations.jsonl')
    fs.mkdirSync(path.dirname(sink_path), { recursive: true })
    fs.appendFileSync(sink_path, JSON.stringify(entry) + '\n')
  } catch (error) {
    log('violation sink write failed: %s', error.message)
  }
}

const _record_violation = ({ field, current_machine, lease_state, op, reason }) => {
  const now = Date.now()
  _violation_window.push(now)
  while (
    _violation_window.length > 0 &&
    now - _violation_window[0] > ROLLING_WINDOW_MS
  ) {
    _violation_window.shift()
  }
  const klass = classify_field(field)
  log(
    'field_ownership_violation field=%s class=%s reason=%s machine=%s lease_holder=%s op=%s',
    field,
    klass,
    reason,
    current_machine,
    lease_state?.machine_id || 'none',
    op
  )
  _append_violation_sink({
    ts: new Date(now).toISOString(),
    event: 'field_ownership_violation',
    field,
    class: klass,
    reason,
    op,
    machine: current_machine,
    lease_holder: lease_state?.machine_id || null,
    host: os.hostname()
  })
  if (
    _violation_window.length >= VIOLATION_THRESHOLD_PER_HOUR &&
    now - _last_discord_alert_ms > ALERT_COOLDOWN_MS
  ) {
    _last_discord_alert_ms = now
    _send_discord_alert({
      count: _violation_window.length,
      field,
      reason
    })
  }
}

const _foreign_lease_blocks = ({ lease_state, current_machine }) =>
  Boolean(lease_state) && lease_state.machine_id !== current_machine

export const check_writable = ({
  field,
  current_machine,
  lease_state = null,
  op = 'patch',
  caller_flag = {}
}) => {
  if (op === 'create') return { allowed: true, reason: 'create-exempt' }
  if (caller_flag.bulk_import === true) {
    return { allowed: true, reason: 'bulk-import-exempt' }
  }
  // Terminal lifecycle writes (e.g. job-worker marking a failed job's
  // session_status='failed' after acquire_lease itself failed) cannot
  // hold a lease by definition. Exempting them is a prerequisite for
  // enabling field_ownership_enforce.
  if (caller_flag.terminal_lifecycle === true) {
    return { allowed: true, reason: 'terminal-lifecycle-exempt' }
  }

  const klass = classify_field(field)
  let allowed = true
  let reason = `${klass}-default-allow`

  if (klass === 'session-owned') {
    if (!lease_state || lease_state.machine_id !== current_machine) {
      allowed = false
      reason = 'session-owned-without-local-lease'
    } else {
      reason = 'session-owned-with-local-lease'
    }
  } else if (klass === 'lifecycle' || klass === 'analyzer') {
    if (_foreign_lease_blocks({ lease_state, current_machine })) {
      allowed = false
      reason = `${klass}-redirect-to-owner`
    } else {
      reason = `${klass}-allowed`
    }
  } else {
    return { allowed: true, reason: 'unknown-class-default-allow' }
  }

  if (allowed) return { allowed: true, reason }

  if (!_is_enforce_mode()) {
    _record_violation({ field, current_machine, lease_state, op, reason })
    return { allowed: true, reason: `shadow:${reason}` }
  }
  return { allowed: false, reason }
}

export const _reset_violation_state_for_tests = () => {
  _violation_window.length = 0
  _last_discord_alert_ms = 0
}
