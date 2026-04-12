#!/usr/bin/env bun

/**
 * Model Evaluation Framework for Thread Metadata Generation
 *
 * Tests different local Ollama models on metadata generation quality
 * using LLM-as-judge scoring on specificity, accuracy, and conciseness.
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
import { run_model_prompt } from '#libs-server/metadata/run-model-prompt.mjs'
import { parse_metadata_response } from '#libs-server/metadata/parse-analysis-output.mjs'
import { generate_title_prompt } from '#libs-server/metadata/generate-title-prompt.mjs'

const log = debug('cli:evaluate-metadata-models')

// ============================================================================
// Benchmark Loading
// ============================================================================

async function load_benchmark_cases(benchmark_path) {
  const raw = await fs.readFile(benchmark_path, 'utf8')
  const data = JSON.parse(raw)
  return data.cases
}

// ============================================================================
// LLM-as-Judge Scoring
// ============================================================================

function generate_judge_prompt({ generated, expected, first_user_message }) {
  return `You are evaluating the quality of AI-generated thread metadata. Score the generated title and description against the expected values.

## First User Message
"""
${first_user_message}
"""

## Expected Metadata
- Title: "${expected.title}"
- Description: "${expected.description}"

## Generated Metadata
- Title: "${generated.title || '(none)'}"
- Description: "${generated.description || '(none)'}"

## Scoring Dimensions (1-5 scale each)

**Specificity**: Does the generated title include specific identifiers (names, IDs, paths, dates) that distinguish this thread from similar ones? 1=completely generic, 5=highly specific with key identifiers.

**Accuracy**: Does the generated metadata correctly capture what the user is asking for? Does it match the intent of the first user message? 1=wrong/misleading, 5=perfectly captures intent.

**Conciseness**: Is the title appropriately concise (under 100 chars) without being vague? Is the description informative but brief (1-2 sentences)? 1=too verbose or too short to be useful, 5=ideal length.

Respond with ONLY a JSON object:
\`\`\`json
{
  "specificity": <1-5>,
  "accuracy": <1-5>,
  "conciseness": <1-5>,
  "reasoning": "<brief explanation>"
}
\`\`\``
}

async function score_with_judge({
  generated,
  expected,
  first_user_message,
  judge_model
}) {
  const prompt = generate_judge_prompt({
    generated,
    expected,
    first_user_message
  })

  try {
    const result = await run_model_prompt({
      prompt,
      model: judge_model,
      timeout_ms: 60000
    })

    const response_text = result.output || ''
    // Parse JSON from response
    const json_match =
      response_text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      response_text.match(/\{[\s\S]*\}/)
    if (json_match) {
      const text = json_match[1] || json_match[0]
      const scores = JSON.parse(text.trim())
      return {
        specificity: scores.specificity || 0,
        accuracy: scores.accuracy || 0,
        conciseness: scores.conciseness || 0,
        reasoning: scores.reasoning || '',
        avg:
          Math.round(
            ((scores.specificity + scores.accuracy + scores.conciseness) / 3) *
              100
          ) / 100
      }
    }
  } catch (error) {
    log(`Judge scoring failed: ${error.message}`)
  }

  return {
    specificity: 0,
    accuracy: 0,
    conciseness: 0,
    reasoning: 'scoring failed',
    avg: 0
  }
}

// ============================================================================
// Evaluation Runner
// ============================================================================

async function evaluate_model({ model, cases, judge_model, verbose }) {
  const results = []
  const latencies = []

  for (let i = 0; i < cases.length; i++) {
    const test_case = cases[i]
    const prompt = generate_title_prompt({
      user_message: test_case.first_user_message
    })

    try {
      const start = Date.now()
      const model_result = await run_model_prompt({
        prompt,
        model,
        timeout_ms: 120000
      })
      const latency = Date.now() - start
      latencies.push(latency)

      const response_text = model_result.output || ''
      const metadata = parse_metadata_response(response_text)

      const generated = {
        title: metadata.title || null,
        description: metadata.short_description || null
      }

      // Score with judge model
      const scores = await score_with_judge({
        generated,
        expected: {
          title: test_case.expected_title,
          description: test_case.expected_description
        },
        first_user_message: test_case.first_user_message,
        judge_model
      })

      const case_result = {
        thread_id: test_case.thread_id,
        category: test_case.category,
        expected_title: test_case.expected_title,
        generated_title: generated.title,
        expected_description: test_case.expected_description,
        generated_description: generated.description,
        scores,
        latency_ms: latency
      }
      results.push(case_result)

      if (verbose) {
        process.stderr.write(
          `  [${i + 1}/${cases.length}] avg=${scores.avg} "${generated.title}" (${latency}ms)\n`
        )
      } else {
        process.stderr.write(
          `  [${i + 1}/${cases.length}] ${scores.avg >= 3.5 ? '.' : 'X'}`
        )
      }
    } catch (error) {
      log(`Error evaluating case ${test_case.thread_id}: ${error.message}`)
      results.push({
        thread_id: test_case.thread_id,
        category: test_case.category,
        expected_title: test_case.expected_title,
        generated_title: null,
        scores: {
          specificity: 0,
          accuracy: 0,
          conciseness: 0,
          avg: 0,
          reasoning: error.message
        },
        latency_ms: 0,
        error: error.message
      })
      if (verbose) {
        process.stderr.write(
          `  [${i + 1}/${cases.length}] ERROR: ${error.message}\n`
        )
      }
    }
  }

  if (!verbose) {
    process.stderr.write('\n')
  }

  // Compute aggregates
  const valid_results = results.filter((r) => r.scores.avg > 0)
  const avg_quality =
    valid_results.length > 0
      ? Math.round(
          (valid_results.reduce((sum, r) => sum + r.scores.avg, 0) /
            valid_results.length) *
            100
        ) / 100
      : 0
  const avg_specificity =
    valid_results.length > 0
      ? Math.round(
          (valid_results.reduce((sum, r) => sum + r.scores.specificity, 0) /
            valid_results.length) *
            100
        ) / 100
      : 0
  const avg_accuracy =
    valid_results.length > 0
      ? Math.round(
          (valid_results.reduce((sum, r) => sum + r.scores.accuracy, 0) /
            valid_results.length) *
            100
        ) / 100
      : 0
  const avg_conciseness =
    valid_results.length > 0
      ? Math.round(
          (valid_results.reduce((sum, r) => sum + r.scores.conciseness, 0) /
            valid_results.length) *
            100
        ) / 100
      : 0
  const avg_latency =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0

  return {
    model,
    avg_quality,
    avg_specificity,
    avg_accuracy,
    avg_conciseness,
    avg_latency_ms: avg_latency,
    total_cases: cases.length,
    successful_cases: valid_results.length,
    results
  }
}

// ============================================================================
// CLI
// ============================================================================

const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
  .scriptName('evaluate-metadata-models')
  .usage('Evaluate thread metadata generation models\n\nUsage: $0 [options]')
  .middleware((argv) => {
    handle_cli_directory_registration(argv)
  })
  .option('models', {
    describe: 'Comma-separated list of models to test',
    type: 'string',
    default: 'ollama/devstral-small-2:24b'
  })
  .option('judge-model', {
    describe: 'Model to use as LLM-as-judge for scoring',
    type: 'string',
    default: 'ollama/qwen3:32b'
  })
  .option('benchmark-path', {
    describe: 'Path to benchmark cases JSON file',
    type: 'string'
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
        'metadata-benchmarks',
        'benchmark-cases.json'
      )

  const cases = await load_benchmark_cases(benchmark_path)
  const models = argv.models.split(',').map((m) => m.trim())
  const judge_model = argv.judgeModel

  console.log(`\nLoaded ${cases.length} benchmark cases`)
  console.log(`Testing models: ${models.join(', ')}`)
  console.log(`Judge model: ${judge_model}`)
  console.log()

  const all_results = []

  for (const model of models) {
    console.log(`\n--- Model: ${model} ---`)
    const result = await evaluate_model({
      model,
      cases,
      judge_model,
      verbose: argv.verbose
    })
    all_results.push(result)
  }

  // Print comparison table
  console.log('\n\n========== RESULTS ==========\n')
  console.log(
    'Model'.padEnd(30) +
      'Quality'.padEnd(10) +
      'Specific'.padEnd(10) +
      'Accurate'.padEnd(10) +
      'Concise'.padEnd(10) +
      'Latency'.padEnd(12) +
      'Cases'
  )
  console.log('-'.repeat(92))

  for (const r of all_results) {
    console.log(
      r.model.padEnd(30) +
        `${r.avg_quality}`.padEnd(10) +
        `${r.avg_specificity}`.padEnd(10) +
        `${r.avg_accuracy}`.padEnd(10) +
        `${r.avg_conciseness}`.padEnd(10) +
        `${r.avg_latency_ms}ms`.padEnd(12) +
        `${r.successful_cases}/${r.total_cases}`
    )
  }

  console.log(`\nJudge model: ${judge_model}`)

  // Save detailed results
  if (argv.output) {
    const output_data = {
      timestamp: new Date().toISOString(),
      judge_model,
      benchmark_cases: cases.length,
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
