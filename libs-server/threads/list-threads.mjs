import fs from 'fs/promises'
import path from 'path'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import config from '#config'
import is_main from '#libs-server/utils/is-main.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { get_thread_base_directory } from './threads-constants.mjs'
import { read_json_file, get_effective_updated_at } from './thread-utils.mjs'

const log = debug('threads:list')

/**
 * List thread IDs only (lightweight, no metadata loading).
 * Used for batched processing to avoid loading all metadata at once.
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<string[]>} Array of thread UUIDs
 */
export async function list_thread_ids({ user_base_directory } = {}) {
  const threads_dir = get_thread_base_directory({ user_base_directory })

  try {
    await fs.mkdir(threads_dir, { recursive: true })

    const all_items = await fs.readdir(threads_dir, { withFileTypes: true })

    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    return all_items
      .filter((item) => item.isDirectory() && UUID_PATTERN.test(item.name))
      .map((item) => item.name)
  } catch (error) {
    log(`Error listing thread IDs: ${error.message}`)
    throw error
  }
}

/**
 * Read metadata for a single thread
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread UUID
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object|null>} Thread metadata or null if not found
 */
export async function get_thread_metadata({ thread_id, user_base_directory }) {
  const threads_dir = get_thread_base_directory({ user_base_directory })

  try {
    const metadata_path = path.join(threads_dir, thread_id, 'metadata.json')
    const metadata = await read_json_file({ file_path: metadata_path })

    const thread_summary = { ...metadata, thread_id }

    if (metadata.models && metadata.models.length > 0 && !metadata.model) {
      thread_summary.model = metadata.models[0]
    }

    return thread_summary
  } catch (error) {
    log(`Error reading thread ${thread_id}: ${error.message}`)
    return null
  }
}

/**
 * Process threads in batches to reduce memory pressure.
 * Loads metadata only for current batch rather than all threads at once.
 *
 * @param {Object} params Parameters
 * @param {string[]} params.thread_ids Array of thread IDs to process
 * @param {Function} params.sync_fn Async function that takes {thread_id, metadata} and returns {success: boolean}
 * @param {Object} [params.options] Options
 * @param {number} [params.options.batch_size=100] Number of threads per batch
 * @param {Function} [params.options.log_fn] Logging function (receives format string and args)
 * @param {string} [params.options.progress_label='Thread processing'] Label for progress logs
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<{synced: number, failed: number}>} Counts of synced and failed threads
 */
export async function process_threads_in_batches({
  thread_ids,
  sync_fn,
  options = {},
  user_base_directory
}) {
  const {
    batch_size = 100,
    log_fn = log,
    progress_label = 'Thread processing'
  } = options

  const total = thread_ids.length
  let synced = 0
  let failed = 0
  let processed = 0

  for (let i = 0; i < thread_ids.length; i += batch_size) {
    const batch_ids = thread_ids.slice(i, i + batch_size)

    for (const thread_id of batch_ids) {
      const metadata = await get_thread_metadata({
        thread_id,
        user_base_directory
      })
      if (!metadata) {
        failed++
        processed++
        continue
      }

      try {
        const result = await sync_fn({ thread_id, metadata })
        if (result.success) {
          synced++
        } else {
          failed++
        }
      } catch (error) {
        log_fn('Error processing thread %s: %s', thread_id, error.message)
        failed++
      }
      processed++
    }

    // Log progress every 5 batches (guard against division by zero)
    if (processed % (batch_size * 5) === 0 || processed === total) {
      const percentage = total > 0 ? Math.round((processed / total) * 100) : 0
      log_fn(
        '%s progress: %d/%d (%d%%)',
        progress_label,
        processed,
        total,
        percentage
      )
    }
  }

  return { synced, failed }
}

/**
 * Parse date parameter to timestamp
 * @param {string|Date|null} date_param Date parameter
 * @returns {number|null} Timestamp or null
 */
