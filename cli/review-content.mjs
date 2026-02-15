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

const log = debug('cli:review-content')

// ============================================================================
// Constants
// ============================================================================

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'vendor',
  '__pycache__',
  'venv',
  'env',
  '.next'
])

const EXCLUDED_EXTENSIONS = new Set([
  // Binary/compiled
  '.pyc',
  '.pyo',
  '.so',
  '.dylib',
  '.dll',
  '.exe',
  '.bin',
  // Images
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.svg',
  '.ico',
  '.pdf',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  // Media
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  // Fonts
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  // Databases
  '.db',
  '.sqlite',
  // Lock files
  '.lock'
])

const EXCLUDED_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'Gemfile.lock',
  'composer.lock'
])

// ============================================================================
// File Discovery
// ============================================================================

function should_exclude_file(file_path) {
  const ext = path.extname(file_path).toLowerCase()
  if (EXCLUDED_EXTENSIONS.has(ext)) return true

  const basename = path.basename(file_path)
  if (EXCLUDED_FILENAMES.has(basename)) return true

  return false
}

/**
 * Discover files to scan from a path (file, directory, or glob)
 */
async function discover_files(target_path, { skip_raw_data = true } = {}) {
  const files = []

  const stat = await fs.stat(target_path).catch(() => null)
  if (!stat) {
    // Try as glob pattern
    const user_base = get_user_base_directory()
    const glob_target = path.isAbsolute(target_path)
      ? target_path
      : path.join(user_base, target_path)

    const matcher = picomatch(glob_target)
    // For glob patterns, walk the user base directory
    await walk_directory(user_base, files, { matcher, skip_raw_data })
    return files
  }

  if (stat.isFile()) {
    if (!should_exclude_file(target_path)) {
      files.push(target_path)
    }
    return files
  }

  if (stat.isDirectory()) {
    await walk_directory(target_path, files, { skip_raw_data })
  }

  return files
}

async function walk_directory(
  dir,
  files,
  { matcher = null, skip_raw_data = true } = {}
) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const full_path = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Skip excluded directories
      if (EXCLUDED_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      if (skip_raw_data && entry.name === 'raw-data') continue

      await walk_directory(full_path, files, { matcher, skip_raw_data })
    } else if (entry.isFile()) {
      if (should_exclude_file(full_path)) continue
      if (matcher && !matcher(full_path)) continue
      files.push(full_path)
    }
  }
}

/**
 * Detect thread directories from a file list.
 * Groups files by thread UUID and returns thread dirs + non-thread files.
 */
function separate_thread_files(files) {
  const thread_dirs = new Map()
  const non_thread_files = []

  for (const file of files) {
    // Match thread/<uuid>/ pattern
    const thread_match = file.match(/thread\/([0-9a-f-]{36})\//i)
    if (thread_match) {
      const uuid = thread_match[1]
      const dir = file.substring(0, file.indexOf(uuid) + uuid.length)
      thread_dirs.set(uuid, dir)
    } else {
      non_thread_files.push(file)
    }
  }

  return { thread_dirs, non_thread_files }
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
    describe: 'File, directory, or glob pattern to review',
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
    force: argv.force,
    apply_visibility: argv.applyVisibility,
    propose_rules: argv.proposeRules,
    show_progress: argv.progress,
    json_output: argv.json
  }

  // Discover files
  if (options.show_progress) {
    process.stderr.write('Discovering files...\n')
  }

  const all_files = await discover_files(target_path, {
    skip_raw_data: !options.include_raw_data
  })

  if (all_files.length === 0) {
    console.log('No files found to review.')
    return
  }

  // Separate thread files from regular files
  const { thread_dirs, non_thread_files } = separate_thread_files(all_files)

  const total_items = non_thread_files.length + thread_dirs.size
  if (options.show_progress) {
    process.stderr.write(
      `Found ${non_thread_files.length} files and ${thread_dirs.size} threads to review\n`
    )
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

  // Process non-thread files
  for (const file_path of non_thread_files) {
    scanned++

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
  for (const [uuid, thread_dir] of thread_dirs) {
    scanned++

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
        include_raw_data: options.include_raw_data
      })
      results.push(result)
      summary[result.classification]++

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
