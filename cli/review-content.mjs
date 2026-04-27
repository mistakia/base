#!/usr/bin/env bun

/**
 * Content Review CLI
 *
 * Review files, directories, and entities for sensitive and personal information.
 * Combines regex pattern scanning with local LLM semantic analysis via Ollama.
 *
 * Primary output: per-entity public_read visibility classification
 * Secondary output: proposed role permission rule additions (--propose-rules)
 */

import fs from 'fs/promises'
import path from 'path'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import picomatch from 'picomatch'
import debug from 'debug'

import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import {
  analyze_content,
  analyze_thread
} from '#libs-server/content-review/analyze-content.mjs'
import { load_review_config } from '#libs-server/content-review/review-config.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { list_thread_ids } from '#libs-server/threads/list-threads.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { list_files_recursive } from '#libs-server/repository/filesystem/list-files-recursive.mjs'

const log = debug('cli:review-content')

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a file has YAML frontmatter with a type field (i.e., is an entity).
 * Reads only the first 1KB to avoid loading large files.
 */
async function has_entity_frontmatter(file_path) {
  let fd
  try {
    fd = await fs.open(file_path, 'r')
    const buffer = Buffer.alloc(8192)
    const { bytesRead: bytes_read } = await fd.read(buffer, 0, 8192, 0)
    const head = buffer.toString('utf8', 0, bytes_read)
    if (!head.startsWith('---')) return false
    const end = head.indexOf('\n---', 3)
    if (end === -1) return false
    const frontmatter = head.substring(3, end)
    return /^type:\s*\S+/m.test(frontmatter)
  } catch {
    return false
  } finally {
    if (fd) await fd.close().catch(() => {})
  }
}

/**
 * Filter a list of markdown file paths to only include entity files.
 */
async function filter_entity_files(file_paths) {
  const checks = await Promise.all(file_paths.map(has_entity_frontmatter))
  return file_paths.filter((_, i) => checks[i])
}

/**
 * Check if a relative path matches any forced_private_patterns from config.
 * Returns the matching pattern or null.
 */
function check_forced_private(relative_path, matchers) {
  for (const { pattern, match } of matchers) {
    if (match(relative_path)) {
      return pattern
    }
  }
  return null
}

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Discover entity files and thread IDs from a target path.
 * Uses list_files_recursive for entity .md files and list_thread_ids for threads.
 *
 * @param {string} target_path - Absolute path to scan
 * @returns {Promise<{entity_files: string[], thread_ids: string[]}>}
 */
async function discover_items(target_path, { exclude_patterns = [] } = {}) {
  const stat = await fs.stat(target_path).catch(() => null)
  if (!stat) {
    return { entity_files: [], thread_ids: [] }
  }

  if (stat.isFile()) {
    return { entity_files: [target_path], thread_ids: [] }
  }

  const thread_base = get_thread_base_directory()
  const target_resolved = path.resolve(target_path)
  const thread_resolved = path.resolve(thread_base)

  // Target is a specific thread UUID directory
  if (target_resolved.startsWith(thread_resolved + path.sep)) {
    const relative_to_thread = path.relative(thread_resolved, target_resolved)
    const uuid_match = relative_to_thread.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    )
    if (uuid_match) {
      return { entity_files: [], thread_ids: [uuid_match[1]] }
    }
    return { entity_files: [], thread_ids: [] }
  }

  // Target is the thread base directory - scan all threads
  if (target_resolved === thread_resolved) {
    const ids = await list_thread_ids()
    return { entity_files: [], thread_ids: ids }
  }

  // Merge thread exclusion with config-based exclude patterns
  const all_exclude_patterns = ['thread/**', ...exclude_patterns]

  // Target contains the thread directory (e.g., scanning user base root)
  if (thread_resolved.startsWith(target_resolved + path.sep)) {
    const [md_files, ids] = await Promise.all([
      list_files_recursive({
        directory: target_path,
        file_extension: '.md',
        absolute_paths: true,
        exclude_path_patterns: all_exclude_patterns
      }),
      list_thread_ids()
    ])
    const entity_files = await filter_entity_files(md_files)
    return { entity_files, thread_ids: ids }
  }

  // Entity directory only (e.g., task/, guideline/)
  const md_files = await list_files_recursive({
    directory: target_path,
    file_extension: '.md',
    absolute_paths: true,
    exclude_path_patterns: exclude_patterns
  })
  const entity_files = await filter_entity_files(md_files)
  return { entity_files, thread_ids: [] }
}

