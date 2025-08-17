import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import config from '#config'
import is_main from '#libs-server/utils/is-main.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import {
  read_thread_data,
  process_thread_with_permissions
} from './thread-utils.mjs'
import {
  validate_filter_parameters,
  apply_timeline_filters,
  apply_timeline_slicing
} from './timeline-filter-utils.mjs'

const log = debug('threads:get')

/**
 * Get thread data by ID with optional timeline filtering
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to retrieve
 * @param {string} [params.user_public_key] User public key for permission checking
 * @param {string} [params.user_base_directory] Custom user base directory
 * @param {Array<string>} [params.include_types=[]] Timeline entry types to include (empty means all)
 * @param {Array<string>} [params.exclude_types=[]] Timeline entry types to exclude
 * @param {Array<string>} [params.include_roles=[]] Message roles to include (empty means all)
 * @param {Array<string>} [params.exclude_roles=[]] Message roles to exclude
 * @param {Array<string>} [params.include_tool_names=[]] Tool names to include (empty means all)
 * @param {Array<string>} [params.exclude_tool_names=[]] Tool names to exclude
 * @param {boolean} [params.include_sidechain=true] Whether to include sidechain entries
 * @param {number} [params.limit] Limit number of timeline entries (pagination)
 * @param {number} [params.offset] Offset for timeline entries (requires limit)
 * @param {number} [params.take_first] Take first N entries (position-based)
 * @param {number} [params.take_last] Take last N entries (position-based)
 * @param {number} [params.skip_first] Skip first N entries (position-based)
 * @param {number} [params.skip_last] Skip last N entries (position-based)
 * @param {number} [params.start_index] Start index for slicing (index-based)
 * @param {number} [params.end_index] End index for slicing (index-based)
 * @returns {Promise<Object>} Thread data object with filtered timeline
 * @throws {Error} If thread is not found, access denied, or invalid filter parameters
 */
export default async function get_thread({
  thread_id,
  user_public_key = null,
  user_base_directory,
  include_types = [],
  exclude_types = [],
  include_roles = [],
  exclude_roles = [],
  include_tool_names = [],
  exclude_tool_names = [],
  include_sidechain = true,
  limit,
  offset,
  take_first,
  take_last,
  skip_first,
  skip_last,
  start_index,
  end_index
}) {
  if (!thread_id || typeof thread_id !== 'string') {
    throw new Error('thread_id is required')
  }

  // Validate filter parameters
  const filter_validation = validate_filter_parameters({
    limit,
    offset,
    take_first,
    take_last,
    skip_first,
    skip_last,
    start_index,
    end_index
  })

  if (!filter_validation.success) {
    throw new Error(`Invalid filter parameters: ${filter_validation.error}`)
  }

  log(`Getting thread ${thread_id} with filtering`)

  try {
    const { metadata, timeline, thread_dir } = await read_thread_data({
      thread_id,
      user_base_directory
    })

    // Apply timeline filtering before permission processing
    const filter_criteria = {
      include_types,
      exclude_types,
      include_roles,
      exclude_roles,
      include_tool_names,
      exclude_tool_names,
      include_sidechain
    }

    const slice_criteria = {
      limit,
      offset,
      take_first,
      take_last,
      skip_first,
      skip_last,
      start_index,
      end_index
    }

    let filtered_timeline = apply_timeline_filters(timeline, filter_criteria)
    filtered_timeline = apply_timeline_slicing(filtered_timeline, slice_criteria)

    const thread_data = await process_thread_with_permissions({
      thread_id,
      metadata,
      timeline: filtered_timeline,
      thread_dir,
      user_public_key
    })

    return thread_data
  } catch (error) {
    log(`Error getting thread ${thread_id}: ${error.message}`)
    throw error
  }
}

// Helper function to parse comma-separated arrays
function parse_array_option(value) {
  if (!value) return []
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0)
}

// CLI support when run directly
if (is_main(import.meta.url)) {
  debug.enable('threads:get,threads:utils,threads:timeline-filter-utils')

  const argv = add_directory_cli_options(
    yargs(hideBin(process.argv))
  )
    .default('user_base_directory', config.user_base_directory)
    .scriptName('get-thread')
    .usage('Get thread data by ID with optional timeline filtering.\n\nUsage: $0 [options] <thread_id>')
    .positional('thread_id', {
      describe: 'Thread ID to retrieve',
      type: 'string'
    })
    .option('user_public_key', {
      alias: 'u',
      describe: 'User public key for permission checking (defaults to config.user_public_key)',
      type: 'string',
      default: config.user_public_key
    })
    .option('include_types', {
      describe: 'Timeline entry types to include (comma-separated, empty means all)',
      type: 'string',
      coerce: parse_array_option
    })
    .option('exclude_types', {
      describe: 'Timeline entry types to exclude (comma-separated)',
      type: 'string',
      coerce: parse_array_option
    })
    .option('include_roles', {
      describe: 'Message roles to include (comma-separated, empty means all)',
      type: 'string',
      coerce: parse_array_option
    })
    .option('exclude_roles', {
      describe: 'Message roles to exclude (comma-separated)',
      type: 'string',
      coerce: parse_array_option
    })
    .option('include_tool_names', {
      describe: 'Tool names to include (comma-separated, empty means all)',
      type: 'string',
      coerce: parse_array_option
    })
    .option('exclude_tool_names', {
      describe: 'Tool names to exclude (comma-separated)',
      type: 'string',
      coerce: parse_array_option
    })
    .option('include_sidechain', {
      describe: 'Whether to include sidechain entries',
      type: 'boolean',
      default: true
    })
    .option('limit', {
      describe: 'Limit number of timeline entries (pagination)',
      type: 'number'
    })
    .option('offset', {
      describe: 'Offset for timeline entries (requires limit)',
      type: 'number'
    })
    .option('take_first', {
      describe: 'Take first N entries (position-based)',
      type: 'number'
    })
    .option('take_last', {
      describe: 'Take last N entries (position-based)',
      type: 'number'
    })
    .option('skip_first', {
      describe: 'Skip first N entries (position-based)',
      type: 'number'
    })
    .option('skip_last', {
      describe: 'Skip last N entries (position-based)',
      type: 'number'
    })
    .option('start_index', {
      describe: 'Start index for slicing (index-based)',
      type: 'number'
    })
    .option('end_index', {
      describe: 'End index for slicing (index-based)',
      type: 'number'
    })
    .demandCommand(1, 'You must provide a thread_id')
    .strict()
    .help()
    .alias('help', 'h').argv

  const main = async () => {
    handle_cli_directory_registration(argv)

    let error
    try {
      const thread_id = argv._[0]
      const thread_data = await get_thread({
        thread_id,
        user_public_key: argv.user_public_key,
        user_base_directory: argv.user_base_directory,
        include_types: argv.include_types || [],
        exclude_types: argv.exclude_types || [],
        include_roles: argv.include_roles || [],
        exclude_roles: argv.exclude_roles || [],
        include_tool_names: argv.include_tool_names || [],
        exclude_tool_names: argv.exclude_tool_names || [],
        include_sidechain: argv.include_sidechain,
        limit: argv.limit,
        offset: argv.offset,
        take_first: argv.take_first,
        take_last: argv.take_last,
        skip_first: argv.skip_first,
        skip_last: argv.skip_last,
        start_index: argv.start_index,
        end_index: argv.end_index
      })

      console.log(JSON.stringify(thread_data, null, 2))
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
