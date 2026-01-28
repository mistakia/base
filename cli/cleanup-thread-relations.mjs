#!/usr/bin/env node
/**
 * Cleanup Thread Relations
 *
 * Scans all thread metadata.json files and removes invalid relations
 * based on the base_uri validation rules in relation-validator.mjs.
 *
 * Usage:
 *   node cli/cleanup-thread-relations.mjs [options]
 *
 * Options:
 *   --dry-run     Show what would be cleaned up without making changes
 *   --verbose     Show detailed output for each thread
 *   --thread-dir  Path to thread directory (default: from config)
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import minimist from 'minimist'

import { is_valid_base_uri } from '#libs-shared/relation-validator.mjs'
import { parse_relation_string } from '#libs-shared/relation-parser.mjs'
import config from '#config/index.mjs'

const log = debug('cli:cleanup-thread-relations')

/**
 * UUID regex pattern for thread IDs
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Normalize a base_uri that uses invalid formats
 * Returns the normalized uri or null if it cannot be normalized
 *
 * @param {string} base_uri - The base_uri to normalize
 * @returns {string|null} Normalized base_uri or null
 */
function normalize_base_uri(base_uri) {
  if (!base_uri) return null

  // Convert thread:uuid to user:thread/uuid
  if (base_uri.startsWith('thread:')) {
    const thread_id = base_uri.slice(7) // Remove 'thread:' prefix
    if (UUID_REGEX.test(thread_id)) {
      return `user:thread/${thread_id}`
    }
    return null // Invalid thread ID format
  }

  // Convert bare thread/uuid path to user:thread/uuid
  const bare_thread_match = base_uri.match(/^thread\/([0-9a-f-]+)$/i)
  if (bare_thread_match && UUID_REGEX.test(bare_thread_match[1])) {
    return `user:thread/${bare_thread_match[1]}`
  }

  // Normalize sys:../ relative paths from worktrees
  // Pattern: sys:../base-worktrees/<branch>/repository/active/base/<path>
  // Becomes: sys:system/<path>
  const worktree_base_match = base_uri.match(
    /^sys:\.\.\/base-worktrees\/[^/]+\/repository\/active\/base\/system\/(.+)$/
  )
  if (worktree_base_match) {
    return `sys:system/${worktree_base_match[1]}`
  }

  // Pattern: sys:../base-worktrees/<branch>/system/<path>
  // Becomes: sys:system/<path>
  const worktree_system_match = base_uri.match(
    /^sys:\.\.\/base-worktrees\/[^/]+\/system\/(.+)$/
  )
  if (worktree_system_match) {
    return `sys:system/${worktree_system_match[1]}`
  }

  // Pattern: sys:../base-worktrees/<branch>/task/<path>
  // Becomes: user:task/<path>
  const worktree_task_match = base_uri.match(
    /^sys:\.\.\/base-worktrees\/[^/]+\/task\/(.+)$/
  )
  if (worktree_task_match) {
    return `user:task/${worktree_task_match[1]}`
  }

  // Pattern: sys:../base-worktrees/<branch>/guideline/<path>
  // Becomes: user:guideline/<path> or sys:system/guideline/<path>
  const worktree_guideline_match = base_uri.match(
    /^sys:\.\.\/base-worktrees\/[^/]+\/guideline\/(.+)$/
  )
  if (worktree_guideline_match) {
    return `user:guideline/${worktree_guideline_match[1]}`
  }

  // Pattern: sys:../base-worktrees/<branch>/workflow/<path>
  // Becomes: user:workflow/<path>
  const worktree_workflow_match = base_uri.match(
    /^sys:\.\.\/base-worktrees\/[^/]+\/workflow\/(.+)$/
  )
  if (worktree_workflow_match) {
    return `user:workflow/${worktree_workflow_match[1]}`
  }

  // Normalize bare user-directory paths (missing user: prefix)
  // Only convert if path has .md extension to avoid converting templates/variables
  const bare_user_path_match = base_uri.match(
    /^(task|workflow|guideline|tag|text|thread)\/(.+\.md)$/
  )
  if (bare_user_path_match) {
    return `user:${bare_user_path_match[1]}/${bare_user_path_match[2]}`
  }

  return null // Cannot normalize
}

/**
 * Get all thread directories
 * @param {string} thread_base_path - Base path to thread directory
 * @returns {Promise<string[]>} Array of thread IDs
 */