// ============================================================================
// Visibility Management
// ============================================================================

/**
 * Check if a file has already been analyzed (visibility_analyzed_at >= updated_at)
 */
async function is_already_analyzed(file_path) {
  try {
    let visibility_analyzed_at = null
    let updated_at = null

    if (file_path.endsWith('.md')) {
      const result = await read_entity_from_filesystem({
        absolute_path: file_path
      })
      visibility_analyzed_at = result.entity_properties.visibility_analyzed_at
      updated_at = result.entity_properties.updated_at
    } else if (file_path.endsWith('metadata.json')) {
      const content = JSON.parse(await fs.readFile(file_path, 'utf8'))
      visibility_analyzed_at = content.visibility_analyzed_at
      updated_at = content.updated_at
    }

    if (!visibility_analyzed_at || !updated_at) {
      return false
    }

    return new Date(visibility_analyzed_at) >= new Date(updated_at)
  } catch {
    // If we can't read the file, it hasn't been analyzed
  }
  return false
}

/**
 * Set public_read and visibility_analyzed_at on an entity
 */
async function apply_visibility(
  file_path,
  classification,
  dry_run = false,
  { visibility_reason } = {}
) {
  const public_read = classification === 'public'
  const now = new Date().toISOString()

  if (dry_run) {
    return {
      file_path,
      public_read,
      visibility_analyzed_at: now,
      ...(visibility_reason && { visibility_reason }),
      dry_run: true
    }
  }

  // Set public_read, visibility_analyzed_at, and [visibility] observation in a single read-write cycle
  if (file_path.endsWith('.md')) {
    const result = await read_entity_from_filesystem({
      absolute_path: file_path
    })
    if (!result.entity_properties || !result.entity_properties.type) {
      return {
        file_path,
        public_read,
        visibility_analyzed_at: now,
        dry_run: false,
        skipped: true,
        reason: 'no frontmatter'
      }
    }
    const updated_props = {
      ...result.entity_properties,
      public_read,
      visibility_analyzed_at: now
    }
    if (visibility_reason && !public_read) {
      const observations = updated_props.observations || []
      // Replace existing [visibility] observation or add new one (non-public only)
      const vis_prefix = '[visibility]'
      const filtered = observations.filter(
        (o) => typeof o !== 'string' || !o.startsWith(vis_prefix)
      )
      filtered.push(`${vis_prefix} ${visibility_reason}`)
      updated_props.observations = filtered
    } else if (public_read) {
      // Remove [visibility] observation from public entities
      const observations = updated_props.observations || []
      const filtered = observations.filter(
        (o) => typeof o !== 'string' || !o.startsWith('[visibility]')
      )
      if (filtered.length !== observations.length) {
        updated_props.observations = filtered
      }
    }
    await write_entity_to_filesystem({
      absolute_path: file_path,
      entity_properties: updated_props,
      entity_type: result.entity_properties.type,
      entity_content: result.entity_content
    })
  } else if (file_path.endsWith('metadata.json')) {
    const content = JSON.parse(await fs.readFile(file_path, 'utf8'))
    content.public_read = public_read
    content.visibility_analyzed_at = now
    if (visibility_reason) {
      content.visibility_reason = visibility_reason
    }
    await fs.writeFile(file_path, JSON.stringify(content, null, 2) + '\n')
  }

  return {
    file_path,
    public_read,
    visibility_analyzed_at: now,
    ...(visibility_reason && { visibility_reason }),
    dry_run: false
  }
}

// ============================================================================
// JSONL Streaming Output
// ============================================================================

/**
 * Load already-processed paths from an existing JSONL output file for resume support.
 * @param {string} output_path - Path to JSONL output file
 * @returns {Promise<Set<string>>} Set of already-processed file/thread paths
 */
