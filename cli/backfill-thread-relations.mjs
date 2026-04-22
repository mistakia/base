#!/usr/bin/env bun

/**
 * Batch backfill thread relations for all existing threads
 *
 * Processes threads that have not been analyzed (missing relations_analyzed_at)
 * with configurable batch size and delay. Uses metadata.relations_analyzed_at
 * as the source of truth for tracking which threads have been processed.
 *
 * Usage:
 *   bun cli/backfill-thread-relations.mjs                    # Process all unanalyzed threads
 *   bun cli/backfill-thread-relations.mjs --batch-size 10    # Process 10 at a time
 *   bun cli/backfill-thread-relations.mjs --delay 2000       # 2s delay between batches
 *   bun cli/backfill-thread-relations.mjs --dry-run          # Preview without changes
 *   bun cli/backfill-thread-relations.mjs --limit 100        # Process only first 100
 *   bun cli/backfill-thread-relations.mjs --update-entities  # Re-process to add back-references to entities
 *   bun cli/backfill-thread-relations.mjs --stale-before 2026-04-18T20:55Z --exclude-active-sessions
 */

import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import config from '#config'
import { get_all_active_sessions } from '#server/services/active-sessions/active-session-store.mjs'

if (!process.env.USER_BASE_DIRECTORY) {
  console.error(
    'Error: USER_BASE_DIRECTORY environment variable is not set. This script must be run with USER_BASE_DIRECTORY pointing to the user-base directory.'
  )
  process.exit(1)
}

const USER_BASE_DIR = process.env.USER_BASE_DIRECTORY
const THREAD_DIR = path.join(USER_BASE_DIR, 'thread')
const BASE_REPO = config.system_base_directory

// Parse command line arguments
const args = process.argv.slice(2)
const getArg = (name, defaultValue) => {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return defaultValue
  if (typeof defaultValue === 'boolean') return true
  return args[index + 1] || defaultValue
}

const options = {
  batch_size: parseInt(getArg('batch-size', '5'), 10),
  delay_ms: parseInt(getArg('delay', '1000'), 10),
  dry_run: getArg('dry-run', false),
  limit: parseInt(getArg('limit', '0'), 10),
  verbose: getArg('verbose', false),
  update_entities: getArg('update-entities', false),
  // Force re-analysis; also drives the `--update-entities` path via
  // `force: options.force || options.update_entities`.
  force: getArg('force', false),
  sync_kuzu: getArg('sync-kuzu', false),
  stale_before: getArg('stale-before', ''),
  exclude_active_sessions: getArg('exclude-active-sessions', false),
  help: getArg('help', false) || getArg('h', false)
}

if (options.stale_before) {
  const parsed = new Date(options.stale_before)
  if (Number.isNaN(parsed.getTime())) {
    console.error(
      `Error: --stale-before value "${options.stale_before}" is not a valid ISO timestamp`
    )
    process.exit(1)
  }
  options.stale_before_ms = parsed.getTime()
}

if (options.help) {
  console.log(`
Batch backfill thread relations for all existing threads

Usage:
  bun cli/backfill-thread-relations.mjs [options]

Options:
  --batch-size <n>   Number of threads to process per batch (default: 5)
  --delay <ms>       Delay in ms between batches (default: 1000)
  --dry-run          Preview changes without updating metadata
  --limit <n>        Process only first n threads (0 = unlimited)
  --verbose          Show detailed output
  --update-entities  Re-process analyzed threads to add back-references to entities
  --force            Force re-analysis of already-analyzed threads
  --sync-kuzu        Sync threads to KuzuDB after analysis
  --stale-before <iso>        Include threads whose relations_analyzed_at is before this ISO timestamp
  --exclude-active-sessions   Skip threads currently registered as active sessions
  --help, -h         Show this help message

Examples:
  # Process in batches of 10
  bun cli/backfill-thread-relations.mjs --batch-size 10

  # Test run on first 10 threads
  bun cli/backfill-thread-relations.mjs --limit 10 --dry-run

  # Add back-references to entities for already-analyzed threads
  bun cli/backfill-thread-relations.mjs --update-entities --batch-size 20

  # Re-analyze all threads and sync to KuzuDB
  bun cli/backfill-thread-relations.mjs --force --sync-kuzu
`)
  process.exit(0)
}

// Statistics tracking
const stats = {
  total_found: 0,
  already_analyzed: 0,
  to_process: 0,
  processed: 0,
  success: 0,
  errors: 0,
  skipped: 0,
  total_relations: 0,
  back_refs_added: 0,
  back_refs_skipped: 0,
  start_time: Date.now(),
  error_details: []
}

/**
 * Find all threads that need analysis
 */
