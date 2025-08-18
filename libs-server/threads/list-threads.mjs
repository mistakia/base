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
 * List threads with optional filtering
 *
 * @param {Object} params Parameters
 * @param {string} [params.user_public_key] Filter by user public key
 * @param {string} [params.thread_state] Filter by thread state
 * @param {number} [params.limit=50] Maximum number of threads to return
 * @param {number} [params.offset=0] Number of threads to skip
 * @param {string} [params.user_base_directory] Custom user base directory (overrides registry)
 * @param {string} [params.requesting_user_public_key] User requesting the list (for permission checking)
 * @returns {Promise<Array>} Array of thread summary objects
 */
export default async function list_threads({
  user_public_key,
  thread_state,
  limit = 50,
  offset = 0,
  user_base_directory,
  requesting_user_public_key = null
}) {
  log(
    `Listing threads${user_public_key ? ` for user ${user_public_key}` : ''}${thread_state ? ` with state ${thread_state}` : ''}`
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
        user_base_directory: argv.user_base_directory
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
