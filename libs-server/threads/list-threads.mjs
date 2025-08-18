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
import {
  read_json_file,
  get_effective_updated_at,
  check_thread_permission
} from './thread-utils.mjs'

const log = debug('threads:list')

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
 * List threads with optional filtering
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_public_key] Filter by user public key
 * @param {string} [params.thread_state] Filter by thread state
 * @param {number} [params.limit=50] Maximum number of threads to return
 * @param {number} [params.offset=0] Number of threads to skip
 * @param {string} [params.user_base_directory] Custom user base directory (overrides registry)
 * @param {string} [params.requesting_user_public_key] User requesting the list (for permission checking)
 * @param {string|Date} [params.created_since] Filter threads created since this date (inclusive)
 * @param {string|Date} [params.created_after] Filter threads created after this date (exclusive)
 * @param {string|Date} [params.updated_since] Filter threads updated since this date (inclusive)
 * @param {string|Date} [params.updated_after] Filter threads updated after this date (exclusive)
 * @returns {Promise<Array>} Array of thread summary objects
 */
export default async function list_threads({
  user_public_key,
  thread_state,
  limit = 50,
  offset = 0,
  user_base_directory,
  requesting_user_public_key = null,
  created_since = null,
  created_after = null,
  updated_since = null,
  updated_after = null
}) {
  // Parse date filters
  const created_since_ts = parse_date_to_timestamp(created_since)
  const created_after_ts = parse_date_to_timestamp(created_after)
  const updated_since_ts = parse_date_to_timestamp(updated_since)
  const updated_after_ts = parse_date_to_timestamp(updated_after)

  log(
    `Listing threads${user_public_key ? ` for user ${user_public_key}` : ''}${thread_state ? ` with state ${thread_state}` : ''}${created_since ? ` created since ${created_since}` : ''}${created_after ? ` created after ${created_after}` : ''}${updated_since ? ` updated since ${updated_since}` : ''}${updated_after ? ` updated after ${updated_after}` : ''}`
  )

  const threads_dir = get_thread_base_directory({ user_base_directory })

  try {
    await fs.mkdir(threads_dir, { recursive: true })

    const all_items = await fs.readdir(threads_dir)

    // Filter to only include items that look like UUID directories
    const thread_dirs = []
    for (const item of all_items) {
      const item_path = path.join(threads_dir, item)
      try {
        const stat = await fs.stat(item_path)
        // Only include directories that match UUID pattern
        if (
          stat.isDirectory() &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            item
          )
        ) {
          thread_dirs.push(item)
        }
      } catch (error) {
        log(`Error checking item ${item}: ${error.message}`)
      }
    }

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
          const created_at_ts = metadata.created_at ? new Date(metadata.created_at).getTime() : null
          const updated_at_ts = get_effective_updated_at({ metadata })

          // Apply created_at filters
          if (created_since_ts && (!created_at_ts || created_at_ts < created_since_ts))
            return null
          if (created_after_ts && (!created_at_ts || created_at_ts <= created_after_ts))
            return null

          // Apply updated_at filters
          if (updated_since_ts && updated_at_ts < updated_since_ts)
            return null
          if (updated_after_ts && updated_at_ts <= updated_after_ts)
            return null

          // Check permissions for this thread if requesting user is provided
          const permission_result = await check_thread_permission({
            thread_id,
            user_public_key: requesting_user_public_key
          })

          if (!permission_result.allowed) {
            return null
          }

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
    .option('requesting_user_public_key', {
      alias: 'r',
      describe:
        'User requesting the list for permission checking (defaults to config.user_public_key)',
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
      describe: 'Filter threads created since this date (inclusive, ISO format)',
      type: 'string'
    })
    .option('created_after', {
      describe: 'Filter threads created after this date (exclusive, ISO format)',
      type: 'string'
    })
    .option('updated_since', {
      describe: 'Filter threads updated since this date (inclusive, ISO format)',
      type: 'string'
    })
    .option('updated_after', {
      describe: 'Filter threads updated after this date (exclusive, ISO format)',
      type: 'string'
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
        requesting_user_public_key: argv.requesting_user_public_key,
        thread_state: argv.thread_state,
        limit: argv.limit,
        offset: argv.offset,
        user_base_directory: argv.user_base_directory,
        created_since: argv.created_since,
        created_after: argv.created_after,
        updated_since: argv.updated_since,
        updated_after: argv.updated_after
      })

      console.log(`Found ${threads.length} matching threads`)
      console.log(JSON.stringify(threads, null, 2))
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