async function find_threads_needing_analysis() {
  const threads = []

  try {
    const entries = await fs.readdir(THREAD_DIR, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const metadataPath = path.join(THREAD_DIR, entry.name, 'metadata.json')

      try {
        const content = await fs.readFile(metadataPath, 'utf-8')
        const metadata = JSON.parse(content)

        stats.total_found++

        if (metadata.relations_analyzed_at) {
          stats.already_analyzed++
        }

        threads.push({
          thread_id: entry.name,
          title: metadata.title || '(untitled)',
          state: metadata.thread_state || 'unknown',
          updated_at: metadata.updated_at,
          relations_analyzed_at: metadata.relations_analyzed_at || null
        })
      } catch (err) {
        if (options.verbose) {
          console.error(
            `  Warning: Could not read ${metadataPath}: ${err.message}`
          )
        }
      }
    }
  } catch (err) {
    console.error(`Error reading thread directory: ${err.message}`)
    process.exit(1)
  }

  // Sort by updated_at descending (most recent first)
  threads.sort((a, b) => {
    const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0)
    const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0)
    return dateB - dateA
  })

  return threads
}

function filter_stale_threads(threads, cutoff) {
  return threads.filter((t) => {
    if (!t.relations_analyzed_at) return true
    const ts = Date.parse(t.relations_analyzed_at)
    return Number.isNaN(ts) || ts < cutoff
  })
}

async function load_active_session_thread_ids() {
  const sessions = await get_all_active_sessions()
  const ids = new Set()
  for (const s of sessions) {
    if (s && s.thread_id) ids.add(s.thread_id)
  }
  return ids
}

/**
 * Find threads that need entity back-reference updates
 * (already analyzed threads that have entity relations)
 */
async function find_threads_needing_entity_update() {
  const threads = []

  try {
    const entries = await fs.readdir(THREAD_DIR, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const metadataPath = path.join(THREAD_DIR, entry.name, 'metadata.json')

      try {
        const content = await fs.readFile(metadataPath, 'utf-8')
        const metadata = JSON.parse(content)

        stats.total_found++

        // Skip if not analyzed yet
        if (!metadata.relations_analyzed_at) {
          continue
        }

        stats.already_analyzed++

        // Skip if no relations (nothing to back-reference)
        const relations = metadata.relations || []
        const entityRelations = relations.filter(
          (r) =>
            r.startsWith('accesses [[') ||
            r.startsWith('modifies [[') ||
            r.startsWith('creates [[')
        )

        if (entityRelations.length === 0) {
          continue
        }

        threads.push({
          thread_id: entry.name,
          title: metadata.title || '(untitled)',
          state: metadata.thread_state || 'unknown',
          updated_at: metadata.updated_at,
          relation_count: entityRelations.length
        })
      } catch (err) {
        if (options.verbose) {
          console.error(
            `  Warning: Could not read ${metadataPath}: ${err.message}`
          )
        }
      }
    }
  } catch (err) {
    console.error(`Error reading thread directory: ${err.message}`)
    process.exit(1)
  }

  // Sort by updated_at descending (most recent first)
  threads.sort((a, b) => {
    const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0)
    const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0)
    return dateB - dateA
  })

  return threads
}

/**
 * Process a single thread
 */
async function process_thread(thread_id, opts = {}) {
  const cliPath = path.join(BASE_REPO, 'cli/analyze-thread-relations.mjs')

  const run_args = ['--thread-id', thread_id, '--output-format', 'json']
  if (opts.dry_run) run_args.push('--dry-run')
  if (opts.force) run_args.push('--force')

  return new Promise((resolve) => {
    const child = spawn(process.argv[0], [cliPath, ...run_args], {
      cwd: BASE_REPO,
      env: { ...process.env, DEBUG: '' } // Disable debug output for cleaner JSON
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })

    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim())
        resolve({ success: true, result, code })
      } catch {
        resolve({
          success: false,
          error: stderr || stdout || `Process exited with code ${code}`,
          code
        })
      }
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message, code: -1 })
    })
  })
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Format duration in human readable form
 */
function format_duration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

/**
 * Print progress bar
 */
function print_progress({ current, total }) {
  const width = 40
  const percent = total > 0 ? current / total : 0
  const filled = Math.round(width * percent)
  const empty = width - filled
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  const percentStr = (percent * 100).toFixed(1).padStart(5)

  process.stdout.write(`\r  [${bar}] ${percentStr}% (${current}/${total})`)
}

/**
 * Main execution
 */
