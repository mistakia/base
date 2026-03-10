import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import config from '#config'

const log = debug('jobs:buffer')

const MAX_DRAIN_ENTRIES = 10

const get_default_buffer_path = () =>
  path.join(config.user_base_directory || '', 'tmp', 'pending-job-reports.jsonl')

// Serializes concurrent drain calls to prevent read-modify-write races
let drain_promise = null

/**
 * Append a job report payload to the local JSONL buffer file.
 * Creates the file and parent directory if needed.
 *
 * @param {Object} params
 * @param {Object} params.payload - Job report payload to buffer
 * @param {string} [params.buffer_path] - Override buffer file path
 */
export const buffer_report = async ({
  payload,
  buffer_path = get_default_buffer_path()
}) => {
  await fs.mkdir(path.dirname(buffer_path), { recursive: true })
  const line = JSON.stringify(payload) + '\n'
  await fs.appendFile(buffer_path, line, 'utf-8')
  log('Buffered report: %s', payload.job_id)
}

/**
 * Drain the buffer by sending each buffered report via the provided report function.
 * Reports that fail are kept in the buffer; the file is deleted when all succeed.
 *
 * @param {Object} params
 * @param {string} [params.buffer_path] - Override buffer file path
 * @param {Function} params.report_fn - Async function that accepts a payload and returns { success }
 */
export const drain_buffer = (opts) => {
  if (drain_promise) {
    return drain_promise
  }
  drain_promise = do_drain(opts).finally(() => {
    drain_promise = null
  })
  return drain_promise
}

const do_drain = async ({
  buffer_path = get_default_buffer_path(),
  report_fn
}) => {
  let content
  try {
    content = await fs.readFile(buffer_path, 'utf-8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      return
    }
    throw err
  }

  const lines = content.trim().split('\n').filter(Boolean)
  if (lines.length === 0) {
    await fs.unlink(buffer_path).catch(() => {})
    return
  }

  const to_drain = lines.slice(0, MAX_DRAIN_ENTRIES)
  const deferred = lines.slice(MAX_DRAIN_ENTRIES)
  log('Draining buffer: %d of %d reports', to_drain.length, lines.length)

  const failed = []
  for (const line of to_drain) {
    let payload
    try {
      payload = JSON.parse(line)
    } catch {
      log('Skipping malformed buffer line')
      continue
    }

    try {
      const result = await report_fn(payload)
      if (!result.success) {
        failed.push(line)
      } else {
        log('Drained buffered report: %s', payload.job_id)
      }
    } catch {
      failed.push(line)
    }
  }

  const remaining = [...failed, ...deferred]
  if (remaining.length === 0) {
    await fs.unlink(buffer_path).catch(() => {})
    log('Buffer fully drained')
  } else {
    await fs.writeFile(buffer_path, remaining.join('\n') + '\n', 'utf-8')
    log('Buffer partially drained: %d remaining', remaining.length)
  }
}
