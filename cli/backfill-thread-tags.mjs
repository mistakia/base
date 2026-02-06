#!/usr/bin/env node
/**
 * CLI to backfill tags for existing threads
 *
 * Scans threads that haven't been analyzed for tags and processes them
 * through the tag analysis pipeline. Respects tags_user_set flag.
 *
 * Usage:
 *   node cli/backfill-thread-tags.mjs [options]
 *
 * Options:
 *   --dry-run        Show what would be updated without making changes
 *   --limit          Maximum number of threads to process (default: 50)
 *   --state          Filter by thread state (active, archived)
 *   --force          Re-analyze even if already analyzed
 *   --concurrency    Number of concurrent analyses (default: 1)
 *   --created-since  Only process threads created since date (ISO format)
 *
 * Examples:
 *   node cli/backfill-thread-tags.mjs --dry-run --limit 10
 *   node cli/backfill-thread-tags.mjs --state active --limit 100
 *   node cli/backfill-thread-tags.mjs --force --created-since 2025-01-01
 */

import debug from 'debug'
import list_threads from '#libs-server/threads/list-threads.mjs'
import { analyze_thread_for_tags } from '#libs-server/metadata/analyze-thread-tags.mjs'

// Enable debug logging
debug.enable('metadata:*')
const log = debug('metadata:backfill-tags')

// ============================================================================
// CLI Parsing
// ============================================================================

const args = process.argv.slice(2)

const dry_run = args.includes('--dry-run')
const force = args.includes('--force')

// Parse --limit option
const limit_index = args.indexOf('--limit')
const limit = limit_index !== -1 ? parseInt(args[limit_index + 1], 10) : 50

// Parse --state option
const state_index = args.indexOf('--state')
const thread_state = state_index !== -1 ? args[state_index + 1] : undefined

// Parse --concurrency option
const concurrency_index = args.indexOf('--concurrency')
const concurrency =
  concurrency_index !== -1 ? parseInt(args[concurrency_index + 1], 10) : 1

// Parse --created-since option
const created_since_index = args.indexOf('--created-since')
const created_since =
  created_since_index !== -1 ? args[created_since_index + 1] : undefined

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node cli/backfill-thread-tags.mjs [options]')
  console.log('')
  console.log('Options:')
  console.log(
    '  --dry-run        Show what would be updated without making changes'
  )
  console.log('  --limit          Maximum number of threads to process (default: 50)')
  console.log('  --state          Filter by thread state (active, archived)')
  console.log('  --force          Re-analyze even if already analyzed')
  console.log('  --concurrency    Number of concurrent analyses (default: 1)')
  console.log(
    '  --created-since  Only process threads created since date (ISO format)'
  )
  console.log('  --help, -h       Show this help message')
  process.exit(0)
}

// ============================================================================
// Main Backfill Logic
// ============================================================================

async function run_backfill() {
  console.log('Thread Tag Backfill')
  console.log('='.repeat(40))
  console.log(`Dry run: ${dry_run}`)
  console.log(`Force: ${force}`)
  console.log(`Limit: ${limit}`)
  console.log(`Concurrency: ${concurrency}`)
  if (thread_state) {
    console.log(`State filter: ${thread_state}`)
  }
  if (created_since) {
    console.log(`Created since: ${created_since}`)
  }
  console.log('')

  // List threads that need tag analysis
  log('Fetching threads...')

  // Get a larger set initially to filter
  const all_threads = await list_threads({
    thread_state,
    created_since,
    limit: limit * 10 // Fetch more to account for filtering
  })

  log(`Found ${all_threads.length} total threads`)

  // Filter to threads needing tag analysis
  const threads_to_process = all_threads.filter((thread) => {
    // Skip if user set tags manually
    if (thread.tags_user_set === true) {
      return false
    }

    // Skip if already analyzed (unless force)
    if (!force && thread.tags_analyzed_at) {
      return false
    }

    return true
  })

  // Apply limit
  const threads = threads_to_process.slice(0, limit)

  console.log(`Threads to process: ${threads.length}`)
  if (threads_to_process.length > limit) {
    console.log(
      `(${threads_to_process.length - limit} additional threads available)`
    )
  }
  console.log('')

  if (threads.length === 0) {
    console.log('No threads need tag analysis.')
    return
  }

  // Process threads
  const results = {
    updated: 0,
    skipped: 0,
    failed: 0,
    dry_run: 0
  }

  const process_thread = async (thread) => {
    const thread_id = thread.thread_id
    const title = thread.title || '(untitled)'

    try {
      const result = await analyze_thread_for_tags({
        thread_id,
        dry_run,
        force
      })

      if (result.status === 'updated') {
        results.updated++
        console.log(
          `[UPDATED] ${thread_id.substring(0, 8)} - ${title} - ${result.updates.tags.length} tag(s)`
        )
      } else if (result.status === 'dry_run') {
        results.dry_run++
        console.log(
          `[DRY RUN] ${thread_id.substring(0, 8)} - ${title} - ${result.updates.tags.length} tag(s)`
        )
      } else if (result.status === 'skipped') {
        results.skipped++
        log(`[SKIPPED] ${thread_id.substring(0, 8)} - ${result.reason}`)
      } else if (result.status === 'failed') {
        results.failed++
        console.log(
          `[FAILED] ${thread_id.substring(0, 8)} - ${title} - ${result.error}`
        )
      }
    } catch (error) {
      results.failed++
      console.log(`[ERROR] ${thread_id.substring(0, 8)} - ${title} - ${error.message}`)
    }
  }

  // Process with concurrency
  if (concurrency === 1) {
    // Sequential processing
    for (const thread of threads) {
      await process_thread(thread)
    }
  } else {
    // Concurrent processing
    const queue = [...threads]
    const workers = []

    for (let i = 0; i < concurrency; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const thread = queue.shift()
            if (thread) {
              await process_thread(thread)
            }
          }
        })()
      )
    }

    await Promise.all(workers)
  }

  // Summary
  console.log('')
  console.log('='.repeat(40))
  console.log('Summary:')
  console.log(`  Updated: ${results.updated}`)
  console.log(`  Dry run: ${results.dry_run}`)
  console.log(`  Skipped: ${results.skipped}`)
  console.log(`  Failed: ${results.failed}`)
  console.log(`  Total: ${threads.length}`)
}

// ============================================================================
// Execute
// ============================================================================

try {
  await run_backfill()
} catch (error) {
  console.error('Error:', error.message)
  process.exit(1)
}
