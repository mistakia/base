#!/usr/bin/env node

/**
 * Batch backfill thread metadata (title/description) for threads missing analysis
 *
 * Scans thread directory for threads without titles and queues them for
 * metadata analysis via the metadata-queue-processor service.
 *
 * Usage:
 *   node cli/backfill-thread-metadata.mjs                    # Queue all unanalyzed threads
 *   node cli/backfill-thread-metadata.mjs --dry-run          # Preview without queueing
 *   node cli/backfill-thread-metadata.mjs --limit 50         # Limit to 50 threads
 *   node cli/backfill-thread-metadata.mjs --verbose          # Show detailed output
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER_BASE_DIR = path.resolve(__dirname, '..')
const THREAD_DIR = path.join(USER_BASE_DIR, 'thread')
const QUEUE_FILE = '/tmp/claude-pending-metadata-analysis.queue'

// Parse command line arguments
const args = process.argv.slice(2)
const getArg = (name, defaultValue) => {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return defaultValue
  if (typeof defaultValue === 'boolean') return true
  return args[index + 1] || defaultValue
}

const config = {
  dryRun: getArg('dry-run', false),
  limit: parseInt(getArg('limit', '0'), 10),
  verbose: getArg('verbose', false),
  help: getArg('help', false) || getArg('h', false)
}

if (config.help) {
  console.log(`
Batch backfill thread metadata for threads missing title/description

Usage:
  node cli/backfill-thread-metadata.mjs [options]

Options:
  --dry-run          Preview changes without queueing
  --limit <n>        Limit to first n threads (0 = unlimited)
  --verbose          Show detailed output
  --help, -h         Show this help message

Examples:
  # Queue all threads missing metadata
  node cli/backfill-thread-metadata.mjs

  # Preview what would be queued
  node cli/backfill-thread-metadata.mjs --dry-run

  # Queue only first 20 threads
  node cli/backfill-thread-metadata.mjs --limit 20 --verbose
`)
  process.exit(0)
}

// Statistics tracking
const stats = {
  total_found: 0,
  has_metadata: 0,
  needs_analysis: 0,
  already_queued: 0,
  queued: 0,
  errors: 0
}

/**
 * Read current queue contents
 */
async function readQueue() {
  try {
    const content = await fs.readFile(QUEUE_FILE, 'utf-8')
    return new Set(
      content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
  } catch (err) {
    if (err.code === 'ENOENT') return new Set()
    throw err
  }
}

/**
 * Append thread IDs to queue
 */
async function appendToQueue(threadIds) {
  if (threadIds.length === 0) return
  const content = threadIds.join('\n') + '\n'
  await fs.appendFile(QUEUE_FILE, content)
}

/**
 * Find all threads that need metadata analysis
 */
async function findThreadsNeedingMetadata() {
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

        // Check if thread has complete metadata (both title AND short_description)
        // This aligns with analyze-thread.mjs which only skips when both exist
        const hasTitle = metadata.title && metadata.title.trim().length > 0
        const hasDescription =
          metadata.short_description &&
          metadata.short_description.trim().length > 0

        if (hasTitle && hasDescription) {
          stats.has_metadata++
          continue
        }

        stats.needs_analysis++

        threads.push({
          thread_id: entry.name,
          state: metadata.thread_state || 'unknown',
          updated_at: metadata.updated_at
        })
      } catch (err) {
        if (config.verbose) {
          console.error(
            `  Warning: Could not read ${metadataPath}: ${err.message}`
          )
        }
        stats.errors++
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
 * Main execution
 */
async function main() {
  console.log('\n=== Thread Metadata Backfill ===\n')
  console.log('Configuration:')
  console.log(`  Dry run: ${config.dryRun}`)
  console.log(`  Limit: ${config.limit || 'unlimited'}`)
  console.log(`  Queue file: ${QUEUE_FILE}`)
  console.log('')

  // Find threads needing metadata
  console.log('Scanning for threads needing metadata analysis...')
  let threadsToQueue = await findThreadsNeedingMetadata()

  // Apply limit if specified
  if (config.limit > 0) {
    threadsToQueue = threadsToQueue.slice(0, config.limit)
  }

  console.log(`\nThreads found: ${stats.total_found}`)
  console.log(`With complete metadata: ${stats.has_metadata}`)
  console.log(`Needs analysis: ${stats.needs_analysis}`)
  console.log(`Errors: ${stats.errors}`)
  console.log(`To process: ${threadsToQueue.length}\n`)

  if (threadsToQueue.length === 0) {
    console.log('No threads to queue. All done!')
    return
  }

  // Read current queue to avoid duplicates
  const existingQueue = await readQueue()

  // Filter out already queued threads
  const newThreads = threadsToQueue.filter((t) => {
    if (existingQueue.has(t.thread_id)) {
      stats.already_queued++
      return false
    }
    return true
  })

  if (config.verbose) {
    console.log('Threads to queue:')
    for (const thread of newThreads) {
      console.log(`  ${thread.thread_id} (${thread.state})`)
    }
    console.log('')
  }

  console.log(`Already in queue: ${stats.already_queued}`)
  console.log(`New threads to add: ${newThreads.length}`)

  if (newThreads.length === 0) {
    console.log(
      '\nNo new threads to queue. All pending threads already queued.'
    )
    return
  }

  // Queue threads
  if (!config.dryRun) {
    const threadIds = newThreads.map((t) => t.thread_id)
    await appendToQueue(threadIds)
    stats.queued = threadIds.length
    console.log(`\nQueued ${stats.queued} threads for metadata analysis.`)
  } else {
    console.log('\n[DRY RUN] Would queue the following threads:')
    for (const thread of newThreads.slice(0, 10)) {
      console.log(`  ${thread.thread_id}`)
    }
    if (newThreads.length > 10) {
      console.log(`  ... and ${newThreads.length - 10} more`)
    }
    console.log('\nRun without --dry-run to apply.')
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
