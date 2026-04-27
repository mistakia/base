import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import debug from 'debug'

const log = debug('content-review:privacy-filter-client')
const exec_file = promisify(execFile)

const DEFAULT_PORT = 8102
const DEFAULT_TIMEOUT_MS = 30000
const ENSURE_TIMEOUT_MS = 180000
const RETRY_DELAY_MS = 1000

let _ensured = false
let _ensure_promise = null

/**
 * Reset module state. Test-only.
 */
export function _reset_for_tests() {
  _ensured = false
  _ensure_promise = null
}

async function ensure_backend({ ensure_timeout_ms = ENSURE_TIMEOUT_MS } = {}) {
  if (_ensured) return
  if (_ensure_promise) return _ensure_promise
  log('ensuring privacy-filter backend via base CLI')
  _ensure_promise = exec_file('base', ['inference', 'ensure', 'privacy-filter'], {
    timeout: ensure_timeout_ms
  })
    .then(() => {
      _ensured = true
    })
    .finally(() => {
      _ensure_promise = null
    })
  return _ensure_promise
}

async function post_classify({ port, text, score_threshold, timeout_ms }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout_ms)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, score_threshold }),
      signal: controller.signal
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`privacy-filter HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function is_econn_refused(err) {
  if (!err) return false
  if (err.code === 'ECONNREFUSED') return true
  const cause = err.cause
  if (cause && cause.code === 'ECONNREFUSED') return true
  // Bun's fetch surfaces connection refusals as a TypeError with this message
  const msg = err.message || ''
  if (/ECONNREFUSED|Unable to connect|connection refused/i.test(msg)) return true
  return false
}

/**
 * Classify text via the privacy-filter sidecar. Idempotent ensure on first
 * call per process; one retry on ECONNREFUSED to ride out the race between
 * `base inference ensure` returning and the port being fully bound.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {number} [opts.score_threshold=0.0]
 * @param {number} [opts.port=8102]
 * @param {number} [opts.timeout_ms=30000]
 * @returns {Promise<{spans:Array, labels_found:string[], tokens:number, latency_ms:number, backend:string, model:string, model_revision?:string}>}
 */
export async function classify_text({
  text,
  score_threshold = 0.0,
  port = DEFAULT_PORT,
  timeout_ms = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof text !== 'string') {
    throw new TypeError('classify_text: text must be a string')
  }

  await ensure_backend()

  try {
    return await post_classify({ port, text, score_threshold, timeout_ms })
  } catch (err) {
    if (!is_econn_refused(err)) throw err
    log('ECONNREFUSED on first attempt, retrying after %dms', RETRY_DELAY_MS)
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    return await post_classify({ port, text, score_threshold, timeout_ms })
  }
}
