#!/usr/bin/env bun
/**
 * CLI to experiment with different models for tag analysis
 *
 * Runs tag analysis on a thread using multiple models and compares results.
 * Supports benchmark mode for ground-truth accuracy evaluation.
 *
 * Usage:
 *   bun cli/experiment-tag-models.mjs <thread_id> [options]
 *   bun cli/experiment-tag-models.mjs --benchmark-path <path> [options]
 *
 * Options:
 *   --models          Comma-separated list of models to test
 *   --output          Output format: table (default), json
 *   --benchmark-path  Path to benchmark cases JSON for ground-truth evaluation
 *
 * Examples:
 *   bun cli/experiment-tag-models.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae
 *   bun cli/experiment-tag-models.mjs 0149a02f-f3fd-5fd5-9f1a-e860f62e59ae --models ollama/qwen3:32b,ollama/llama3.3:70b
 *   bun cli/experiment-tag-models.mjs --benchmark-path config/tag-benchmarks/benchmark-cases.json --models ollama/devstral-small-2:24b
 */

import fs from 'fs/promises'
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
import {
  extract_first_user_message,
  extract_user_messages
} from '#libs-server/metadata/analyze-thread.mjs'
import get_thread from '#libs-server/threads/get-thread.mjs'
import { read_timeline_jsonl_or_default } from '#libs-server/threads/timeline/timeline-jsonl.mjs'
import config from '#config'

// Enable debug logging
debug.enable('metadata:*')

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODELS = ['ollama/qwen2.5:72b', 'ollama/qwen3:32b']

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

// Parse --benchmark-path option
const benchmark_index = args.indexOf('--benchmark-path')
const benchmark_path = benchmark_index !== -1 ? args[benchmark_index + 1] : null

