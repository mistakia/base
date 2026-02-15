#!/usr/bin/env node

/**
 * Migrate Timelines to JSONL CLI Tool
 *
 * One-time migration tool to convert all timeline.json files to timeline.jsonl format.
 * This reduces memory pressure by enabling streaming reads and append-only writes.
 *
 * Examples:
 *
 *   # Dry run to preview migration
 *   node cli/migrate-timelines-to-jsonl.mjs --dry-run
 *
 *   # Migrate all threads
 *   node cli/migrate-timelines-to-jsonl.mjs
 *
 *   # Migrate a single thread
 *   node cli/migrate-timelines-to-jsonl.mjs --thread-id abc123
 */

import debug from 'debug'
import fs from 'fs/promises'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { write_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'

const log = debug('cli:migrate-timelines')

/**
 * Migrate a single thread's timeline from JSON to JSONL
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_path Path to thread directory
 * @param {boolean} params.dry_run If true, only preview changes
 * @returns {Promise<Object>} Migration result
 */
async function migrate_thread({ thread_path, dry_run = false }) {
  const thread_id = path.basename(thread_path)
  const json_path = path.join(thread_path, 'timeline.json')
  const jsonl_path = path.join(thread_path, 'timeline.jsonl')

  try {
    // Check if JSON file exists
    const json_exists = await fs
      .access(json_path)
      .then(() => true)
      .catch(() => false)

    if (!json_exists) {
      // Check if JSONL already exists
      const jsonl_exists = await fs
        .access(jsonl_path)
        .then(() => true)
        .catch(() => false)

      if (jsonl_exists) {
        return { thread_id, status: 'already_migrated' }
      }

      return { thread_id, status: 'no_timeline' }
    }

    // Read JSON file
    const raw = await fs.readFile(json_path, 'utf-8')
    let entries

    try {
      entries = JSON.parse(raw)
    } catch (parse_error) {
      return {
        thread_id,
        status: 'error',
        error: `JSON parse error: ${parse_error.message}`
      }
    }

    if (!Array.isArray(entries)) {
      return {
        thread_id,
        status: 'error',
        error: 'timeline.json is not an array'
      }
    }

    if (dry_run) {
      return {
        thread_id,
        status: 'would_migrate',
        entry_count: entries.length
      }
    }

    // Write JSONL file
    await write_timeline_jsonl({ timeline_path: jsonl_path, entries })

    // Verify JSONL file was written before deleting original
    try {
      await fs.access(jsonl_path)
    } catch {
      throw new Error(`JSONL file was not written successfully: ${jsonl_path}`)
    }

    // Delete original JSON file
    try {
      await fs.unlink(json_path)
    } catch (unlink_error) {
      log(
        `Warning: could not delete original file ${json_path}: ${unlink_error.message}`
      )
    }

    log(`Migrated ${thread_id}: ${entries.length} entries`)

    return {
      thread_id,
      status: 'migrated',
      entry_count: entries.length
    }
  } catch (error) {
    return {
      thread_id,
      status: 'error',
      error: error.message
    }
  }
}

/**
 * Migrate all threads in the thread base directory
 *
 * @param {Object} params Parameters
 * @param {boolean} params.dry_run If true, only preview changes
 * @param {string} [params.thread_id] Optional single thread ID to migrate
 * @returns {Promise<Object>} Migration statistics
 */
async function migrate_all_threads({ dry_run = false, thread_id = null }) {
  const thread_base = get_thread_base_directory()
  const stats = {
    total: 0,
    migrated: 0,
    would_migrate: 0,
    already_migrated: 0,
    no_timeline: 0,
    errors: []
  }

  if (thread_id) {
    // Migrate single thread
    const thread_path = path.join(thread_base, thread_id)
    const result = await migrate_thread({ thread_path, dry_run })
    stats.total = 1

    switch (result.status) {
      case 'migrated':
        stats.migrated = 1
        break
      case 'would_migrate':
        stats.would_migrate = 1
        break
      case 'already_migrated':
        stats.already_migrated = 1
        break
      case 'no_timeline':
        stats.no_timeline = 1
        break
      case 'error':
        stats.errors.push(result)
        break
    }

    return stats
  }

  // Migrate all threads
  const entries = await fs.readdir(thread_base, { withFileTypes: true })
  const thread_dirs = entries.filter((entry) => entry.isDirectory())

  console.log(`Found ${thread_dirs.length} thread directories`)

  for (const dir of thread_dirs) {
    const thread_path = path.join(thread_base, dir.name)
    const result = await migrate_thread({ thread_path, dry_run })
    stats.total++

    switch (result.status) {
      case 'migrated':
        stats.migrated++
        break
      case 'would_migrate':
        stats.would_migrate++
        break
      case 'already_migrated':
        stats.already_migrated++
        break
      case 'no_timeline':
        stats.no_timeline++
        break
      case 'error':
        stats.errors.push(result)
        break
    }

    // Progress indicator every 100 threads
    if (stats.total % 100 === 0) {
      console.log(`Progress: ${stats.total}/${thread_dirs.length}`)
    }
  }

  return stats
}

const cli_config = (argv_parser) =>
  add_directory_cli_options(argv_parser)
    .scriptName('migrate-timelines-to-jsonl')
    .usage(
      'Migrate timeline.json files to timeline.jsonl format.\n\nUsage: $0 [options]'
    )
    .option('dry-run', {
      alias: 'd',
      describe: 'Preview migration without making changes',
      type: 'boolean',
      default: false
    })
    .option('thread-id', {
      alias: 't',
      describe: 'Migrate a single thread by ID',
      type: 'string'
    })
    .example('$0 --dry-run', 'Preview migration without changes')
    .example('$0', 'Migrate all threads')
    .example('$0 --thread-id abc123', 'Migrate a single thread')
    .help()
    .alias('help', 'h')
    .strict()

const run = async ({ dry_run = false, thread_id = null }) => {
  console.log(
    dry_run
      ? 'Running in DRY RUN mode - no changes will be made'
      : 'Starting migration...'
  )

  const stats = await migrate_all_threads({ dry_run, thread_id })

  console.log('\n=== Migration Results ===')
  console.log(`Total threads processed: ${stats.total}`)

  if (dry_run) {
    console.log(`Would migrate: ${stats.would_migrate}`)
  } else {
    console.log(`Migrated: ${stats.migrated}`)
  }

  console.log(`Already migrated: ${stats.already_migrated}`)
  console.log(`No timeline file: ${stats.no_timeline}`)
  console.log(`Errors: ${stats.errors.length}`)

  if (stats.errors.length > 0) {
    console.log('\nErrors:')
    for (const error of stats.errors) {
      console.log(`  ${error.thread_id}: ${error.error}`)
    }
  }

  return stats
}

export default run

const main = async () => {
  const argv = cli_config(yargs(hideBin(process.argv))).argv

  handle_cli_directory_registration(argv)

  let error
  try {
    const stats = await run({
      dry_run: argv['dry-run'],
      thread_id: argv['thread-id']
    })

    if (stats.errors.length > 0) {
      process.exit(1)
    }
  } catch (err) {
    error = err
    console.error(`\nError: ${err.message}`)
  }

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  main()
}
