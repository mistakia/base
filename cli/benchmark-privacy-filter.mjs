#!/usr/bin/env bun

import fs from 'fs/promises'
import path from 'path'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import { analyze_content } from '#libs-server/content-review/analyze-content.mjs'
import {
  load_review_config,
  clear_review_config_cache
} from '#libs-server/content-review/review-config.mjs'
import { scan_file_content } from '#libs-server/content-review/pattern-scanner.mjs'
import { classify_text } from '#libs-server/content-review/privacy-filter-client.mjs'
import {
  apply_filter_floor,
  apply_regex_floor
} from '#libs-server/content-review/classification-floors.mjs'

const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
  .middleware((a) => handle_cli_directory_registration(a))
  .option('mode', { type: 'string', demandOption: true })
  .option('output_dir', { type: 'string', demandOption: true })
  .option('short_circuit', { type: 'boolean', default: true })
  .option('privacy_filter_enabled', { type: 'boolean', default: false })
  .option('skip_ollama', { type: 'boolean', default: false })
  .option('limit', { type: 'number', default: 0 })
  .parseSync()

function percentile(arr, p) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function run_filter_only_path({ file_path, content, pf_config }) {
  const start = Date.now()
  const scan_result = await scan_file_content({ file_path, content })
  const ext = path.extname(file_path).toLowerCase()
  let content_body = content
  if (ext === '.md' || ext === '.markdown') {
    const { default: fm } = await import('front-matter')
    content_body = fm(content).body
  }
  let filter_result = null
  try {
    filter_result = await classify_text({
      text: content_body,
      score_threshold: pf_config.score_threshold ?? 0
    })
  } catch (e) {
    filter_result = null
  }
  const result = {
    file_path,
    classification: 'public',
    confidence: 1.0,
    reasoning: 'filter-only synthetic mode',
    method:
      scan_result.findings.length === 0 &&
      (filter_result?.labels_found.length || 0) === 0
        ? 'regex_filter_short_circuit'
        : 'filter_only_floors',
    regex_findings: scan_result.findings,
    filter_result
  }
  if (scan_result.findings.length > 0) {
    apply_regex_floor(result, scan_result.findings)
  }
  if (filter_result) {
    apply_filter_floor(result, filter_result, pf_config)
  }
  const latency = Date.now() - start
  return { result, latency }
}

async function main() {
  const user_base = get_user_base_directory()
  const benchmark_path = path.join(
    user_base,
    'config',
    'content-review-benchmarks',
    'benchmark-cases.json'
  )
  const data = JSON.parse(await fs.readFile(benchmark_path, 'utf8'))
  const cases = argv.limit > 0 ? data.cases.slice(0, argv.limit) : data.cases

  // Load + monkeypatch review config for this mode
  clear_review_config_cache()
  const cfg = await load_review_config()
  cfg.privacy_filter = {
    ...cfg.privacy_filter,
    enabled: argv.privacy_filter_enabled,
    short_circuit_public: argv.short_circuit
  }

  await fs.mkdir(argv.output_dir, { recursive: true })
  const cases_path = path.join(argv.output_dir, 'cases.jsonl')
  const summary_path = path.join(argv.output_dir, 'summary.json')
  const cases_fd = await fs.open(cases_path, 'w')

  const latencies = []
  let correct = 0
  let total = 0
  let short_circuited = 0
  let errors = 0
  const by_class = {
    public: { tp: 0, fp: 0, fn: 0 },
    acquaintance: { tp: 0, fp: 0, fn: 0 },
    private: { tp: 0, fp: 0, fn: 0 }
  }

  process.stderr.write(`mode=${argv.mode} cases=${cases.length}\n`)

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    const fp = path.join(user_base, c.file_path)
    let result
    let latency
    try {
      const stat = await fs.stat(fp)
      void stat
    } catch {
      process.stderr.write(`  [${i + 1}/${cases.length}] MISSING ${c.file_path}\n`)
      continue
    }
    try {
      if (argv.skip_ollama) {
        const content = await fs.readFile(fp, 'utf8')
        const r = await run_filter_only_path({
          file_path: fp,
          content,
          pf_config: cfg.privacy_filter
        })
        result = r.result
        latency = r.latency
      } else {
        const start = Date.now()
        result = await analyze_content({
          file_path: fp,
          privacy_filter_override: argv.privacy_filter_enabled
        })
        latency = Date.now() - start
      }
    } catch (e) {
      errors++
      process.stderr.write(
        `  [${i + 1}/${cases.length}] ERROR ${c.file_path}: ${e.message}\n`
      )
      const row = {
        file: c.file_path,
        expected: c.expected_classification,
        actual: 'error',
        error: e.message,
        mode: argv.mode
      }
      await cases_fd.write(JSON.stringify(row) + '\n')
      continue
    }

    latencies.push(latency)
    total++
    const expected = c.expected_classification
    const actual = result.classification
    if (expected === actual) correct++
    if (result.method === 'regex_filter_short_circuit') short_circuited++

    for (const cls of ['public', 'acquaintance', 'private']) {
      if (actual === cls && expected === cls) by_class[cls].tp++
      else if (actual === cls && expected !== cls) by_class[cls].fp++
      else if (actual !== cls && expected === cls) by_class[cls].fn++
    }

    const ok = expected === actual ? 'OK' : 'MISS'
    process.stderr.write(
      `  [${i + 1}/${cases.length}] ${ok} ${c.file_path} expected=${expected} got=${actual} (${latency}ms)\n`
    )

    const row = {
      file: c.file_path,
      expected,
      actual,
      correct: expected === actual,
      method: result.method,
      regex_labels: (result.regex_findings || []).map((f) => f.category),
      filter_labels: result.filter_result?.labels_found || [],
      filter_short_circuited: result.method === 'regex_filter_short_circuit',
      latency_ms: latency,
      mode: argv.mode
    }
    await cases_fd.write(JSON.stringify(row) + '\n')
  }

  await cases_fd.close()

  const class_metrics = {}
  for (const cls of ['public', 'acquaintance', 'private']) {
    const { tp, fp, fn } = by_class[cls]
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0
    class_metrics[cls] = {
      precision: +precision.toFixed(3),
      recall: +recall.toFixed(3),
      f1:
        precision + recall > 0
          ? +((2 * precision * recall) / (precision + recall)).toFixed(3)
          : 0,
      tp,
      fp,
      fn
    }
  }

  const summary = {
    mode: argv.mode,
    timestamp: new Date().toISOString(),
    total_cases: cases.length,
    completed: total,
    errors,
    accuracy: total > 0 ? +(correct / total).toFixed(3) : 0,
    correct,
    short_circuited,
    latency_ms: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      avg: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0
    },
    by_class: class_metrics
  }

  await fs.writeFile(summary_path, JSON.stringify(summary, null, 2))
  process.stderr.write(
    `\n${argv.mode}: accuracy=${summary.accuracy} p50=${summary.latency_ms.p50}ms p95=${summary.latency_ms.p95}ms short_circuited=${short_circuited}/${total}\n`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