async function load_processed_paths(output_path) {
  const processed = new Set()
  try {
    const content = await fs.readFile(output_path, 'utf8')
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line)
        if (record.type === 'summary') continue
        // Skip llm_unavailable records so they are retried on resume
        if (record.method === 'llm_unavailable') continue
        if (record.file_path) processed.add(record.file_path)
        if (record.thread_dir) processed.add(record.thread_dir)
      } catch {
        // Skip malformed lines
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log(`Warning reading output file: ${error.message}`)
    }
  }
  return processed
}

/**
 * Append a single JSONL record to the output file.
 * @param {string} output_path - Path to JSONL output file
 * @param {object} record - Record to write
 */
async function append_jsonl(output_path, record) {
  await fs.appendFile(output_path, JSON.stringify(record) + '\n')
}

// ============================================================================
// Rule Proposals
// ============================================================================

async function load_role_rules(role_path) {
  try {
    const result = await read_entity_from_filesystem({
      absolute_path: role_path
    })
    const rules_data = result.entity_properties?.rules
    if (!Array.isArray(rules_data)) {
      return []
    }
    return rules_data.map((r) => ({
      action: r.action,
      pattern: r.pattern,
      reason: r.reason || null
    }))
  } catch {
    return []
  }
}

function propose_rules(results, existing_rules) {
  const proposals = []
  const existing_matcher = existing_rules.map((r) => ({
    ...r,
    match: picomatch(r.pattern)
  }))

  for (const result of results) {
    const relative_path = result.file_path
    const already_covered = existing_matcher.some((r) => r.match(relative_path))

    if (!already_covered && result.classification === 'public') {
      proposals.push({
        action: 'allow',
        pattern: relative_path,
        reason: `Classified as public (confidence: ${result.confidence})`
      })
    } else if (result.classification === 'private') {
      // Check if within a broad allow
      const matching_allow = existing_matcher.find(
        (r) => r.action === 'allow' && r.match(relative_path)
      )
      if (matching_allow) {
        proposals.push({
          action: 'deny',
          pattern: relative_path,
          reason: `Sensitive content within broad allow pattern "${matching_allow.pattern}": ${result.reasoning}`
        })
      }
    }
  }

  return proposals
}

// ============================================================================
// Main CLI
// ============================================================================

const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
  .scriptName('review-content')
  .usage(
    'Review content for sensitive information\n\nUsage: $0 --path <path> [options]'
  )
  .middleware((argv) => {
    handle_cli_directory_registration(argv)
  })
  .option('path', {
    alias: 'p',
    describe: 'File or directory to review',
    type: 'string',
    demandOption: true
  })
  .option('model', {
    alias: 'm',
    describe: 'Ollama model to use for LLM analysis (defaults to config value)',
    type: 'string'
  })
  .option('regex-only', {
    describe: 'Skip LLM analysis, use regex patterns only',
    type: 'boolean',
    default: false
  })
  .option('dry-run', {
    describe: 'Preview changes without modifying files',
    type: 'boolean',
    default: false
  })
  .option('apply-visibility', {
    describe: 'Set public_read and visibility_analyzed_at on classified files',
    type: 'boolean',
    default: false
  })
  .option('propose-rules', {
    describe: 'Output proposed role permission rule additions',
    type: 'boolean',
    default: false
  })
  .option('json', {
    describe: 'Output results as JSON',
    type: 'boolean',
    default: false
  })
  .option('output', {
    alias: 'o',
    describe: 'Write JSONL streaming output to file (supports resume)',
    type: 'string'
  })
  .option('max-file-size', {
    describe: 'Maximum file size in characters for LLM analysis',
    type: 'number',
    default: 32000
  })
  .option('include-raw-data', {
    describe: 'Include raw-data/ directories in thread scanning',
    type: 'boolean',
    default: false
  })
  .option('timeline-llm', {
    describe: 'Use LLM analysis for timeline.jsonl files (default: regex-only)',
    type: 'boolean',
    default: false
  })
  .option('progress', {
    describe: 'Show progress during scanning',
    type: 'boolean',
    default: process.stdout.isTTY || false
  })
  .option('force', {
    describe: 'Re-scan files that already have visibility_analyzed_at',
    type: 'boolean',
    default: false
  })
  .option('privacy-filter', {
    describe:
      'Override privacy_filter.enabled per run (use --no-privacy-filter to force off)',
    type: 'boolean'
  })
  .example('$0 --path task/', 'Review all tasks')
  .example('$0 --path thread/ --regex-only', 'Regex-only scan of threads')
  .example(
    '$0 --path task/ --apply-visibility --dry-run',
    'Preview visibility changes'
  )
  .example(
    '$0 --path guideline/ --output /tmp/results.jsonl',
    'Stream results to JSONL file'
  )
  .help()
  .alias('help', 'h')
  .strict()
  .parseSync()

