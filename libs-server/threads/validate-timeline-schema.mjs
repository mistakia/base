import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { createReadStream } from 'fs'

import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const format_ajv_errors = (errors) =>
  errors.map((e) => ({
    path: e.instancePath || '/',
    keyword: e.keyword,
    message: e.message,
    params: e.params
  }))

const build_validator = async (schema_path) => {
  const schema_raw = await fs.readFile(schema_path, 'utf8')
  const schema = JSON.parse(schema_raw)
  const item_schema = schema.items
  if (!item_schema) {
    throw new Error(`schema at ${schema_path} has no .items definition`)
  }
  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)
  return ajv.compile(item_schema)
}

const list_thread_ids = async ({ thread_dir, thread_id, sample }) => {
  if (thread_id) return [thread_id]
  const entries = await fs.readdir(thread_dir, { withFileTypes: true })
  let ids = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
  if (sample && sample > 0 && sample < ids.length) {
    for (let i = ids.length - 1; i > ids.length - 1 - sample; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
    ids = ids.slice(ids.length - sample)
  }
  return ids
}

const validate_thread = async ({
  thread_id,
  thread_dir,
  validate,
  per_thread_error_limit,
  fail_fast
}) => {
  const timeline_path = path.join(thread_dir, thread_id, 'timeline.jsonl')
  try {
    await fs.access(timeline_path)
  } catch {
    return { thread_id, entries: 0, invalid: 0, errors: [] }
  }

  const rl = readline.createInterface({
    input: createReadStream(timeline_path, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })

  const errors = []
  let entries = 0
  let invalid = 0
  let line_number = 0

  for await (const line of rl) {
    line_number++
    if (!line.trim()) continue
    entries++

    let entry
    try {
      entry = JSON.parse(line)
    } catch (err) {
      invalid++
      if (errors.length < per_thread_error_limit) {
        errors.push({
          line: line_number,
          entry_id: null,
          parse_error: err.message
        })
      }
      continue
    }

    const ok = validate(entry)
    if (!ok) {
      invalid++
      if (errors.length < per_thread_error_limit) {
        errors.push({
          line: line_number,
          entry_id: entry.id || null,
          type: entry.type || null,
          schema_version: entry.schema_version ?? 1,
          errors: format_ajv_errors(validate.errors)
        })
      }
      if (fail_fast) break
    }
  }

  return { thread_id, entries, invalid, errors }
}

const run_workers = async ({
  thread_ids,
  worker_fn,
  fail_fast,
  on_progress
}) => {
  const N = Math.min(os.cpus().length, 8)
  const queue = thread_ids.slice()
  const results = []
  let processed = 0

  const workers = Array.from({ length: N }, async () => {
    while (queue.length > 0) {
      const id = queue.shift()
      if (!id) break
      try {
        const result = await worker_fn(id)
        results.push(result)
        if (fail_fast && result.invalid > 0) return
      } catch (err) {
        results.push({
          thread_id: id,
          entries: 0,
          invalid: 0,
          errors: [{ fatal: err.message }]
        })
      }
      processed++
      if (on_progress && processed % 500 === 0) {
        on_progress(processed, thread_ids.length)
      }
    }
  })

  await Promise.all(workers)
  return results
}

/**
 * Validate thread timeline entries against the timeline JSON Schema.
 *
 * @param {Object}   params
 * @param {string}   [params.thread_id]   Single thread id; overrides enumeration.
 * @param {number}   [params.sample]      Random sample size of thread ids.
 * @param {number}   [params.limit=5]     Per-thread error cap.
 * @param {boolean}  [params.fail_fast]   Stop on the first invalid entry / thread.
 * @param {string}    params.thread_dir   Absolute path to the thread directory.
 * @param {string}    params.schema_path  Absolute path to the timeline schema JSON.
 * @param {Function} [params.on_progress] Optional callback (processed, total).
 * @returns {Promise<{
 *   schema: string,
 *   threads_checked: number,
 *   threads_with_errors: number,
 *   entries_checked: number,
 *   entries_invalid: number,
 *   bad_threads: Array
 * }>}
 */
export async function validate_timeline_schema({
  thread_id,
  sample,
  limit = 5,
  fail_fast = false,
  thread_dir,
  schema_path,
  on_progress
}) {
  if (!thread_dir) throw new Error('thread_dir is required')
  if (!schema_path) throw new Error('schema_path is required')

  const validate = await build_validator(schema_path)

  const thread_ids = await list_thread_ids({
    thread_dir,
    thread_id,
    sample
  })

  const results = await run_workers({
    thread_ids,
    fail_fast,
    on_progress,
    worker_fn: (id) =>
      validate_thread({
        thread_id: id,
        thread_dir,
        validate,
        per_thread_error_limit: limit,
        fail_fast
      })
  })

  const bad = results.filter((r) => r.invalid > 0)
  const entries_checked = results.reduce((s, r) => s + r.entries, 0)
  const entries_invalid = results.reduce((s, r) => s + r.invalid, 0)

  return {
    schema: schema_path,
    threads_checked: results.length,
    threads_with_errors: bad.length,
    entries_checked,
    entries_invalid,
    bad_threads: bad
  }
}
