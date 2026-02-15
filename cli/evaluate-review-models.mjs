#!/usr/bin/env node

/**
 * Model Evaluation Framework for Content Review
 *
 * Tests different local Ollama models and prompt strategies against known
 * benchmark cases to determine which model/prompt combination provides
 * the most accurate content classification.
 */

import fs from 'fs/promises'
import path from 'path'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import debug from 'debug'

import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import { analyze_content } from '#libs-server/content-review/analyze-content.mjs'

const log = debug('cli:evaluate-review-models')

// ============================================================================
// Benchmark Loading
// ============================================================================

async function load_benchmark_cases(benchmark_path) {
  const raw = await fs.readFile(benchmark_path, 'utf8')
  const data = JSON.parse(raw)
  return data.cases
}

// ============================================================================
// Metrics
// ============================================================================

function compute_metrics(predictions) {
  const total = predictions.length
  if (total === 0) {
    return {
      accuracy: 0,
      total: 0,
      correct: 0,
      by_class: {}
    }
  }

  let correct = 0
  const by_class = {}
  const classes = ['public', 'acquaintance', 'private']

  for (const cls of classes) {
    by_class[cls] = { tp: 0, fp: 0, fn: 0, tn: 0 }
  }

  for (const pred of predictions) {
    const expected = pred.expected
    const actual = pred.actual

    if (expected === actual) {
      correct++
    }

    for (const cls of classes) {
      if (actual === cls && expected === cls) by_class[cls].tp++
      else if (actual === cls && expected !== cls) by_class[cls].fp++
      else if (actual !== cls && expected === cls) by_class[cls].fn++
      else by_class[cls].tn++
    }
  }

  const accuracy = correct / total

  const class_metrics = {}
  for (const cls of classes) {
    const { tp, fp, fn } = by_class[cls]
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    class_metrics[cls] = {
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1:
        precision + recall > 0
          ? Math.round(
              ((2 * precision * recall) / (precision + recall)) * 1000
            ) / 1000
          : 0,
      support: by_class[cls].tp + by_class[cls].fn
    }
  }

  return {
    accuracy: Math.round(accuracy * 1000) / 1000,
    total,
    correct,
    by_class: class_metrics
  }
}

// ============================================================================
// Evaluation Runner
// ============================================================================

async function evaluate_model({
  model,
  cases,
  user_base,
  regex_only = false,
  verbose = false
}) {
  const predictions = []
  const latencies = []

  for (let i = 0; i < cases.length; i++) {
    const test_case = cases[i]
    const file_path = path.join(user_base, test_case.file_path)

    try {
      const start = Date.now()
      const result = await analyze_content({
        file_path,
        model,
        regex_only,
        max_content_size: 32000
      })
      const latency = Date.now() - start
      latencies.push(latency)

      const prediction = {
        file: test_case.file_path,
        expected: test_case.expected_classification,
        actual: result.classification,
        confidence: result.confidence,
        method: result.method,
        correct: test_case.expected_classification === result.classification,
        latency_ms: latency
      }
      predictions.push(prediction)

      if (verbose) {
        const status = prediction.correct ? 'OK' : 'MISS'
        process.stderr.write(
          `  [${i + 1}/${cases.length}] ${status} ${test_case.file_path} expected=${prediction.expected} got=${prediction.actual} (${latency}ms)\n`
        )
      } else {
        process.stderr.write(
          `  [${i + 1}/${cases.length}] ${prediction.correct ? '.' : 'X'}`
        )
      }
    } catch (error) {
      log(`Error evaluating ${test_case.file_path}: ${error.message}`)
      predictions.push({
        file: test_case.file_path,
        expected: test_case.expected_classification,
        actual: 'error',
        correct: false,
        error: error.message
      })
      if (verbose) {
        process.stderr.write(
          `  [${i + 1}/${cases.length}] ERROR ${test_case.file_path}: ${error.message}\n`
        )
      }
    }
  }

  if (!verbose) {
    process.stderr.write('\n')
  }

  const avg_latency =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0

  const metrics = compute_metrics(predictions)

  return {
    model,
    regex_only,
    metrics,
    avg_latency_ms: avg_latency,
    predictions
  }
}

// ============================================================================
// CLI
// ============================================================================

