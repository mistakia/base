#!/usr/bin/env bun
/**
 * CLI to analyze thread metadata using OpenCode with local models
 *
 * Usage:
 *   bun cli/analyze-thread-metadata.mjs <thread_id> [--dry-run]
 *
 * Examples:
 *   bun cli/analyze-thread-metadata.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae --dry-run
 *   bun cli/analyze-thread-metadata.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae
 */

import debug from 'debug'
import { analyze_thread_for_metadata } from '#libs-server/metadata/analyze-thread.mjs'

// Enable debug logging
debug.enable('metadata:*')

const args = process.argv.slice(2)
const thread_id = args.find((arg) => !arg.startsWith('--'))
const dry_run = args.includes('--dry-run')

if (!thread_id) {
  console.error(
    'Usage: bun cli/analyze-thread-metadata.mjs <thread_id> [--dry-run]'
  )
  console.error('')
  console.error('Options:')
  console.error(
    '  --dry-run    Show what would be updated without making changes'
  )
  process.exit(1)
}

console.log(`Analyzing thread: ${thread_id}`)
console.log(`Dry run: ${dry_run}`)
console.log('')

try {
  const result = await analyze_thread_for_metadata({
    thread_id,
    dry_run
  })

  console.log('')
  console.log('Result:')
  console.log(JSON.stringify(result, null, 2))

  if (result.status === 'updated') {
    console.log('')
    console.log('Thread metadata updated successfully')
  } else if (result.status === 'dry_run') {
    console.log('')
    console.log('Dry run - no changes made. Run without --dry-run to apply.')
  }
} catch (error) {
  console.error('Error:', error.message)
  process.exit(1)
}
