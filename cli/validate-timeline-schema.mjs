#!/usr/bin/env bun

/**
 * Validate every timeline.jsonl entry under $USER_BASE_DIRECTORY/thread/
 * against system/text/thread-timeline-schema.json using ajv.
 *
 * This is the full-fidelity complement to `migrate-timeline-to-5-types.mjs --verify`,
 * which only checks top-level type membership and schema_version. Here every
 * entry is validated against the complete JSON Schema (type discriminators,
 * conditional `allOf` branches, required fields, additionalProperties, etc.).
 *
 * Usage:
 *   bun cli/validate-timeline-schema.mjs                       # Validate all threads
 *   bun cli/validate-timeline-schema.mjs --thread-id <uuid>    # Single thread
 *   bun cli/validate-timeline-schema.mjs --sample 100          # Random sample
 *   bun cli/validate-timeline-schema.mjs --limit 3             # Cap errors per thread
 *   bun cli/validate-timeline-schema.mjs --json                # JSON output
 *   bun cli/validate-timeline-schema.mjs --fail-fast           # Stop on first bad entry
 *
 * Exit codes:
 *   0 -- every entry validates
 *   1 -- at least one entry failed validation
 *   2 -- setup error (schema unreadable, $USER_BASE_DIRECTORY unset, etc.)
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { createReadStream } from 'fs'
import { fileURLToPath } from 'url'

import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const script_path = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(script_path), '..')
const SCHEMA_PATH = path.join(
  REPO_ROOT,
  'system/text/thread-timeline-schema.json'
)

const USER_BASE_DIR = process.env.USER_BASE_DIRECTORY || ''
const THREAD_DIR = USER_BASE_DIR ? path.join(USER_BASE_DIR, 'thread') : ''

const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const FAIL_FAST = args.includes('--fail-fast')
const thread_id_flag_index = args.indexOf('--thread-id')
const SINGLE_THREAD_ID =
  thread_id_flag_index >= 0 ? args[thread_id_flag_index + 1] : null
const sample_flag_index = args.indexOf('--sample')
const SAMPLE_SIZE =
  sample_flag_index >= 0 ? Number(args[sample_flag_index + 1]) : null
const limit_flag_index = args.indexOf('--limit')
const PER_THREAD_ERROR_LIMIT =
  limit_flag_index >= 0 ? Number(args[limit_flag_index + 1]) : 5

const log = (...parts) => {
  if (!JSON_OUT) console.log(...parts)
}

const build_validator = async () => {
  const schema_raw = await fs.readFile(SCHEMA_PATH, 'utf8')
  const schema = JSON.parse(schema_raw)

  // JSONL: one entry per line -> validate against items, not the outer array.
  const item_schema = schema.items
  if (!item_schema) {
    throw new Error(`schema at ${SCHEMA_PATH} has no .items definition`)
  }

  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)
  return ajv.compile(item_schema)
}

const list_thread_ids = async () => {
  if (SINGLE_THREAD_ID) return [SINGLE_THREAD_ID]
  const entries = await fs.readdir(THREAD_DIR, { withFileTypes: true })
  let ids = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
  if (SAMPLE_SIZE && SAMPLE_SIZE > 0 && SAMPLE_SIZE < ids.length) {
    // Fisher-Yates partial shuffle
    for (let i = ids.length - 1; i > ids.length - 1 - SAMPLE_SIZE; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
    ids = ids.slice(ids.length - SAMPLE_SIZE)
  }
  return ids
}

const format_ajv_errors = (errors) =>
  errors.map((e) => ({
    path: e.instancePath || '/',
    keyword: e.keyword,
    message: e.message,
    params: e.params
  }))

const validate_thread = async (thread_id, validate) => {
  const timeline_path = path.join(THREAD_DIR, thread_id, 'timeline.jsonl')
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
      if (errors.length < PER_THREAD_ERROR_LIMIT) {
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
      if (errors.length < PER_THREAD_ERROR_LIMIT) {
        errors.push({
          line: line_number,
          entry_id: entry.id || null,
          type: entry.type || null,
          schema_version: entry.schema_version ?? 1,
          errors: format_ajv_errors(validate.errors)
        })
      }
      if (FAIL_FAST) break
    }
  }

  return { thread_id, entries, invalid, errors }
}

const run_workers = async (thread_ids, worker_fn) => {
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
        if (FAIL_FAST && result.invalid > 0) return
      } catch (err) {
        results.push({
          thread_id: id,
          entries: 0,
          invalid: 0,
          errors: [{ fatal: err.message }]
        })
      }
      processed++
      if (!JSON_OUT && processed % 500 === 0) {
        console.log(
          `[validate] processed ${processed}/${thread_ids.length} threads`
        )
      }
    }
  })

  await Promise.all(workers)
  return results
}

const main = async () => {
  if (!USER_BASE_DIR) {
    console.error('Error: USER_BASE_DIRECTORY environment variable is not set.')
    process.exit(2)
  }

  let validate
  try {
    validate = await build_validator()
  } catch (err) {
    console.error(`Error compiling schema: ${err.message}`)
    process.exit(2)
  }

  const thread_ids = await list_thread_ids()
  log(
    `[validate] ${thread_ids.length} thread(s) to check against ${path.relative(REPO_ROOT, SCHEMA_PATH)}`
  )

  const results = await run_workers(thread_ids, (id) =>
    validate_thread(id, validate)
  )

  const bad = results.filter((r) => r.invalid > 0)
  const total_entries = results.reduce((s, r) => s + r.entries, 0)
  const total_invalid = results.reduce((s, r) => s + r.invalid, 0)

  if (JSON_OUT) {
    process.stdout.write(
      JSON.stringify(
        {
          schema: path.relative(REPO_ROOT, SCHEMA_PATH),
          threads_checked: results.length,
          threads_with_errors: bad.length,
          entries_checked: total_entries,
          entries_invalid: total_invalid,
          bad_threads: bad
        },
        null,
        2
      ) + '\n'
    )
  } else {
    console.log(
      `[validate] checked ${total_entries} entries across ${results.length} threads`
    )
    console.log(
      `[validate] ${bad.length} thread(s) with validation errors, ${total_invalid} entries invalid`
    )
    for (const r of bad) {
      console.log(`\n${r.thread_id} (${r.invalid} invalid of ${r.entries}):`)
      for (const e of r.errors) {
        if (e.parse_error) {
          console.log(`  line ${e.line}: parse error: ${e.parse_error}`)
          continue
        }
        if (e.fatal) {
          console.log(`  fatal: ${e.fatal}`)
          continue
        }
        console.log(
          `  line ${e.line} id=${e.entry_id} type=${e.type} v${e.schema_version}:`
        )
        for (const err of e.errors) {
          console.log(
            `    ${err.path} ${err.keyword}: ${err.message} ${JSON.stringify(err.params)}`
          )
        }
      }
    }
  }

  process.exit(bad.length > 0 ? 1 : 0)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(2)
  })
}
