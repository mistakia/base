#!/usr/bin/env node
/**
 * CLI to analyze thread tags using local LLM models
 *
 * Usage:
 *   node cli/analyze-thread-tags.mjs <thread_id> [options]
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 *   --force      Re-analyze even if already analyzed
 *   --model      Specify model to use (default: ollama/qwen2.5:72b)
 *
 * Examples:
 *   node cli/analyze-thread-tags.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae --dry-run
 *   node cli/analyze-thread-tags.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae --force
 *   node cli/analyze-thread-tags.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae --model ollama/qwen3:32b
 */

import debug from 'debug'
import { analyze_thread_for_tags } from '#libs-server/metadata/analyze-thread-tags.mjs'

// Enable debug logging
debug.enable('metadata:*')

const args = process.argv.slice(2)
const thread_id = args.find((arg) => !arg.startsWith('--'))
const dry_run = args.includes('--dry-run')
const force = args.includes('--force')

// Parse --model option
const model_index = args.indexOf('--model')
const model = model_index !== -1 ? args[model_index + 1] : undefined

if (!thread_id) {
  console.error('Usage: node cli/analyze-thread-tags.mjs <thread_id> [options]')
  console.error('')
  console.error('Options:')
  console.error(
    '  --dry-run    Show what would be updated without making changes'
  )
  console.error('  --force      Re-analyze even if already analyzed')
  console.error(
    '  --model      Specify model to use (default: ollama/qwen2.5:72b)'
  )
  process.exit(1)
}

console.log(`Analyzing thread tags: ${thread_id}`)
console.log(`Dry run: ${dry_run}`)
console.log(`Force: ${force}`)
if (model) {
  console.log(`Model: ${model}`)
}
console.log('')

try {
  const result = await analyze_thread_for_tags({
    thread_id,
    model,
    dry_run,
    force
  })

  console.log('')
  console.log('Result:')
  console.log(JSON.stringify(result, null, 2))

  if (result.status === 'updated') {
    console.log('')
    console.log(
      `Thread tags updated: ${result.updates.tags.length} tag(s) assigned`
    )
  } else if (result.status === 'dry_run') {
    console.log('')
    console.log('Dry run - no changes made. Run without --dry-run to apply.')
  } else if (result.status === 'skipped') {
    console.log('')
    console.log(`Skipped: ${result.reason}`)
  }
} catch (error) {
  console.error('Error:', error.message)
  process.exit(1)
}