async function main() {
  const target_path = path.isAbsolute(argv.path)
    ? argv.path
    : path.join(get_user_base_directory(), argv.path)

  const options = {
    model: argv.model,
    regex_only: argv.regexOnly,
    dry_run: argv.dryRun,
    max_content_size: argv.maxFileSize,
    include_raw_data: argv.includeRawData,
    timeline_llm: argv.timelineLlm,
    force: argv.force,
    privacy_filter_override: argv.privacyFilter,
    apply_visibility: argv.applyVisibility,
    propose_rules: argv.proposeRules,
    show_progress: argv.progress,
    json_output: argv.json,
    output_path: argv.output
  }

  // Discover files
  if (options.show_progress) {
    process.stderr.write('Discovering files...\n')
  }

  // Load config for exclude patterns and forced-private matchers
  const review_config = await load_review_config()
  const exclude_patterns = review_config.exclude_patterns || []

  const { entity_files, thread_ids } = await discover_items(target_path, {
    exclude_patterns
  })
  const thread_base = get_thread_base_directory()
  const user_base = get_user_base_directory()
  const forced_private_patterns = review_config.forced_private_patterns || []
  const forced_private_matchers = forced_private_patterns.map((pattern) => ({
    pattern,
    match: picomatch(pattern)
  }))

  const total_items = entity_files.length + thread_ids.length
  if (total_items === 0) {
    console.log('No files found to review.')
    return
  }

  if (options.show_progress) {
    process.stderr.write(
      `Found ${entity_files.length} files and ${thread_ids.length} threads to review\n`
    )
  }

  // Load already-processed paths for JSONL resume support
  let processed_paths = new Set()
  if (options.output_path) {
    processed_paths = await load_processed_paths(options.output_path)
    if (processed_paths.size > 0 && options.show_progress) {
      process.stderr.write(
        `Resuming: ${processed_paths.size} items already processed\n`
      )
    }
  }

  const results = []
  let scanned = 0
  let skipped = 0
  const summary = {
    total: total_items,
    public: 0,
    acquaintance: 0,
    private: 0,
    errors: 0,
    skipped: 0,
    llm_unavailable: 0,
    visibility_changes: []
  }

  // Process entity files
  for (const file_path of entity_files) {
    scanned++

    // Skip if already in JSONL output (resume)
    if (processed_paths.has(file_path)) {
      skipped++
      summary.skipped++
      if (options.show_progress) {
        process.stderr.write(
          `[${scanned}/${total_items}] Skipped (resume): ${path.relative(user_base, file_path)}\n`
        )
      }
      continue
    }

    if (!options.force && (await is_already_analyzed(file_path))) {
      skipped++
      summary.skipped++
      if (options.show_progress) {
        process.stderr.write(
          `[${scanned}/${total_items}] Skipped (already analyzed): ${path.relative(user_base, file_path)}\n`
        )
      }
      continue
    }

    // Check forced-private patterns (skip analysis, classify as private directly)
    const relative_path = path.relative(user_base, file_path)
    const forced_pattern = check_forced_private(
      relative_path,
      forced_private_matchers
    )
    if (forced_pattern) {
      const forced_result = {
        file_path,
        classification: 'private',
        confidence: 1.0,
        reasoning: `Matched forced_private_patterns: "${forced_pattern}"`,
        method: 'forced_private',
        regex_findings: [],
        findings: []
      }
      results.push(forced_result)
      summary.private++

      if (options.output_path) {
        await append_jsonl(options.output_path, forced_result)
      }

      if (options.apply_visibility) {
        const vis_result = await apply_visibility(
          file_path,
          'private',
          options.dry_run,
          { visibility_reason: forced_result.reasoning }
        )
        summary.visibility_changes.push(vis_result)
      }

      if (options.show_progress) {
        process.stderr.write(
          `[${scanned}/${total_items}] Forced private: ${relative_path} (pattern: ${forced_pattern})\n`
        )
      }
      continue
    }

    if (options.show_progress) {
      process.stderr.write(
        `[${scanned}/${total_items}] Scanning: ${path.relative(user_base, file_path)}\n`
      )
    }

    try {
      const result = await analyze_content({
        file_path,
        model: options.model,
        regex_only: options.regex_only,
        max_content_size: options.max_content_size,
        privacy_filter_override: options.privacy_filter_override
      })

      if (result.method === 'llm_unavailable') {
        summary.llm_unavailable++
        if (options.show_progress) {
          process.stderr.write(
            `  Warning: LLM unavailable, skipping classification for ${path.relative(user_base, file_path)}\n`
          )
        }
        if (options.output_path) {
          await append_jsonl(options.output_path, result)
        }
        continue
      }

      results.push(result)
      summary[result.classification]++

      if (options.output_path) {
        await append_jsonl(options.output_path, result)
      }

      if (options.apply_visibility) {
        const vis_result = await apply_visibility(
          file_path,
          result.classification,
          options.dry_run,
          { visibility_reason: result.reasoning }
        )
        summary.visibility_changes.push(vis_result)
      }
    } catch (error) {
      summary.errors++
      log(`Error scanning ${file_path}: ${error.message}`)
      if (options.show_progress) {
        process.stderr.write(`  Error: ${error.message}\n`)
      }
    }
  }

  // Process thread directories
  for (const uuid of thread_ids) {
    scanned++
    const thread_dir = path.join(thread_base, uuid)

    // Skip if already in JSONL output (resume)
    if (processed_paths.has(thread_dir)) {
      skipped++
      summary.skipped++
      if (options.show_progress) {
        process.stderr.write(
          `[${scanned}/${total_items}] Skipped thread (resume): ${uuid}\n`
        )
      }
      continue
    }

    const metadata_path = path.join(thread_dir, 'metadata.json')
    if (!options.force && (await is_already_analyzed(metadata_path))) {
      skipped++
      summary.skipped++
      if (options.show_progress) {
        process.stderr.write(
          `[${scanned}/${total_items}] Skipped thread (already analyzed): ${uuid}\n`
        )
      }
      continue
    }

    // Check forced-private patterns for thread directories
    const thread_relative = path.relative(user_base, thread_dir)
    const forced_thread_pattern = check_forced_private(
      thread_relative,
      forced_private_matchers
    )
    if (forced_thread_pattern) {
      const forced_result = {
        thread_dir,
        classification: 'private',
        confidence: 1.0,
        reasoning: `Matched forced_private_patterns: "${forced_thread_pattern}"`,
        method: 'forced_private',
        total_regex_findings: 0,
        file_results: []
      }
      results.push(forced_result)
      summary.private++

      if (options.output_path) {
        await append_jsonl(options.output_path, forced_result)
      }

      if (options.apply_visibility) {
        const vis_result = await apply_visibility(
          metadata_path,
          'private',
          options.dry_run,
          { visibility_reason: forced_result.reasoning }
        )
        summary.visibility_changes.push(vis_result)
      }

      if (options.show_progress) {
        process.stderr.write(
          `[${scanned}/${total_items}] Forced private thread: ${uuid} (pattern: ${forced_thread_pattern})\n`
        )
      }
      continue
    }

    if (options.show_progress) {
      process.stderr.write(
        `[${scanned}/${total_items}] Scanning thread: ${uuid}\n`
      )
    }

    try {
      const result = await analyze_thread({
        thread_dir,
        model: options.model,
        regex_only: options.regex_only,
        max_content_size: options.max_content_size,
        include_raw_data: options.include_raw_data,
        timeline_llm: options.timeline_llm,
        privacy_filter_override: options.privacy_filter_override
      })

      if (result.method === 'llm_unavailable') {
        summary.llm_unavailable++
        if (options.show_progress) {
          process.stderr.write(
            `  Warning: LLM unavailable, skipping classification for thread ${uuid}\n`
          )
        }
        if (options.output_path) {
          await append_jsonl(options.output_path, result)
        }
        continue
      }

      results.push(result)
      summary[result.classification]++

      if (options.output_path) {
        await append_jsonl(options.output_path, result)
      }

      if (options.apply_visibility) {
        const vis_result = await apply_visibility(
          metadata_path,
          result.classification,
          options.dry_run
        )
        summary.visibility_changes.push(vis_result)
      }
    } catch (error) {
      summary.errors++
      log(`Error scanning thread ${uuid}: ${error.message}`)
      if (options.show_progress) {
        process.stderr.write(`  Error: ${error.message}\n`)
      }
    }
  }

  // Write summary record to JSONL output
  if (options.output_path) {
    await append_jsonl(options.output_path, {
      type: 'summary',
      total: summary.total,
      scanned: scanned - skipped,
      skipped: summary.skipped,
      public: summary.public,
      acquaintance: summary.acquaintance,
      private: summary.private,
      llm_unavailable: summary.llm_unavailable,
      errors: summary.errors
    })
  }

  // Rule proposals
  let rule_proposals = []
  if (options.propose_rules) {
    const public_reader_path = path.join(user_base, 'role', 'public-reader.md')
    const acquaintance_path = path.join(user_base, 'role', 'acquaintance.md')

    const public_rules = await load_role_rules(public_reader_path)
    const acquaintance_rules = await load_role_rules(acquaintance_path)

    // Make paths relative for rule matching
    const relative_results = results.map((r) => ({
      ...r,
      file_path: path.relative(user_base, r.file_path || r.thread_dir || '')
    }))

    rule_proposals = {
      public_reader: propose_rules(relative_results, public_rules),
      acquaintance: propose_rules(relative_results, acquaintance_rules)
    }
  }

  // Output
  if (options.json_output) {
    console.log(
      JSON.stringify(
        {
          summary: {
            total: summary.total,
            scanned: scanned - skipped,
            skipped: summary.skipped,
            public: summary.public,
            acquaintance: summary.acquaintance,
            private: summary.private,
            llm_unavailable: summary.llm_unavailable,
            errors: summary.errors
          },
          results,
          ...(options.propose_rules && { rule_proposals }),
          ...(options.apply_visibility && {
            visibility_changes: summary.visibility_changes
          })
        },
        null,
        2
      )
    )
  } else {
    // Human-readable output
    console.log('\n--- Content Review Summary ---\n')
    console.log(`Total items:  ${summary.total}`)
    console.log(`Scanned:      ${scanned - skipped}`)
    console.log(`Skipped:      ${summary.skipped}`)
    console.log(`Public:       ${summary.public}`)
    console.log(`Acquaintance: ${summary.acquaintance}`)
    console.log(`Private:      ${summary.private}`)
    if (summary.llm_unavailable > 0) {
      console.log(`LLM N/A:      ${summary.llm_unavailable}`)
    }
    console.log(`Errors:       ${summary.errors}`)

    if (results.length > 0) {
      console.log('\n--- Per-File Classifications ---\n')
      for (const r of results) {
        const rel_path = path.relative(
          user_base,
          r.file_path || r.thread_dir || ''
        )
        const method_tag = r.method === 'llm' ? '' : ` [${r.method}]`
        const warning_tag = r.warning ? ` (!)` : ''
        console.log(
          `  ${r.classification.padEnd(12)} ${rel_path}${method_tag}${warning_tag}`
        )
      }
    }

    if (options.apply_visibility && summary.visibility_changes.length > 0) {
      console.log('\n--- Visibility Changes ---\n')
      for (const vc of summary.visibility_changes) {
        const rel = path.relative(user_base, vc.file_path)
        const prefix = vc.dry_run ? '[DRY RUN] ' : ''
        console.log(`  ${prefix}${rel} -> public_read: ${vc.public_read}`)
      }
    }

    if (options.propose_rules && rule_proposals) {
      for (const [role, proposals] of Object.entries(rule_proposals)) {
        if (proposals.length > 0) {
          console.log(`\n--- Proposed Rules for ${role} ---\n`)
          for (const p of proposals) {
            console.log(`  - action: ${p.action}`)
            console.log(`    pattern: "${p.pattern}"`)
            console.log(`    reason: "${p.reason}"`)
          }
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`)
  process.exit(1)
})
