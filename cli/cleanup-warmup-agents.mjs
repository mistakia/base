#!/usr/bin/env bun

/**
 * Cleanup Warmup Agent Threads
 *
 * This script identifies and removes warmup agent threads from the thread directory.
 * Warmup agents are initialization agents that provide no analytical value.
 *
 * Warmup agent patterns:
 * - Single entry with assistant role containing "ready to help" message
 * - Session ID starts with "agent-"
 * - Entry count of 1
 *
 * Usage:
 *   bun cli/cleanup-warmup-agents.mjs [--dry-run] [--verbose]
 *
 * Options:
 *   --dry-run   Show what would be deleted without actually deleting
 *   --verbose   Show detailed output for each thread
 */

import { readdir, readFile, rm, stat } from 'fs/promises'
import { join } from 'path'

if (!process.env.USER_BASE_DIRECTORY) {
  console.error('Error: USER_BASE_DIRECTORY is not set')
  process.exit(1)
}
const THREAD_DIR = join(process.env.USER_BASE_DIRECTORY, 'thread')

// Parse command line arguments
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const VERBOSE = args.includes('--verbose')

/**
 * Check if a thread is a warmup agent
 * @param {string} thread_id - Thread directory name
 * @returns {Promise<{is_warmup: boolean, reason: string}>}
 */
async function is_warmup_agent(thread_id) {
  const thread_dir = join(THREAD_DIR, thread_id)

  try {
    // Read metadata.json
    const metadata_path = join(thread_dir, 'metadata.json')
    const metadata_content = await readFile(metadata_path, 'utf-8')
    const metadata = JSON.parse(metadata_content)

    // Check if it's an agent session
    const external_session = metadata.external_session
    const session_id = external_session?.session_id || ''
    if (!session_id.startsWith('agent-')) {
      return { is_warmup: false, reason: 'not an agent session' }
    }

    // Check entry count - warmup agents typically have 1 entry
    const entry_count =
      external_session?.provider_metadata?.entry_count ||
      metadata.message_count ||
      0

    if (entry_count > 2) {
      return {
        is_warmup: false,
        reason: `has ${entry_count} entries (too many)`
      }
    }

    // Read timeline.json to check content
    const timeline_path = join(thread_dir, 'timeline.json')
    const timeline_content = await readFile(timeline_path, 'utf-8')
    const timeline = JSON.parse(timeline_content)

    if (timeline.length === 0) {
      return { is_warmup: true, reason: 'empty timeline' }
    }

    // Check for warmup patterns
    const first_entry = timeline[0]

    // Pattern 1: Single assistant message with "ready to help"
    if (timeline.length === 1 && first_entry.role === 'assistant') {
      const content =
        typeof first_entry.content === 'string'
          ? first_entry.content
          : JSON.stringify(first_entry.content)

      if (content.toLowerCase().includes('ready to help')) {
        return {
          is_warmup: true,
          reason: 'single assistant "ready to help" message'
        }
      }

      // Also check for common warm agent initialization messages
      if (
        content.toLowerCase().includes("i'll start by exploring") ||
        content.toLowerCase().includes("i've reviewed the system context") ||
        content.toLowerCase().includes('i understand my role')
      ) {
        return {
          is_warmup: true,
          reason: 'single assistant initialization message'
        }
      }
    }

    // Pattern 2: First entry is user with "Warmup" content
    if (first_entry.role === 'user') {
      const content =
        typeof first_entry.content === 'string'
          ? first_entry.content
          : JSON.stringify(first_entry.content)

      if (content.trim().toLowerCase() === 'warmup') {
        return { is_warmup: true, reason: 'user "Warmup" message' }
      }
    }

    return { is_warmup: false, reason: 'does not match warmup patterns' }
  } catch (error) {
    if (VERBOSE) {
      console.error(`Error checking ${thread_id}: ${error.message}`)
    }
    return { is_warmup: false, reason: `error: ${error.message}` }
  }
}

/**
 * Main cleanup function
 */
async function cleanup() {
  console.log('Scanning thread directory for warmup agents...')
  console.log(
    `Mode: ${DRY_RUN ? 'DRY RUN (no deletions)' : 'LIVE (will delete)'}`
  )
  console.log('')

  const entries = await readdir(THREAD_DIR)
  const thread_dirs = []

  // Filter to only directories
  for (const entry of entries) {
    const entry_path = join(THREAD_DIR, entry)
    const entry_stat = await stat(entry_path)
    if (entry_stat.isDirectory()) {
      thread_dirs.push(entry)
    }
  }

  console.log(`Found ${thread_dirs.length} thread directories`)
  console.log('')

  let warmup_count = 0
  let agent_count = 0
  let error_count = 0
  const warmup_threads = []

  for (const thread_id of thread_dirs) {
    const result = await is_warmup_agent(thread_id)

    if (result.is_warmup) {
      warmup_count++
      warmup_threads.push({ thread_id, reason: result.reason })
      if (VERBOSE) {
        console.log(`WARMUP: ${thread_id} - ${result.reason}`)
      }
    } else if (result.reason === 'not an agent session') {
      // Regular session, skip
    } else if (result.reason.startsWith('error:')) {
      error_count++
    } else {
      agent_count++
      if (VERBOSE) {
        console.log(`KEEP: ${thread_id} - ${result.reason}`)
      }
    }
  }

  console.log('')
  console.log('=== Summary ===')
  console.log(`Total threads: ${thread_dirs.length}`)
  console.log(`Agent threads (non-warmup): ${agent_count}`)
  console.log(`Warmup agents to remove: ${warmup_count}`)
  console.log(`Errors: ${error_count}`)
  console.log('')

  if (warmup_count === 0) {
    console.log('No warmup agents found. Nothing to clean up.')
    return
  }

  if (DRY_RUN) {
    console.log('DRY RUN - The following directories would be deleted:')
    for (const { thread_id, reason } of warmup_threads) {
      console.log(`  ${thread_id} (${reason})`)
    }
    console.log('')
    console.log('Run without --dry-run to actually delete these directories.')
  } else {
    console.log('Deleting warmup agent directories...')
    let deleted_count = 0

    for (const { thread_id } of warmup_threads) {
      const thread_path = join(THREAD_DIR, thread_id)
      try {
        await rm(thread_path, { recursive: true, force: true })
        deleted_count++
        if (VERBOSE) {
          console.log(`  Deleted: ${thread_id}`)
        }
      } catch (error) {
        console.error(`  Failed to delete ${thread_id}: ${error.message}`)
      }
    }

    console.log('')
    console.log(
      `Successfully deleted ${deleted_count} warmup agent directories.`
    )
  }
}

// Run the cleanup
cleanup().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
