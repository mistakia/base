#!/usr/bin/env bun

/**
 * Backfill thread metadata.has_continuation_prompt and
 * metadata.continuation_prompt_count across all threads.
 *
 * Deterministic and idempotent: rerunning produces the same values. Safe to
 * run at any time; does not touch any other metadata fields.
 *
 * Usage:
 *   bun cli/backfill-continuation-signal.mjs
 *   bun cli/backfill-continuation-signal.mjs --dry-run
 *   bun cli/backfill-continuation-signal.mjs --limit 100
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { list_thread_ids } from '#libs-server/threads/list-threads.mjs'
import { read_thread_data } from '#libs-server/threads/thread-utils.mjs'
import { update_thread_metadata } from '#libs-server/threads/update-thread.mjs'
import {
  extract_assistant_text
} from '#libs-server/metadata/analyze-thread-relations.mjs'
import { count_continuation_prompts } from '#libs-server/metadata/continuation-signal.mjs'

const log = debug('backfill:continuation-signal')
debug.enable('backfill:continuation-signal')

const argv = yargs(hideBin(process.argv))
  .option('dry-run', { type: 'boolean', default: false })
  .option('limit', { type: 'number', default: 0 })
  .option('verbose', { type: 'boolean', default: false })
  .strict()
  .help().argv

async function main() {
  const all_ids = await list_thread_ids({})
  const ids = argv.limit > 0 ? all_ids.slice(0, argv.limit) : all_ids

  let processed = 0
  let updated = 0
  let unchanged = 0
  let errors = 0

  for (const thread_id of ids) {
    processed++
    try {
      const { metadata, timeline } = await read_thread_data({ thread_id })
      const assistant_text = extract_assistant_text({ timeline })
      const count = count_continuation_prompts(assistant_text)
      const has = count > 0

      const needs_write =
        metadata.has_continuation_prompt !== has ||
        metadata.continuation_prompt_count !== count

      if (!needs_write) {
        unchanged++
        if (argv.verbose) log('unchanged %s (count=%d)', thread_id, count)
        continue
      }

      if (argv['dry-run']) {
        updated++
        log(
          'would update %s: has=%s count=%d (was has=%s count=%s)',
          thread_id,
          has,
          count,
          metadata.has_continuation_prompt,
          metadata.continuation_prompt_count
        )
        continue
      }

      await update_thread_metadata({
        thread_id,
        metadata: {
          has_continuation_prompt: has,
          continuation_prompt_count: count
        }
      })
      updated++
      if (argv.verbose) log('updated %s: has=%s count=%d', thread_id, has, count)
    } catch (error) {
      errors++
      log('error %s: %s', thread_id, error.message)
    }

    if (processed % 200 === 0) {
      log(
        'progress: %d processed, %d updated, %d unchanged, %d errors',
        processed,
        updated,
        unchanged,
        errors
      )
    }
  }

  log(
    'done: %d processed, %d updated, %d unchanged, %d errors',
    processed,
    updated,
    unchanged,
    errors
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