async function get_thread_ids(thread_base_path) {
  const entries = await fs.readdir(thread_base_path, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

/**
 * Read thread metadata
 * @param {string} thread_base_path - Base path to thread directory
 * @param {string} thread_id - Thread ID
 * @returns {Promise<Object|null>} Metadata object or null if not found
 */
async function read_metadata(thread_base_path, thread_id) {
  const metadata_path = path.join(thread_base_path, thread_id, 'metadata.json')
  try {
    const content = await fs.readFile(metadata_path, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * Write thread metadata
 * @param {string} thread_base_path - Base path to thread directory
 * @param {string} thread_id - Thread ID
 * @param {Object} metadata - Metadata object
 */
async function write_metadata(thread_base_path, thread_id, metadata) {
  const metadata_path = path.join(thread_base_path, thread_id, 'metadata.json')
  await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2) + '\n')
}

/**
 * Filter and normalize relations array
 * @param {Array<string>} relations - Array of relation strings
 * @returns {Object} Object with valid relations and stats
 */
function filter_valid_relations(relations) {
  if (!Array.isArray(relations)) {
    return {
      valid: [],
      removed: [],
      converted: [],
      stats: { total: 0, valid: 0, removed: 0, converted: 0 }
    }
  }

  const valid = []
  const removed = []
  const converted = []

  for (const relation_string of relations) {
    const parsed = parse_relation_string({ relation_string })

    if (!parsed) {
      // Malformed relation string - remove it
      removed.push({ relation: relation_string, reason: 'malformed' })
      continue
    }

    if (is_valid_base_uri({ base_uri: parsed.base_uri })) {
      valid.push(relation_string)
      continue
    }

    // Try to normalize the invalid base_uri
    const normalized = normalize_base_uri(parsed.base_uri)
    if (normalized && is_valid_base_uri({ base_uri: normalized })) {
      // Reconstruct the relation string with normalized base_uri
      const new_relation = `${parsed.relation_type} [[${normalized}]]`
      valid.push(new_relation)
      converted.push({
        original: relation_string,
        normalized: new_relation,
        reason: 'normalized'
      })
      continue
    }

    // Cannot normalize - remove it
    removed.push({ relation: relation_string, reason: 'invalid_base_uri' })
  }

  return {
    valid,
    removed,
    converted,
    stats: {
      total: relations.length,
      valid: valid.length,
      converted: converted.length,
      removed: removed.length
    }
  }
}

/**
 * Process a single thread
 * @param {Object} params
 * @param {string} params.thread_base_path - Base path to thread directory
 * @param {string} params.thread_id - Thread ID
 * @param {boolean} params.dry_run - Whether to skip writing changes
 * @param {boolean} params.verbose - Whether to show detailed output
 * @returns {Promise<Object>} Processing result
 */
async function process_thread({
  thread_base_path,
  thread_id,
  dry_run,
  verbose
}) {
  const metadata = await read_metadata(thread_base_path, thread_id)

  if (!metadata) {
    return { thread_id, status: 'skipped', reason: 'no_metadata' }
  }

  if (!metadata.relations || metadata.relations.length === 0) {
    return { thread_id, status: 'skipped', reason: 'no_relations' }
  }

  const { valid, removed, converted, stats } = filter_valid_relations(
    metadata.relations
  )

  // No changes needed if nothing was removed or converted
  if (removed.length === 0 && converted.length === 0) {
    return { thread_id, status: 'clean', stats }
  }

  if (verbose) {
    console.log(`\nThread: ${thread_id}`)
    console.log(
      `  Total: ${stats.total}, Valid: ${stats.valid}, Converted: ${stats.converted}, Removed: ${stats.removed}`
    )
    for (const item of converted) {
      console.log(`  ~ [converted] ${item.original}`)
      console.log(`              → ${item.normalized}`)
    }
    for (const item of removed) {
      console.log(`  - [${item.reason}] ${item.relation}`)
    }
  }

  if (!dry_run) {
    metadata.relations = valid
    metadata.relations_cleanup_at = new Date().toISOString()
    await write_metadata(thread_base_path, thread_id, metadata)
  }

  return {
    thread_id,
    status: 'cleaned',
    stats,
    removed,
    converted
  }
}

/**
 * Main function
 */
async function main() {
  const args = minimist(process.argv.slice(2), {
    boolean: ['dry-run', 'verbose', 'help'],
    string: ['thread-dir'],
    alias: {
      d: 'dry-run',
      v: 'verbose',
      h: 'help'
    }
  })

  if (args.help) {
    console.log(`
Usage: node cli/cleanup-thread-relations.mjs [options]

Options:
  --dry-run, -d     Show what would be cleaned up without making changes
  --verbose, -v     Show detailed output for each thread
  --thread-dir      Path to thread directory (default: from config)
  --help, -h        Show this help message
`)
    process.exit(0)
  }

  const dry_run = args['dry-run']
  const verbose = args.verbose
  const thread_base_path = args['thread-dir'] || config.thread_directory

  if (!thread_base_path) {
    console.error(
      'Error: thread directory not specified and not found in config'
    )
    process.exit(1)
  }

  console.log(`Cleaning up thread relations in: ${thread_base_path}`)
  if (dry_run) {
    console.log('DRY RUN - no changes will be made')
  }

  const thread_ids = await get_thread_ids(thread_base_path)
  console.log(`Found ${thread_ids.length} threads`)

  const results = {
    total: thread_ids.length,
    cleaned: 0,
    clean: 0,
    skipped: 0,
    errors: 0,
    total_removed: 0,
    total_converted: 0
  }

  for (const thread_id of thread_ids) {
    try {
      const result = await process_thread({
        thread_base_path,
        thread_id,
        dry_run,
        verbose
      })

      if (result.status === 'cleaned') {
        results.cleaned++
        results.total_removed += result.stats.removed
        results.total_converted += result.stats.converted
      } else if (result.status === 'clean') {
        results.clean++
      } else {
        results.skipped++
      }
    } catch (error) {
      results.errors++
      console.error(`Error processing thread ${thread_id}:`, error.message)
      log('Error details:', error)
    }
  }

  console.log('\n--- Summary ---')
  console.log(`Total threads: ${results.total}`)
  console.log(`Already clean: ${results.clean}`)
  console.log(`Cleaned: ${results.cleaned}`)
  console.log(`Skipped (no metadata/relations): ${results.skipped}`)
  console.log(`Errors: ${results.errors}`)
  console.log(`Total relations converted: ${results.total_converted}`)
  console.log(`Total relations removed: ${results.total_removed}`)

  if (dry_run && results.cleaned > 0) {
    console.log('\nRun without --dry-run to apply changes')
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
