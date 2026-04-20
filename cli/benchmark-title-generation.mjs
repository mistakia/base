#!/usr/bin/env bun

/**
 * Deterministic Title Generation Benchmark
 *
 * Runs the thread title prompt against labeled benchmark cases and produces
 * reproducible scores without an LLM judge. Complements the LLM-as-judge CLI
 * (evaluate-metadata-models.mjs) which remains as a qualitative secondary
 * signal.
 *
 * Scoring dimensions:
 *   - keyword_recall: fraction of expected_keywords present in generated title
 *   - rouge1_f1: ROUGE-1 unigram F1 against expected_title
 *   - length_ok: title non-empty, <= 100 chars
 *
 * The final composite score is `0.6 * keyword_recall + 0.4 * rouge1_f1`,
 * weighted toward keyword recall because domain-specific identifiers matter
 * more for title disambiguation than shared token overlap.
 */

import fs from 'fs/promises'
import path from 'path'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import { run_model_prompt } from '#libs-server/metadata/run-model-prompt.mjs'
import { parse_metadata_response } from '#libs-server/metadata/parse-analysis-output.mjs'
import {
  generate_title_prompt,
  TITLE_PROMPT_VERSION,
  TITLE_OUTPUT_SCHEMA
} from '#libs-server/metadata/generate-title-prompt.mjs'

const MAX_TITLE_LENGTH = 100

// ============================================================================
// Scoring
// ============================================================================

const normalize = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9/.\-_\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenize = (text) =>
  normalize(text)
    .split(' ')
    .filter((t) => t.length > 0)

