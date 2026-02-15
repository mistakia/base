#!/usr/bin/env node

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
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { list_thread_ids } from '#libs-server/threads/list-threads.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { list_files_recursive } from '#libs-server/repository/filesystem/list-files-recursive.mjs'

const log = debug('cli:review-content')

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
async function discover_items(target_path) {
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

  // Target contains the thread directory (e.g., scanning user base root)
  if (thread_resolved.startsWith(target_resolved + path.sep)) {
    const [md_files, ids] = await Promise.all([
      list_files_recursive({
        directory: target_path,
        file_extension: '.md',
        absolute_paths: true,
        exclude_path_patterns: ['thread/**']
      }),
      list_thread_ids()
    ])
    return { entity_files: md_files, thread_ids: ids }
  }

  // Entity directory only (e.g., task/, guideline/)
  const md_files = await list_files_recursive({
    directory: target_path,
    file_extension: '.md',
    absolute_paths: true
  })
  return { entity_files: md_files, thread_ids: [] }
}

// ============================================================================
// Visibility Management
// ============================================================================

/**
 * Check if a file has already been analyzed (has visibility_analyzed_at newer than updated_at)
 */
async function is_already_analyzed(file_path) {
  try {
    if (file_path.endsWith('.md')) {
      const result = await read_entity_from_filesystem({
        absolute_path: file_path
      })
      const props = result.entity_properties
      if (
        props.visibility_analyzed_at &&
        props.updated_at &&
        new Date(props.visibility_analyzed_at) >= new Date(props.updated_at)
      ) {
        return true
      }
    } else if (file_path.endsWith('metadata.json')) {
      const content = JSON.parse(await fs.readFile(file_path, 'utf8'))
      if (
        content.visibility_analyzed_at &&
        content.updated_at &&
        new Date(content.visibility_analyzed_at) >= new Date(content.updated_at)
      ) {
        return true
      }
    }
  } catch {
    // If we can't read the file, it hasn't been analyzed
  }
  return false
}

/**
 * Set public_read and visibility_analyzed_at on an entity
 */
async function apply_visibility(file_path, classification, dry_run = false) {
  const public_read = classification === 'public'
  const now = new Date().toISOString()

  if (dry_run) {
    return {
      file_path,
      public_read,
      visibility_analyzed_at: now,
      dry_run: true
    }
  }

  // Set public_read and visibility_analyzed_at in a single read-write cycle
  if (file_path.endsWith('.md')) {
    const result = await read_entity_from_filesystem({
      absolute_path: file_path
    })
    await write_entity_to_filesystem({
      absolute_path: file_path,
      entity_properties: {
        ...result.entity_properties,
        public_read,
        visibility_analyzed_at: now
      },
      entity_type: result.entity_properties.type,
      entity_content: result.entity_content
    })
  } else if (file_path.endsWith('metadata.json')) {
    const content = JSON.parse(await fs.readFile(file_path, 'utf8'))
    content.public_read = public_read
    content.visibility_analyzed_at = now
    await fs.writeFile(file_path, JSON.stringify(content, null, 2) + '\n')
  }

  return { file_path, public_read, visibility_analyzed_at: now, dry_run: false }
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

  const { entity_files, thread_ids } = await discover_items(target_path)
  const thread_base = get_thread_base_directory()

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
          `[${scanned}/${total_items}] Skipped (resume): ${path.relative(get_user_base_directory(), file_path)}\n`
        )
      }
      continue
    }

    if (!options.force && (await is_already_analyzed(file_path))) {
      skipped++
      summary.skipped++
      if (options.show_progress) {
        process.stderr.write(
          `[${scanned}/${total_items}] Skipped (already analyzed): ${path.relative(get_user_base_directory(), file_path)}\n`
        )
      }
      continue
    }

    if (options.show_progress) {
      process.stderr.write(
        `[${scanned}/${total_items}] Scanning: ${path.relative(get_user_base_directory(), file_path)}\n`
      )
    }

    try {
      const result = await analyze_content({
        file_path,
        model: options.model,
        regex_only: options.regex_only,
        max_content_size: options.max_content_size
      })
      results.push(result)
      summary[result.classification]++

      if (options.output_path) {
        await append_jsonl(options.output_path, result)
      }

      if (options.apply_visibility) {
        const vis_result = await apply_visibility(
          file_path,
          result.classification,
          options.dry_run
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
        timeline_llm: options.timeline_llm
      })
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
      errors: summary.errors
    })
  }

  // Rule proposals
  let rule_proposals = []
  if (options.propose_rules) {
    const user_base = get_user_base_directory()
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
    console.log(`Errors:       ${summary.errors}`)

    if (results.length > 0) {
      console.log('\n--- Per-File Classifications ---\n')
      const user_base = get_user_base_directory()
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
        const rel = path.relative(get_user_base_directory(), vc.file_path)
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
