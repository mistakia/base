#!/usr/bin/env bun

/**
 * Validate every timeline.jsonl entry under $USER_BASE_DIRECTORY/thread/
 * against system/text/thread-timeline-schema.json using ajv.
 *
 * Thin CLI shim over libs-server/threads/validate-timeline-schema.mjs.
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

import path from 'path'
import { fileURLToPath } from 'url'

import { validate_timeline_schema } from '#libs-server/threads/validate-timeline-schema.mjs'

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

const main = async () => {
  if (!USER_BASE_DIR) {
    console.error('Error: USER_BASE_DIRECTORY environment variable is not set.')
    process.exit(2)
  }

  let result
  try {
    result = await validate_timeline_schema({
      thread_id: SINGLE_THREAD_ID,
      sample: SAMPLE_SIZE,
      limit: PER_THREAD_ERROR_LIMIT,
      fail_fast: FAIL_FAST,
      thread_dir: THREAD_DIR,
      schema_path: SCHEMA_PATH,
      on_progress: (processed, total) => {
        if (!JSON_OUT) {
          console.log(`[validate] processed ${processed}/${total} threads`)
        }
      }
    })
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(2)
  }

  const {
    threads_checked,
    threads_with_errors,
    entries_checked,
    entries_invalid,
    bad_threads
  } = result

  log(
    `[validate] ${threads_checked} thread(s) to check against ${path.relative(REPO_ROOT, SCHEMA_PATH)}`
  )

  if (JSON_OUT) {
    process.stdout.write(
      JSON.stringify(
        {
          schema: path.relative(REPO_ROOT, SCHEMA_PATH),
          threads_checked,
          threads_with_errors,
          entries_checked,
          entries_invalid,
          bad_threads
        },
        null,
        2
      ) + '\n'
    )
  } else {
    console.log(
      `[validate] checked ${entries_checked} entries across ${threads_checked} threads`
    )
    console.log(
      `[validate] ${threads_with_errors} thread(s) with validation errors, ${entries_invalid} entries invalid`
    )
    for (const r of bad_threads) {
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

  process.exit(threads_with_errors > 0 ? 1 : 0)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(2)
  })
}
