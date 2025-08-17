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

const log = debug('threads:get')

/**
 * Get thread data by ID
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to retrieve
 * @param {string} [params.user_public_key] User public key for permission checking
 * @param {string} [params.user_base_directory] Custom user base directory
 * @returns {Promise<Object>} Thread data object
 * @throws {Error} If thread is not found or access denied
 */
export default async function get_thread({
  thread_id,
  user_public_key = null,
  user_base_directory
}) {
  if (!thread_id || typeof thread_id !== 'string') {
    throw new Error('thread_id is required')
  }

  log(`Getting thread ${thread_id}`)

  try {
    const { metadata, timeline, thread_dir } = await read_thread_data({
      thread_id,
      user_base_directory
    })

    const thread_data = await process_thread_with_permissions({
      thread_id,
      metadata,
      timeline,
      thread_dir,
      user_public_key
    })

    return thread_data
  } catch (error) {
    log(`Error getting thread ${thread_id}: ${error.message}`)
    throw error
  }
}

// CLI support when run directly
if (is_main(import.meta.url)) {
  debug.enable('threads:get,threads:utils')
  
  const argv = add_directory_cli_options(
    yargs(hideBin(process.argv))
  )
    .default('user_base_directory', config.user_base_directory)
    .scriptName('get-thread')
    .usage('Get thread data by ID.\n\nUsage: $0 [options] <thread_id>')
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
        user_base_directory: argv.user_base_directory
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