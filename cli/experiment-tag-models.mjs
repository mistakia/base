#!/usr/bin/env node
/**
 * CLI to experiment with different models for tag analysis
 *
 * Runs tag analysis on a thread using multiple models and compares results.
 * Useful for evaluating model performance and calibrating the tag prompt.
 *
 * Usage:
 *   node cli/experiment-tag-models.mjs <thread_id> [options]
 *
 * Options:
 *   --models     Comma-separated list of models to test
 *   --output     Output format: table (default), json
 *
 * Examples:
 *   node cli/experiment-tag-models.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae
 *   node cli/experiment-tag-models.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae --models ollama/qwen3:32b,ollama/llama3.3:70b
 *   node cli/experiment-tag-models.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae --output json
 */

import path from 'path'
import debug from 'debug'

import {
  run_opencode,
  extract_model_response
} from '#libs-server/metadata/run-opencode-analysis.mjs'
import {
  load_tags_with_content,
  generate_tag_analysis_prompt,
  parse_tag_analysis_response
} from '#libs-server/metadata/generate-tag-prompt.mjs'
import { extract_first_user_message } from '#libs-server/metadata/analyze-thread.mjs'
import get_thread from '#libs-server/threads/get-thread.mjs'
import { read_timeline_jsonl_or_default } from '#libs-server/threads/timeline/timeline-jsonl.mjs'
import config from '#config'

// Enable debug logging
debug.enable('metadata:*')

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODELS = [
  'ollama/qwen2.5:72b',
  'ollama/qwen3:32b',
  'ollama/llama3.3:70b'
]

const DEFAULT_USER_PUBLIC_KEY = config.user_public_key

// ============================================================================
// CLI Parsing
// ============================================================================

const args = process.argv.slice(2)
const thread_id = args.find((arg) => !arg.startsWith('--'))

// Parse --models option
const models_index = args.indexOf('--models')
const models_arg = models_index !== -1 ? args[models_index + 1] : null
const models = models_arg ? models_arg.split(',') : DEFAULT_MODELS

// Parse --output option
const output_index = args.indexOf('--output')
const output_format = output_index !== -1 ? args[output_index + 1] : 'table'

if (!thread_id) {
  console.error(
    'Usage: node cli/experiment-tag-models.mjs <thread_id> [options]'
  )
  console.error('')
  console.error('Options:')
  console.error(
    '  --models     Comma-separated list of models to test (default: qwen2.5:72b,qwen3:32b,llama3.3:70b)'
  )
  console.error('  --output     Output format: table (default), json')
  process.exit(1)
}

// ============================================================================
// Main Experiment Logic
// ============================================================================

async function run_experiment() {
  console.log(`Experimenting with tag models for thread: ${thread_id}`)
  console.log(`Models: ${models.join(', ')}`)
  console.log('')

  // Get thread data
  const thread = await get_thread({ thread_id })
  console.log(`Thread title: ${thread.title || '(none)'}`)
  console.log(`Thread description: ${thread.short_description || '(none)'}`)
  console.log('')

  // Read timeline
  const timeline_path = path.join(thread.context_dir, 'timeline.jsonl')
  const timeline = await read_timeline_jsonl_or_default({
    timeline_path,
    default_value: []
  })

  // Extract first user message
  const user_message = extract_first_user_message(timeline)

  if (!user_message) {
    console.error('No user message found in thread')
    process.exit(1)
  }

  console.log('First user message:')
  console.log('---')
  console.log(
    user_message.length > 500 ? user_message.substring(0, 500) + '...' : user_message
  )
  console.log('---')
  console.log('')

  // Load available tags
  const available_tags = await load_tags_with_content({
    user_public_key: DEFAULT_USER_PUBLIC_KEY
  })

  console.log(`Available tags: ${available_tags.length}`)
  console.log('')

  // Generate prompt
  const prompt = generate_tag_analysis_prompt({
    user_message,
    title: thread.title,
    short_description: thread.short_description,
    tags: available_tags
  })

  // Run each model
  const results = []

  for (const model of models) {
    console.log(`Testing model: ${model}...`)

    const start_time = Date.now()
    const result = {
      model,
      duration_ms: 0,
      tags: [],
      reasoning: null,
      error: null,
      raw_response: null
    }

    try {
      const opencode_result = await run_opencode({
        prompt,
        model
      })

      result.duration_ms = opencode_result.duration_ms

      const response_text = extract_model_response(opencode_result.output)
      result.raw_response = response_text

      const parse_result = parse_tag_analysis_response(
        response_text,
        available_tags
      )

      if (parse_result.success) {
        result.tags = parse_result.tags
        result.reasoning = parse_result.reasoning
      } else {
        result.error = parse_result.error
      }
    } catch (error) {
      result.duration_ms = Date.now() - start_time
      result.error = error.message
    }

    results.push(result)
    console.log(
      `  Completed in ${result.duration_ms}ms - ${result.tags.length} tags`
    )
  }

  // Output results
  console.log('')
  console.log('='.repeat(80))
  console.log('RESULTS')
  console.log('='.repeat(80))
  console.log('')

  if (output_format === 'json') {
    console.log(JSON.stringify(results, null, 2))
  } else {
    // Table output
    for (const result of results) {
      console.log(`Model: ${result.model}`)
      console.log(`Duration: ${result.duration_ms}ms`)

      if (result.error) {
        console.log(`Error: ${result.error}`)
      } else {
        console.log(`Tags: ${result.tags.length > 0 ? result.tags.join(', ') : '(none)'}`)
        if (result.reasoning) {
          console.log(`Reasoning: ${result.reasoning}`)
        }
      }
      console.log('-'.repeat(40))
    }

    // Summary comparison
    console.log('')
    console.log('Tag Agreement Summary:')
    const all_tags = new Set()
    for (const result of results) {
      for (const tag of result.tags) {
        all_tags.add(tag)
      }
    }

    for (const tag of all_tags) {
      const model_count = results.filter((r) => r.tags.includes(tag)).length
      const percentage = ((model_count / models.length) * 100).toFixed(0)
      console.log(`  ${tag}: ${model_count}/${models.length} (${percentage}%)`)
    }
  }
}

// ============================================================================
// Execute
// ============================================================================

try {
  await run_experiment()
} catch (error) {
  console.error('Error:', error.message)
  process.exit(1)
}