const normalize_keyword = (text) =>
  (text || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()

const compute_keyword_recall = (title, expected_keywords, keyword_aliases) => {
  if (!Array.isArray(expected_keywords) || expected_keywords.length === 0) {
    return { recall: null, matched: [], missed: [] }
  }
  const haystack_raw = (title || '').toLowerCase()
  const haystack_normalized = normalize_keyword(title)
  const matched = []
  const missed = []
  for (const kw of expected_keywords) {
    const kw_lower = kw.toLowerCase()
    const kw_normalized = normalize_keyword(kw)
    const aliases = (keyword_aliases && keyword_aliases[kw]) || []

    const found =
      haystack_raw.includes(kw_lower) ||
      haystack_normalized.includes(kw_normalized) ||
      aliases.some((alias) => {
        const a = alias.toLowerCase()
        return (
          haystack_raw.includes(a) ||
          haystack_normalized.includes(normalize_keyword(alias))
        )
      })

    if (found) {
      matched.push(kw)
    } else {
      missed.push(kw)
    }
  }
  return {
    recall: matched.length / expected_keywords.length,
    matched,
    missed
  }
}

const compute_rouge1_f1 = (generated, expected) => {
  const gen_tokens = tokenize(generated)
  const exp_tokens = tokenize(expected)
  if (gen_tokens.length === 0 || exp_tokens.length === 0) return 0

  // Multiset overlap (count-aware), matching standard ROUGE-1.
  const exp_counts = new Map()
  for (const t of exp_tokens) exp_counts.set(t, (exp_counts.get(t) || 0) + 1)

  let overlap = 0
  for (const t of gen_tokens) {
    const c = exp_counts.get(t) || 0
    if (c > 0) {
      overlap += 1
      exp_counts.set(t, c - 1)
    }
  }

  if (overlap === 0) return 0
  const precision = overlap / gen_tokens.length
  const recall = overlap / exp_tokens.length
  return (2 * precision * recall) / (precision + recall)
}

const score_case = ({
  generated_title,
  expected_title,
  expected_keywords,
  keyword_aliases
}) => {
  const length_ok = Boolean(
    generated_title &&
    generated_title.length > 0 &&
    generated_title.length <= MAX_TITLE_LENGTH
  )
  const keyword = compute_keyword_recall(
    generated_title,
    expected_keywords,
    keyword_aliases
  )
  const rouge1_f1 = compute_rouge1_f1(generated_title, expected_title)
  const keyword_recall = keyword.recall ?? 0
  const composite = 0.6 * keyword_recall + 0.4 * rouge1_f1

  return {
    length_ok,
    keyword_recall,
    keyword_matched: keyword.matched,
    keyword_missed: keyword.missed,
    rouge1_f1: Math.round(rouge1_f1 * 1000) / 1000,
    composite: Math.round(composite * 1000) / 1000
  }
}

// ============================================================================
// Benchmark Loading
// ============================================================================

const load_benchmark_cases = async (benchmark_path) => {
  const raw = await fs.readFile(benchmark_path, 'utf8')
  const data = JSON.parse(raw)
  return data.cases
}

// ============================================================================
// Evaluation Runner
// ============================================================================

const evaluate_model = async ({ model, cases, verbose }) => {
  const results = []
  const latencies = []

  for (let i = 0; i < cases.length; i++) {
    const test_case = cases[i]
    const prompt = generate_title_prompt({
      user_message: test_case.first_user_message
    })

    let generated_title = null
    let generated_description = null
    let error = null
    let latency = null

    try {
      const start = Date.now()
      const model_result = await run_model_prompt({
        prompt,
        model,
        timeout_ms: 120000,
        format: TITLE_OUTPUT_SCHEMA
      })
      latency = Date.now() - start
      latencies.push(latency)

      const response_text = model_result.output || ''
      const parsed = parse_metadata_response(response_text)
      if (parsed.success) {
        generated_title = parsed.title
        generated_description = parsed.short_description
      } else {
        error = parsed.error
      }
    } catch (err) {
      error = err.message
    }

    const scores = score_case({
      generated_title,
      expected_title: test_case.expected_title,
      expected_keywords: test_case.expected_keywords,
      keyword_aliases: test_case.expected_keywords_aliases
    })

    const result = {
      thread_id: test_case.thread_id,
      category: test_case.category,
      expected_title: test_case.expected_title,
      expected_keywords: test_case.expected_keywords,
      generated_title,
      generated_description,
      latency_ms: latency,
      error,
      scores
    }

    results.push(result)

    const idx = `[${i + 1}/${cases.length}]`
    if (error) {
      console.log(`${idx} ${test_case.thread_id.slice(0, 8)} ERROR: ${error}`)
    } else {
      console.log(
        `${idx} ${test_case.thread_id.slice(0, 8)} composite=${scores.composite.toFixed(3)} kr=${scores.keyword_recall.toFixed(2)} rouge1=${scores.rouge1_f1.toFixed(2)} len=${generated_title?.length || 0}`
      )
      if (verbose) {
        console.log(`    expected: ${test_case.expected_title}`)
        console.log(`    generated: ${generated_title}`)
        if (scores.keyword_missed.length > 0) {
          console.log(
            `    missed keywords: ${scores.keyword_missed.join(', ')}`
          )
        }
      }
    }
  }

  const valid = results.filter((r) => !r.error && r.generated_title)
  const mean = (arr, getter) =>
    arr.length === 0
      ? 0
      : arr.reduce((sum, r) => sum + getter(r), 0) / arr.length

  const aggregate = {
    model,
    total_cases: cases.length,
    successful_cases: valid.length,
    error_cases: results.length - valid.length,
    avg_composite:
      Math.round(mean(valid, (r) => r.scores.composite) * 1000) / 1000,
    avg_keyword_recall:
      Math.round(mean(valid, (r) => r.scores.keyword_recall) * 1000) / 1000,
    avg_rouge1_f1:
      Math.round(mean(valid, (r) => r.scores.rouge1_f1) * 1000) / 1000,
    length_compliance:
      valid.length === 0
        ? 0
        : valid.filter((r) => r.scores.length_ok).length / valid.length,
    avg_latency_ms:
      latencies.length === 0
        ? 0
        : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
  }

  return { aggregate, results }
}

// ============================================================================
// CLI
// ============================================================================

const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
  .scriptName('benchmark-title-generation')
  .usage(
    'Deterministic thread title benchmark\n\nUsage: $0 --model <model> [--output <path>]'
  )
  .middleware((argv) => {
    handle_cli_directory_registration(argv)
  })
  .option('model', {
    describe:
      'Ollama model to benchmark (e.g. ollama/gemma4:26b). Repeat for cross-model survey.',
    type: 'array',
    default: ['ollama/qwen2.5:72b']
  })
  .option('benchmark-path', {
    describe: 'Path to benchmark cases JSON file',
    type: 'string'
  })
  .option('output', {
    alias: 'o',
    describe: 'Write full results as JSON to this path',
    type: 'string'
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Print expected/generated titles per case',
    type: 'boolean',
    default: false
  })
  .help()
  .alias('help', 'h')
  .strict()
  .parseSync()

const main = async () => {
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
  const models = argv.model.flatMap((m) => m.split(',')).map((m) => m.trim())

  console.log(`\nPrompt version: ${TITLE_PROMPT_VERSION}`)
  console.log(`Loaded ${cases.length} benchmark cases from ${benchmark_path}`)
  console.log(`Models: ${models.join(', ')}\n`)

  const survey = []
  for (const model of models) {
    console.log(`\n--- Benchmarking ${model} ---`)
    const { aggregate, results } = await evaluate_model({
      model,
      cases,
      verbose: argv.verbose
    })
    survey.push({ aggregate, results })
    console.log(
      `\n  composite=${aggregate.avg_composite}  keyword_recall=${aggregate.avg_keyword_recall}  rouge1_f1=${aggregate.avg_rouge1_f1}  length_ok=${aggregate.length_compliance.toFixed(2)}  avg_latency=${aggregate.avg_latency_ms}ms  ok=${aggregate.successful_cases}/${aggregate.total_cases}`
    )
  }

  console.log('\n\n========== TITLE BENCHMARK SUMMARY ==========\n')
  const header =
    'Model'.padEnd(36) +
    'Composite'.padEnd(12) +
    'KeywordR'.padEnd(12) +
    'Rouge1F1'.padEnd(12) +
    'LenOK'.padEnd(10) +
    'Latency'.padEnd(12) +
    'OK/Total'
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const { aggregate } of survey) {
    console.log(
      aggregate.model.padEnd(36) +
        String(aggregate.avg_composite).padEnd(12) +
        String(aggregate.avg_keyword_recall).padEnd(12) +
        String(aggregate.avg_rouge1_f1).padEnd(12) +
        aggregate.length_compliance.toFixed(2).padEnd(10) +
        `${aggregate.avg_latency_ms}ms`.padEnd(12) +
        `${aggregate.successful_cases}/${aggregate.total_cases}`
    )
  }
  console.log()

  if (argv.output) {
    const output_path = path.resolve(argv.output)
    const payload = {
      generated_at: new Date().toISOString(),
      prompt_version: TITLE_PROMPT_VERSION,
      benchmark_path,
      total_cases: cases.length,
      models: survey
    }
    await fs.writeFile(output_path, JSON.stringify(payload, null, 2), 'utf8')
    console.log(`Wrote detailed results to ${output_path}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