const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
  .scriptName('evaluate-review-models')
  .usage('Evaluate content review models\n\nUsage: $0 [options]')
  .middleware((argv) => {
    handle_cli_directory_registration(argv)
  })
  .option('models', {
    describe: 'Comma-separated list of models to test',
    type: 'string',
    default: 'ollama/qwen3:32b,ollama/devstral-small-2:24b,ollama/qwen3-coder-next:q8_0'
  })
  .option('prompts', {
    describe: 'Prompt strategies to test (comma-separated)',
    type: 'string',
    default: 'zero-shot,guideline'
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Show detailed per-case results',
    type: 'boolean',
    default: false
  })
  .option('output', {
    alias: 'o',
    describe: 'Save detailed results to file',
    type: 'string'
  })
  .option('benchmark-path', {
    describe: 'Path to benchmark cases JSON file',
    type: 'string'
  })
  .option('include-regex-baseline', {
    describe: 'Include regex-only baseline in evaluation',
    type: 'boolean',
    default: true
  })
  .help()
  .alias('help', 'h')
  .strict()
  .parseSync()

async function main() {
  const user_base = get_user_base_directory()
  const benchmark_path = argv.benchmarkPath
    ? path.resolve(argv.benchmarkPath)
    : path.join(
        user_base,
        'config',
        'content-review-benchmarks',
        'benchmark-cases.json'
      )

  const cases = await load_benchmark_cases(benchmark_path)
  const models = argv.models.split(',').map((m) => m.trim())

  console.log(`\nLoaded ${cases.length} benchmark cases`)
  console.log(`Testing models: ${models.join(', ')}`)
  console.log()

  // Verify benchmark files exist
  const valid_cases = []
  for (const c of cases) {
    const fp = path.join(user_base, c.file_path)
    try {
      await fs.access(fp)
      valid_cases.push(c)
    } catch {
      console.log(`  Warning: benchmark file not found: ${c.file_path}`)
    }
  }
  console.log(`Valid benchmark cases: ${valid_cases.length}/${cases.length}\n`)

  if (valid_cases.length === 0) {
    console.error('No valid benchmark cases found. Exiting.')
    process.exit(1)
  }

  const all_results = []

  // Regex-only baseline
  if (argv.includeRegexBaseline) {
    console.log('--- Regex-only Baseline ---')
    const result = await evaluate_model({
      model: 'none',
      cases: valid_cases,
      user_base,
      regex_only: true,
      verbose: argv.verbose
    })
    all_results.push(result)
  }

  // LLM models
  for (const model of models) {
    console.log(`\n--- Model: ${model} ---`)
    const result = await evaluate_model({
      model,
      cases: valid_cases,
      user_base,
      regex_only: false,
      verbose: argv.verbose
    })
    all_results.push(result)
  }

  // Print comparison table
  console.log('\n\n========== RESULTS ==========\n')
  console.log(
    'Model'.padEnd(35) +
      'Accuracy'.padEnd(10) +
      'Avg Latency'.padEnd(14) +
      'Public P/R'.padEnd(14) +
      'Private P/R'.padEnd(14)
  )
  console.log('-'.repeat(87))

  for (const r of all_results) {
    const model_name = r.regex_only ? 'regex-only' : r.model
    const pub = r.metrics.by_class.public || { precision: 0, recall: 0 }
    const priv = r.metrics.by_class.private || { precision: 0, recall: 0 }

    console.log(
      model_name.padEnd(35) +
        `${r.metrics.accuracy}`.padEnd(10) +
        `${r.avg_latency_ms}ms`.padEnd(14) +
        `${pub.precision}/${pub.recall}`.padEnd(14) +
        `${priv.precision}/${priv.recall}`.padEnd(14)
    )
  }

  console.log(
    `\nTotal cases: ${valid_cases.length} | ` +
      `Classes: public=${valid_cases.filter((c) => c.expected_classification === 'public').length}, ` +
      `private=${valid_cases.filter((c) => c.expected_classification === 'private').length}, ` +
      `acquaintance=${valid_cases.filter((c) => c.expected_classification === 'acquaintance').length}`
  )

  // Save detailed results
  if (argv.output) {
    const output_data = {
      timestamp: new Date().toISOString(),
      benchmark_cases: valid_cases.length,
      results: all_results
    }
    await fs.writeFile(argv.output, JSON.stringify(output_data, null, 2))
    console.log(`\nDetailed results saved to: ${argv.output}`)
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`)
  process.exit(1)
})