if (!thread_id && !benchmark_path) {
  console.error(
    'Usage: bun cli/experiment-tag-models.mjs <thread_id> [options]'
  )
  console.error(
    '       bun cli/experiment-tag-models.mjs --benchmark-path <path> [options]'
  )
  console.error('')
  console.error('Options:')
  console.error(
    '  --models          Comma-separated list of models to test (default: qwen2.5:72b,qwen3:32b)'
  )
  console.error('  --output          Output format: table (default), json')
  console.error(
    '  --benchmark-path  Path to benchmark cases JSON for ground-truth evaluation'
  )
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

  // Extract user messages (multi-message with truncation)
  const user_message = extract_user_messages(timeline)

  if (!user_message) {
    console.error('No user message found in thread')
    process.exit(1)
  }

  console.log('User messages:')
  console.log('---')
  console.log(
    user_message.length > 500
      ? user_message.substring(0, 500) + '...'
      : user_message
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
        console.log(
          `Tags: ${result.tags.length > 0 ? result.tags.join(', ') : '(none)'}`
        )
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
// Benchmark Mode
// ============================================================================

async function run_benchmark() {
  const raw = await fs.readFile(path.resolve(benchmark_path), 'utf8')
  const data = JSON.parse(raw)
  const cases = data.cases

  console.log(`Benchmark mode: ${cases.length} cases from ${benchmark_path}`)
  console.log(`Models: ${models.join(', ')}`)
  console.log('')

  // Load available tags
  const available_tags = await load_tags_with_content({
    user_public_key: DEFAULT_USER_PUBLIC_KEY
  })
  console.log(`Available tags: ${available_tags.length}`)
  console.log('')

  const model_results = {}
  for (const model of models) {
    model_results[model] = {
      primary_matches: 0,
      secondary_overlaps: [],
      latencies: [],
      errors: 0,
      case_results: []
    }
  }

  for (let i = 0; i < cases.length; i++) {
    const bench_case = cases[i]
    process.stderr.write(`\n[${i + 1}/${cases.length}] ${bench_case.title}\n`)

    // Get thread data and first user message
    let thread, user_message
    try {
      thread = await get_thread({ thread_id: bench_case.thread_id })
      const timeline_path_full = path.join(thread.context_dir, 'timeline.jsonl')
      const timeline = await read_timeline_jsonl_or_default({
        timeline_path: timeline_path_full,
        default_value: []
      })
      user_message = extract_user_messages(timeline)

      if (!user_message) {
        process.stderr.write(`  Skipping: no user message found\n`)
        continue
      }
    } catch (error) {
      process.stderr.write(`  Skipping: ${error.message}\n`)
      continue
    }

    // Generate prompt
    const prompt = generate_tag_analysis_prompt({
      user_message,
      title: thread.title,
      short_description: thread.short_description,
      tags: available_tags
    })

    // Run each model on this case
    for (const model of models) {
      try {
        const opencode_result = await run_opencode({ prompt, model })
        const response_text = extract_model_response(opencode_result.output)
        const parse_result = parse_tag_analysis_response(
          response_text,
          available_tags
        )

        const predicted_tags = parse_result.success ? parse_result.tags : []
        const predicted_primary = predicted_tags[0] || null

        const acceptable_primaries = bench_case.expected_primary_tags
          ? bench_case.expected_primary_tags
          : bench_case.expected_primary_tag
            ? [bench_case.expected_primary_tag]
            : []
        const primary_match =
          predicted_primary !== null &&
          acceptable_primaries.includes(predicted_primary)
        if (primary_match) model_results[model].primary_matches++

        // Check secondary tag overlap
        const expected_secondary = bench_case.expected_secondary_tags || []
        const predicted_secondary = predicted_tags.slice(1)
        const overlap =
          expected_secondary.length > 0
            ? predicted_secondary.filter((t) => expected_secondary.includes(t))
                .length / expected_secondary.length
            : predicted_secondary.length === 0
              ? 1
              : 0
        model_results[model].secondary_overlaps.push(overlap)

        model_results[model].latencies.push(opencode_result.duration_ms)
        model_results[model].case_results.push({
          thread_id: bench_case.thread_id,
          primary_match,
          predicted_tags,
          expected_primary: acceptable_primaries,
          expected_secondary,
          duration_ms: opencode_result.duration_ms
        })

        process.stderr.write(
          `  ${model}: ${primary_match ? 'OK' : 'MISS'} [${predicted_tags.map((t) => t.split('/').pop().replace('.md', '')).join(', ')}] (${opencode_result.duration_ms}ms)\n`
        )
      } catch (error) {
        model_results[model].errors++
        process.stderr.write(`  ${model}: ERROR ${error.message}\n`)
      }
    }
  }

  // Print results
  console.log('')
  console.log('='.repeat(80))
  console.log('BENCHMARK RESULTS')
  console.log('='.repeat(80))
  console.log('')

  if (output_format === 'json') {
    console.log(JSON.stringify(model_results, null, 2))
  } else {
    console.log(
      'Model'.padEnd(30) +
        'Primary Acc'.padEnd(14) +
        'Secondary'.padEnd(12) +
        'Avg Latency'.padEnd(14) +
        'Errors'
    )
    console.log('-'.repeat(80))

    for (const model of models) {
      const r = model_results[model]
      const total = r.case_results.length
      const primary_acc =
        total > 0
          ? `${r.primary_matches}/${total} (${Math.round((r.primary_matches / total) * 100)}%)`
          : 'N/A'
      const sec_overlaps = r.secondary_overlaps
      const avg_secondary =
        sec_overlaps.length > 0
          ? `${Math.round((sec_overlaps.reduce((a, b) => a + b, 0) / sec_overlaps.length) * 100)}%`
          : 'N/A'
      const avg_latency =
        r.latencies.length > 0
          ? `${Math.round(r.latencies.reduce((a, b) => a + b, 0) / r.latencies.length)}ms`
          : 'N/A'

      console.log(
        model.padEnd(30) +
          primary_acc.padEnd(14) +
          avg_secondary.padEnd(12) +
          avg_latency.padEnd(14) +
          `${r.errors}`
      )
    }

    // Show misses
    for (const model of models) {
      const misses = model_results[model].case_results.filter(
        (r) => !r.primary_match
      )
      if (misses.length > 0) {
        console.log(`\n${model} - Mismatches:`)
        for (const miss of misses) {
          const expected = miss.expected_primary
            .map((t) => t.split('/').pop().replace('.md', ''))
            .join('|')
          const got = miss.predicted_tags[0]
            ? miss.predicted_tags[0].split('/').pop().replace('.md', '')
            : '(none)'
          console.log(`  ${miss.thread_id}: expected=${expected} got=${got}`)
        }
      }
    }
  }
}

// ============================================================================
// Execute
// ============================================================================

try {
  if (benchmark_path) {
    await run_benchmark()
  } else {
    await run_experiment()
  }
} catch (error) {
  console.error('Error:', error.message)
  process.exit(1)
}
