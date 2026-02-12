#!/usr/bin/env node

/**
 * Batch backfill thread relations for all existing threads
 *
 * Processes threads that have not been analyzed (missing relations_analyzed_at)
 * with configurable batch size and delay. Uses metadata.relations_analyzed_at
 * as the source of truth for tracking which threads have been processed.
 *
 * Usage:
 *   node cli/backfill-thread-relations.mjs                    # Process all unanalyzed threads
 *   node cli/backfill-thread-relations.mjs --batch-size 10    # Process 10 at a time
 *   node cli/backfill-thread-relations.mjs --delay 2000       # 2s delay between batches
 *   node cli/backfill-thread-relations.mjs --dry-run          # Preview without changes
 *   node cli/backfill-thread-relations.mjs --limit 100        # Process only first 100
 *   node cli/backfill-thread-relations.mjs --update-entities  # Re-process to add back-references to entities
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER_BASE_DIR = path.resolve(__dirname, '..')
const THREAD_DIR = path.join(USER_BASE_DIR, 'thread')
const BASE_REPO = path.join(USER_BASE_DIR, 'repository/active/base')

// Parse command line arguments
const args = process.argv.slice(2)
const getArg = (name, defaultValue) => {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return defaultValue
  if (typeof defaultValue === 'boolean') return true
  return args[index + 1] || defaultValue
}

const config = {
  batchSize: parseInt(getArg('batch-size', '5'), 10),
  delayMs: parseInt(getArg('delay', '1000'), 10),
  dryRun: getArg('dry-run', false),
  limit: parseInt(getArg('limit', '0'), 10),
  verbose: getArg('verbose', false),
  updateEntities: getArg('update-entities', false),
  force: getArg('force', false),
  syncKuzu: getArg('sync-kuzu', false),
  help: getArg('help', false) || getArg('h', false)
}

if (config.help) {
  console.log(`
Batch backfill thread relations for all existing threads

Usage:
  node cli/backfill-thread-relations.mjs [options]

Options:
  --batch-size <n>   Number of threads to process per batch (default: 5)
  --delay <ms>       Delay in ms between batches (default: 1000)
  --dry-run          Preview changes without updating metadata
  --limit <n>        Process only first n threads (0 = unlimited)
  --verbose          Show detailed output
  --update-entities  Re-process analyzed threads to add back-references to entities
  --force            Force re-analysis of already-analyzed threads
  --sync-kuzu        Sync threads to KuzuDB after analysis
  --help, -h         Show this help message

Examples:
  # Process in batches of 10
  node cli/backfill-thread-relations.mjs --batch-size 10

  # Test run on first 10 threads
  node cli/backfill-thread-relations.mjs --limit 10 --dry-run

  # Add back-references to entities for already-analyzed threads
  node cli/backfill-thread-relations.mjs --update-entities --batch-size 20

  # Re-analyze all threads and sync to KuzuDB
  node cli/backfill-thread-relations.mjs --force --sync-kuzu
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
async function findThreadsNeedingAnalysis() {
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
          // Skip if not forcing re-analysis
          if (!config.force) {
            continue
          }
        }

        threads.push({
          thread_id: entry.name,
          title: metadata.title || '(untitled)',
          state: metadata.thread_state || 'unknown',
          updated_at: metadata.updated_at
        })
      } catch (err) {
        if (config.verbose) {
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
 * Find threads that need entity back-reference updates
 * (already analyzed threads that have entity relations)
 */
async function findThreadsNeedingEntityUpdate() {
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
        if (config.verbose) {
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
async function processThread(threadId, options = {}) {
  const cliPath = path.join(BASE_REPO, 'cli/analyze-thread-relations.mjs')

  const args = ['--thread-id', threadId, '--output-format', 'json']
  if (options.dryRun) args.push('--dry-run')
  if (options.force) args.push('--force')

  return new Promise((resolve) => {
    const child = spawn('node', [cliPath, ...args], {
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
function formatDuration(ms) {
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
function printProgress(current, total) {
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
  const modeLabel = config.updateEntities
    ? 'Entity Back-Reference Update'
    : 'Thread Relations Backfill'
  console.log(`\n=== ${modeLabel} ===\n`)
  console.log(`Configuration:`)
  console.log(
    `  Mode: ${config.updateEntities ? 'update-entities' : 'analyze'}`
  )
  console.log(`  Batch size: ${config.batchSize}`)
  console.log(`  Delay between batches: ${config.delayMs}ms`)
  console.log(`  Dry run: ${config.dryRun}`)
  console.log(`  Force re-analysis: ${config.force}`)
  console.log(`  Sync to KuzuDB: ${config.syncKuzu}`)
  console.log(`  Limit: ${config.limit || 'unlimited'}`)
  console.log('')

  // Find threads based on mode
  const scanMessage = config.updateEntities
    ? 'Scanning for threads needing entity back-references...'
    : 'Scanning for threads needing analysis...'
  console.log(scanMessage)

  let threadsToProcess = config.updateEntities
    ? await findThreadsNeedingEntityUpdate()
    : await findThreadsNeedingAnalysis()

  // Apply limit if specified
  if (config.limit > 0) {
    threadsToProcess = threadsToProcess.slice(0, config.limit)
  }

  stats.to_process = threadsToProcess.length

  console.log(`\nThreads found: ${stats.total_found}`)
  console.log(`Already analyzed: ${stats.already_analyzed}`)
  console.log(`To process: ${stats.to_process}\n`)

  if (stats.to_process === 0) {
    console.log('No threads to process. All done!')
    return
  }

  // Process in batches
  console.log('Processing threads...\n')

  for (let i = 0; i < threadsToProcess.length; i += config.batchSize) {
    const batch = threadsToProcess.slice(i, i + config.batchSize)

    // Process batch in parallel
    const promises = batch.map(async (thread) => {
      const result = await processThread(thread.thread_id, {
        dryRun: config.dryRun,
        force: config.force || config.updateEntities // Force re-analysis in update mode or when explicit
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
    printProgress(stats.processed, stats.to_process)

    // Delay between batches (unless last batch)
    if (i + config.batchSize < threadsToProcess.length) {
      await sleep(config.delayMs)
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
    config.updateEntities ||
    stats.back_refs_added > 0 ||
    stats.back_refs_skipped > 0
  ) {
    console.log(`Back-references added to entities: ${stats.back_refs_added}`)
    console.log(
      `Back-references skipped (already exist): ${stats.back_refs_skipped}`
    )
  }
  console.log(`Duration: ${formatDuration(elapsed)}`)
  console.log(
    `Average: ${stats.processed > 0 ? (elapsed / stats.processed).toFixed(0) : 0}ms per thread`
  )

  if (config.dryRun) {
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

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
