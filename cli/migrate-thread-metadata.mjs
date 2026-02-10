#!/usr/bin/env node

/**
 * Migrate Thread Metadata CLI Tool
 *
 * One-time migration to update existing thread metadata files from old schema
 * to new schema. Moves external_session fields into a top-level `source` object,
 * merges plan_slug into provider_metadata, consolidates model into models array,
 * and initializes tools_used/bash_commands_used arrays.
 *
 * Examples:
 *
 *   # Dry run to preview migration
 *   node cli/migrate-thread-metadata.mjs --dry-run
 *
 *   # Migrate all threads
 *   node cli/migrate-thread-metadata.mjs
 *
 *   # Migrate a single thread
 *   node cli/migrate-thread-metadata.mjs --thread-id abc123
 */

import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

const log = debug('cli:migrate-thread-metadata')

/**
 * Build the new `source` object from old metadata fields
 *
 * @param {Object} params Parameters
 * @param {Object} params.metadata The current metadata object
 * @returns {Object|null} The new source object, or null if no migration needed
 */
function build_source_object({ metadata }) {
  const { external_session, session_provider } = metadata

  if (!external_session && !session_provider) {
    return null
  }

  const source = {}

  // Determine provider: top-level session_provider takes precedence,
  // then external_session.session_provider
  if (session_provider) {
    source.provider = session_provider
  } else if (external_session?.session_provider) {
    source.provider = external_session.session_provider
  }

  // Map external_session fields to source
  if (external_session) {
    if (external_session.session_id) {
      source.session_id = external_session.session_id
    }

    if (external_session.imported_at) {
      source.imported_at = external_session.imported_at
    }

    if (external_session.raw_data_saved !== undefined) {
      source.raw_data_saved = external_session.raw_data_saved
    }

    // Build provider_metadata: start with existing, merge plan_slug into it
    const existing_provider_metadata = external_session.provider_metadata
    const plan_slug = external_session.plan_slug

    if (existing_provider_metadata || plan_slug) {
      source.provider_metadata = { ...(existing_provider_metadata || {}) }

      // Merge plan_slug into provider_metadata if present at external_session level
      if (plan_slug !== undefined) {
        source.provider_metadata.plan_slug = plan_slug
      }
    }
  }

  return source
}

/**
 * Merge a single model string into the models array if not already present
 *
 * @param {Object} params Parameters
 * @param {string[]} params.models Existing models array
 * @param {string} params.model Single model string to merge
 * @returns {string[]} Updated models array
 */
function merge_model_into_models({ models = [], model }) {
  if (!model) {
    return models
  }

  if (models.includes(model)) {
    return models
  }

  return [...models, model]
}

/**
 * Infer source from models array for threads with no provider info.
 * These are orphan/test threads that predate the session provider system.
 */
function infer_source_from_models(models) {
  if (models && models.length > 0) {
    const model = models[0]
    if (model.includes('claude')) return { provider: 'claude' }
    if (model.includes('gpt')) return { provider: 'openai' }
    if (model.includes('cursor')) return { provider: 'cursor' }
  }
  // Default to claude -- all production sessions are claude-based
  return { provider: 'claude' }
}

/**
 * Migrate a single thread's metadata from old schema to new schema
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_path Path to thread directory
 * @param {boolean} params.dry_run If true, only preview changes
 * @returns {Promise<Object>} Migration result
 */