function parse_date_to_timestamp(date_param) {
  if (!date_param) return null

  const date = date_param instanceof Date ? date_param : new Date(date_param)

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${date_param}`)
  }

  return date.getTime()
}

/**
 * Check if a field is missing (undefined, null, or empty string)
 * @param {any} value Field value to check
 * @returns {boolean} True if field is missing
 */
function is_field_missing(value) {
  return value === undefined || value === null || value === ''
}

/**
 * List threads with optional filtering
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_public_key] Filter by user public key
 * @param {string} [params.thread_state] Filter by thread state
 * @param {number} [params.limit=50] Maximum number of threads to return
 * @param {number} [params.offset=0] Number of threads to skip
 * @param {string} [params.user_base_directory] Custom user base directory (overrides registry)
 * @param {string|Date} [params.created_since] Filter threads created since this date (inclusive)
 * @param {string|Date} [params.created_after] Filter threads created after this date (exclusive)
 * @param {string|Date} [params.updated_since] Filter threads updated since this date (inclusive)
 * @param {string|Date} [params.updated_after] Filter threads updated after this date (exclusive)
 * @param {boolean} [params.missing_title] Filter threads missing title field
 * @param {boolean} [params.missing_short_description] Filter threads missing short_description field
 * @returns {Promise<Array>} Array of thread summary objects
 */
export default async function list_threads({
  user_public_key,
  thread_state,
  limit = 50,
  offset = 0,
  user_base_directory,
  created_since = null,
  created_after = null,
  updated_since = null,
  updated_after = null,
  missing_title = false,
  missing_short_description = false
}) {
  // Parse date filters
  const created_since_ts = parse_date_to_timestamp(created_since)
  const created_after_ts = parse_date_to_timestamp(created_after)
  const updated_since_ts = parse_date_to_timestamp(updated_since)
  const updated_after_ts = parse_date_to_timestamp(updated_after)

  log(
    `Listing threads${user_public_key ? ` for user ${user_public_key}` : ''}${thread_state ? ` with state ${thread_state}` : ''}${created_since ? ` created since ${created_since}` : ''}${created_after ? ` created after ${created_after}` : ''}${updated_since ? ` updated since ${updated_since}` : ''}${updated_after ? ` updated after ${updated_after}` : ''}${missing_title ? ' missing title' : ''}${missing_short_description ? ' missing short_description' : ''}`
  )

  const threads_dir = get_thread_base_directory({ user_base_directory })

  try {
    await fs.mkdir(threads_dir, { recursive: true })

    // Use withFileTypes to get directory info without separate stat calls
    const all_items = await fs.readdir(threads_dir, { withFileTypes: true })

    // Filter to only include items that look like UUID directories
    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const thread_dirs = all_items
      .filter((item) => item.isDirectory() && UUID_PATTERN.test(item.name))
      .map((item) => item.name)

    const results = await Promise.allSettled(
      thread_dirs.map(async (thread_id) => {
        try {
          const metadata_path = path.join(
            threads_dir,
            thread_id,
            'metadata.json'
          )
          const metadata = await read_json_file({ file_path: metadata_path })

          if (user_public_key && metadata.user_public_key !== user_public_key)
            return null
          if (thread_state && metadata.thread_state !== thread_state)
            return null

          // Date filtering
          const created_at_ts = metadata.created_at
            ? new Date(metadata.created_at).getTime()
            : null
          const updated_at_ts = get_effective_updated_at({ metadata })

          // Apply created_at filters
          if (
            created_since_ts &&
            (!created_at_ts || created_at_ts < created_since_ts)
          )
            return null
          if (
            created_after_ts &&
            (!created_at_ts || created_at_ts <= created_after_ts)
          )
            return null

          // Apply updated_at filters
          if (updated_since_ts && updated_at_ts < updated_since_ts) return null
          if (updated_after_ts && updated_at_ts <= updated_after_ts) return null

          // Apply missing field filters
          if (missing_title && !is_field_missing(metadata.title)) return null
          if (
            missing_short_description &&
            !is_field_missing(metadata.short_description)
          )
            return null

          const thread_summary = { ...metadata }

          if (
            metadata.models &&
            metadata.models.length > 0 &&
            !metadata.model
          ) {
            thread_summary.model = metadata.models[0]
          }

          return thread_summary
        } catch (error) {
          log(`Error reading thread ${thread_id}: ${error.message}`)
          return null
        }
      })
    )

    const threads = results
      .filter((r) => r.status === 'fulfilled' && r.value)
      .map((r) => r.value)

    threads.sort(
      (a, b) =>
        get_effective_updated_at({ metadata: b }) -
        get_effective_updated_at({ metadata: a })
    )

    return threads.slice(offset, offset + limit)
  } catch (error) {
    log(`Error listing threads: ${error.message}`)
    throw error
  }
}

// CLI support when run directly
if (is_main(import.meta.url)) {
  debug.enable('threads:list,threads:utils')

  const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
    .default('user_base_directory', config.user_base_directory)
    .scriptName('list-threads')
    .usage('List threads with optional filtering.\n\nUsage: $0 [options]')
    .option('user_public_key', {
      alias: 'u',
      describe:
        'Filter by user public key (defaults to config.user_public_key)',
      type: 'string',
      default: config.user_public_key
    })

    .option('thread_state', {
      alias: 's',
      describe: 'Filter by thread state',
      type: 'string'
    })
    .option('limit', {
      alias: 'l',
      describe: 'Maximum number of threads to return',
      type: 'number',
      default: 50
    })
    .option('offset', {
      alias: 'o',
      describe: 'Number of threads to skip',
      type: 'number',
      default: 0
    })
    .option('created_since', {
      describe:
        'Filter threads created since this date (inclusive, ISO format)',
      type: 'string'
    })
    .option('created_after', {
      describe:
        'Filter threads created after this date (exclusive, ISO format)',
      type: 'string'
    })
    .option('updated_since', {
      describe:
        'Filter threads updated since this date (inclusive, ISO format)',
      type: 'string'
    })
    .option('updated_after', {
      describe:
        'Filter threads updated after this date (exclusive, ISO format)',
      type: 'string'
    })
    .option('missing_title', {
      describe: 'Filter threads that are missing title field',
      type: 'boolean',
      default: false
    })
    .option('missing_short_description', {
      describe: 'Filter threads that are missing short_description field',
      type: 'boolean',
      default: false
    })
    .option('output_format', {
      describe: 'Output format (text or json)',
      type: 'string',
      choices: ['text', 'json'],
      default: 'text'
    })
    .strict()
    .help()
    .alias('help', 'h').argv

  const main = async () => {
    handle_cli_directory_registration(argv)

    let error
    try {
      const threads = await list_threads({
        user_public_key: argv.user_public_key,
        thread_state: argv.thread_state,
        limit: argv.limit,
        offset: argv.offset,
        user_base_directory: argv.user_base_directory,
        created_since: argv.created_since,
        created_after: argv.created_after,
        updated_since: argv.updated_since,
        updated_after: argv.updated_after,
        missing_title: argv.missing_title,
        missing_short_description: argv.missing_short_description
      })

      if (argv.output_format === 'json') {
        // Pure JSON output for machine parsing
        console.log(JSON.stringify(threads, null, 2))
      } else {
        // Text output with summary
        console.log(`Found ${threads.length} matching threads`)
        console.log(JSON.stringify(threads, null, 2))
      }
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