async function main() {
  const mode_label = options.update_entities
    ? 'Entity Back-Reference Update'
    : 'Thread Relations Backfill'
  console.log(`\n=== ${mode_label} ===\n`)
  console.log(`Configuration:`)
  console.log(
    `  Mode: ${options.update_entities ? 'update-entities' : 'analyze'}`
  )
  console.log(`  Batch size: ${options.batch_size}`)
  console.log(`  Delay between batches: ${options.delay_ms}ms`)
  console.log(`  Dry run: ${options.dry_run}`)
  console.log(`  Force re-analysis: ${options.force}`)
  console.log(`  Sync to KuzuDB: ${options.sync_kuzu}`)
  console.log(`  Limit: ${options.limit || 'unlimited'}`)
  console.log('')

  // Find threads based on mode
  const scan_message = options.update_entities
    ? 'Scanning for threads needing entity back-references...'
    : 'Scanning for threads needing analysis...'
  console.log(scan_message)

  let threads_to_process = options.update_entities
    ? await find_threads_needing_entity_update()
    : await find_threads_needing_analysis()

  // Filter to stale threads (analyzed before the given cutoff or never analyzed).
  // Threads whose relations_analyzed_at is at/after the cutoff are skipped so
  // we do not thrash already-fresh analyses.
  if (options.stale_before_ms != null && !options.update_entities) {
    const before = threads_to_process.length
    threads_to_process = filter_stale_threads(
      threads_to_process,
      options.stale_before_ms
    )
    console.log(
      `Stale filter (<${options.stale_before}): ${before} -> ${threads_to_process.length}`
    )
  }

  // Drop threads that are currently registered as active sessions so a bulk
  // sweep does not race metadata writes against a live session.
  if (options.exclude_active_sessions) {
    const before = threads_to_process.length
    const active_ids = await load_active_session_thread_ids()
    threads_to_process = threads_to_process.filter(
      (t) => !active_ids.has(t.thread_id)
    )
    console.log(
      `Active-session exclude: ${before} -> ${threads_to_process.length} (${active_ids.size} active)`
    )
  }

  // Apply limit if specified
  if (options.limit > 0) {
    threads_to_process = threads_to_process.slice(0, options.limit)
  }

  stats.to_process = threads_to_process.length

  console.log(`\nThreads found: ${stats.total_found}`)
  console.log(`Already analyzed: ${stats.already_analyzed}`)
  console.log(`To process: ${stats.to_process}\n`)

  if (stats.to_process === 0) {
    console.log('No threads to process. All done!')
    return
  }

  // Process in batches
  console.log('Processing threads...\n')

  for (let i = 0; i < threads_to_process.length; i += options.batch_size) {
    const batch = threads_to_process.slice(i, i + options.batch_size)

    // Process batch in parallel
    const promises = batch.map(async (thread) => {
      const result = await process_thread(thread.thread_id, {
        dry_run: options.dry_run,
        force: options.force || options.update_entities // Force re-analysis in update mode or when explicit
      })

      stats.processed++

      if (result.success) {
        if (result.result.status === 'already_analyzed') {
          stats.skipped++
        } else if (result.result.status === 'success') {
          stats.success++
          stats.total_relations += result.result.total_relations_count || 0

          // Track back-reference stats in update mode
          if (result.result.back_references) {
            stats.back_refs_added +=
              result.result.back_references.updated?.length || 0
            stats.back_refs_skipped +=
              result.result.back_references.skipped?.length || 0
          }
        }
      } else {
        stats.errors++
        stats.error_details.push({
          thread_id: thread.thread_id,
          error: result.error
        })
      }

      return { thread, result }
    })

    await Promise.all(promises)

    // Update progress bar
    print_progress({ current: stats.processed, total: stats.to_process })

    // Delay between batches (unless last batch)
    if (i + options.batch_size < threads_to_process.length) {
      await sleep(options.delay_ms)
    }
  }

  console.log('\n\n')

  // Print summary
  const elapsed = Date.now() - stats.start_time
  console.log('=== Summary ===\n')
  console.log(`Total threads scanned: ${stats.total_found}`)
  console.log(`Already analyzed (before run): ${stats.already_analyzed}`)
  console.log(`Processed this run: ${stats.processed}`)
  console.log(`  - Success: ${stats.success}`)
  console.log(`  - Skipped (already done): ${stats.skipped}`)
  console.log(`  - Errors: ${stats.errors}`)
  console.log(`Total relations: ${stats.total_relations}`)
  if (
    options.update_entities ||
    stats.back_refs_added > 0 ||
    stats.back_refs_skipped > 0
  ) {
    console.log(`Back-references added to entities: ${stats.back_refs_added}`)
    console.log(
      `Back-references skipped (already exist): ${stats.back_refs_skipped}`
    )
  }
  console.log(`Duration: ${format_duration(elapsed)}`)
  console.log(
    `Average: ${stats.processed > 0 ? (elapsed / stats.processed).toFixed(0) : 0}ms per thread`
  )

  if (options.dry_run) {
    console.log('\n[DRY RUN] No changes were made')
  }

  if (stats.error_details.length > 0) {
    console.log('\n=== Errors ===\n')
    for (const err of stats.error_details.slice(0, 10)) {
      console.log(`  ${err.thread_id}: ${err.error}`)
    }
    if (stats.error_details.length > 10) {
      console.log(`  ... and ${stats.error_details.length - 10} more errors`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