async function migrate_thread({ thread_path, dry_run = false }) {
  const thread_id = path.basename(thread_path)
  const metadata_path = path.join(thread_path, 'metadata.json')

  try {
    // Check if metadata file exists
    const metadata_exists = await fs
      .access(metadata_path)
      .then(() => true)
      .catch(() => false)

    if (!metadata_exists) {
      return { thread_id, status: 'no_metadata' }
    }

    // Read and parse metadata
    const raw = await fs.readFile(metadata_path, 'utf-8')
    let metadata

    try {
      metadata = JSON.parse(raw)
    } catch (parse_error) {
      return {
        thread_id,
        status: 'error',
        error: `JSON parse error: ${parse_error.message}`
      }
    }

    // Skip files that already have a source object (already migrated)
    if (metadata.source) {
      return { thread_id, status: 'already_migrated' }
    }

    // Determine if there is anything to migrate
    const has_external_session = Boolean(metadata.external_session)
    const has_session_provider = Boolean(metadata.session_provider)
    const has_model = Boolean(metadata.model)
    const has_tools_used = Array.isArray(metadata.tools_used)
    const has_bash_commands_used = Array.isArray(metadata.bash_commands_used)

    const needs_source_migration = has_external_session || has_session_provider
    // Threads with no provider info at all still need source (schema requires it)
    const needs_source_init = !has_external_session && !has_session_provider
    const needs_model_migration = has_model
    const needs_tools_init = !has_tools_used
    const needs_bash_commands_init = !has_bash_commands_used

    if (
      !needs_source_migration &&
      !needs_source_init &&
      !needs_model_migration &&
      !needs_tools_init &&
      !needs_bash_commands_init
    ) {
      return { thread_id, status: 'skipped', reason: 'nothing_to_migrate' }
    }

    // Build changes description for dry run
    const changes = []

    if (needs_source_migration) {
      changes.push('external_session -> source')
    }
    if (needs_source_init) {
      changes.push('initialize source (infer provider from models)')
    }
    if (needs_model_migration) {
      changes.push(`merge model "${metadata.model}" into models`)
    }
    if (needs_tools_init) {
      changes.push('initialize tools_used')
    }
    if (needs_bash_commands_init) {
      changes.push('initialize bash_commands_used')
    }

    if (dry_run) {
      log(`[DRY RUN] ${thread_id}: ${changes.join(', ')}`)
      return {
        thread_id,
        status: 'would_migrate',
        changes
      }
    }

    // Apply migrations to a new metadata object preserving field order
    const migrated = { ...metadata }

    // Build and set source object
    if (needs_source_migration) {
      const source = build_source_object({ metadata })
      if (source) {
        migrated.source = source
      }

      // Remove old fields
      delete migrated.external_session
      delete migrated.session_provider
    } else if (needs_source_init) {
      // Threads with no provider info -- infer from models
      migrated.source = infer_source_from_models(metadata.models)
    }

    // Merge model into models array and remove model field
    if (needs_model_migration) {
      migrated.models = merge_model_into_models({
        models: migrated.models,
        model: migrated.model
      })
      delete migrated.model
    }

    // Initialize tools_used and bash_commands_used if not present
    if (needs_tools_init) {
      migrated.tools_used = []
    }

    if (needs_bash_commands_init) {
      migrated.bash_commands_used = []
    }

    // Write migrated metadata
    await fs.writeFile(
      metadata_path,
      JSON.stringify(migrated, null, 2) + '\n',
      'utf-8'
    )

    log(`Migrated ${thread_id}: ${changes.join(', ')}`)

    return {
      thread_id,
      status: 'migrated',
      changes
    }
  } catch (error) {
    return {
      thread_id,
      status: 'error',
      error: error.message
    }
  }
}

/**
 * Migrate all threads in the thread base directory
 *
 * @param {Object} params Parameters
 * @param {boolean} params.dry_run If true, only preview changes
 * @param {string} [params.thread_id] Optional single thread ID to migrate
 * @returns {Promise<Object>} Migration statistics
 */
async function migrate_all_threads({ dry_run = false, thread_id = null }) {
  const thread_base = get_thread_base_directory()
  const stats = {
    total: 0,
    migrated: 0,
    would_migrate: 0,
    already_migrated: 0,
    skipped: 0,
    no_metadata: 0,
    errors: []
  }

  if (thread_id) {
    const thread_path = path.join(thread_base, thread_id)
    const result = await migrate_thread({ thread_path, dry_run })
    stats.total = 1
    apply_result_to_stats({ stats, result })
    return stats
  }

  // Migrate all threads
  const entries = await fs.readdir(thread_base, { withFileTypes: true })
  const thread_dirs = entries.filter((entry) => entry.isDirectory())

  console.log(`Found ${thread_dirs.length} thread directories`)

  for (const dir of thread_dirs) {
    const thread_path = path.join(thread_base, dir.name)
    const result = await migrate_thread({ thread_path, dry_run })
    stats.total++
    apply_result_to_stats({ stats, result })

    // Progress indicator every 100 threads
    if (stats.total % 100 === 0) {
      console.log(`Progress: ${stats.total}/${thread_dirs.length}`)
    }
  }

  return stats
}

/**
 * Apply a single migration result to the running stats
 *
 * @param {Object} params Parameters
 * @param {Object} params.stats Stats accumulator
 * @param {Object} params.result Migration result for one thread
 */
function apply_result_to_stats({ stats, result }) {
  switch (result.status) {
    case 'migrated':
      stats.migrated++
      break
    case 'would_migrate':
      stats.would_migrate++
      break
    case 'already_migrated':
      stats.already_migrated++
      break
    case 'skipped':
      stats.skipped++
      break
    case 'no_metadata':
      stats.no_metadata++
      break
    case 'error':
      stats.errors.push(result)
      break
  }
}

const cli_config = (argv_parser) =>
  add_directory_cli_options(argv_parser)
    .scriptName('migrate-thread-metadata')
    .usage(
      'Migrate thread metadata from old schema to new schema.\n\nUsage: $0 [options]'
    )
    .option('dry-run', {
      alias: 'd',
      describe: 'Preview migration without making changes',
      type: 'boolean',
      default: false
    })
    .option('thread-id', {
      alias: 't',
      describe: 'Migrate a single thread by ID',
      type: 'string'
    })
    .example('$0 --dry-run', 'Preview migration without changes')
    .example('$0', 'Migrate all threads')
    .example('$0 --thread-id abc123', 'Migrate a single thread')
    .help()
    .alias('help', 'h')
    .strict()

/**
 * Run the migration and print summary
 *
 * @param {Object} params Parameters
 * @param {boolean} params.dry_run If true, only preview changes
 * @param {string} [params.thread_id] Optional single thread ID
 * @returns {Promise<Object>} Migration statistics
 */
const run = async ({ dry_run = false, thread_id = null }) => {
  console.log(
    dry_run
      ? 'Running in DRY RUN mode - no changes will be made'
      : 'Starting metadata migration...'
  )

  const stats = await migrate_all_threads({ dry_run, thread_id })

  console.log('\n=== Migration Summary ===')
  console.log(`Total threads processed: ${stats.total}`)

  if (dry_run) {
    console.log(`Would migrate: ${stats.would_migrate}`)
  } else {
    console.log(`Migrated: ${stats.migrated}`)
  }

  console.log(`Already migrated: ${stats.already_migrated}`)
  console.log(`Skipped (nothing to migrate): ${stats.skipped}`)
  console.log(`No metadata file: ${stats.no_metadata}`)
  console.log(`Errors: ${stats.errors.length}`)

  if (stats.errors.length > 0) {
    console.log('\nErrors:')
    for (const error of stats.errors) {
      console.log(`  ${error.thread_id}: ${error.error}`)
    }
  }

  return stats
}

export default run

const main = async () => {
  const argv = cli_config(yargs(hideBin(process.argv))).argv

  handle_cli_directory_registration(argv)

  let error
  try {
    const stats = await run({
      dry_run: argv['dry-run'],
      thread_id: argv['thread-id']
    })

    if (stats.errors.length > 0) {
      process.exit(1)
    }
  } catch (err) {
    error = err
    console.error(`\nError: ${err.message}`)
  }

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  main()
}
