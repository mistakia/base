#!/usr/bin/env node

/**
 * Archive Thread CLI Tool
 *
 * A simplified interface for archiving or reactivating threads.
 * Provides a focused, user-friendly way to change thread state without
 * the complexity of the full update-thread.mjs tool.
 *
 * Examples:
 *
 *   # Archive a thread as completed
 *   node cli/archive-thread.mjs --thread-id abc123 --completed
 *
 *   # Archive a thread as user abandoned
 *   node cli/archive-thread.mjs --thread-id abc123 --user-abandoned
 *
 *   # Reactivate an archived thread
 *   node cli/archive-thread.mjs --thread-id abc123 --reactivate
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { update_thread_state } from '#libs-server/threads/update-thread.mjs'
import { isMain } from '#libs-server'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { thread_constants } from '#libs-shared'

const { THREAD_STATE, ARCHIVE_REASON } = thread_constants

// Configure debugging
const log = debug('cli:archive-thread')

const cli_config = (argv_parser) =>
  add_directory_cli_options(argv_parser)
    .scriptName('archive-thread')
    .usage('Archive or reactivate a thread.\n\nUsage: $0 [options]')
    .option('thread-id', {
      alias: 't',
      describe: 'Thread ID to archive or reactivate',
      type: 'string',
      demandOption: true
    })
    .option('completed', {
      describe: 'Archive thread as completed',
      type: 'boolean',
      default: false
    })
    .option('user-abandoned', {
      describe: 'Archive thread as user abandoned',
      type: 'boolean',
      default: false
    })
    .option('reactivate', {
      describe: 'Reactivate an archived thread',
      type: 'boolean',
      default: false
    })
    .check((argv) => {
      const archive_options = [
        argv.completed,
        argv['user-abandoned'],
        argv.reactivate
      ].filter(Boolean)

      if (archive_options.length === 0) {
        throw new Error(
          'Must specify exactly one of: --completed, --user-abandoned, or --reactivate'
        )
      }

      if (archive_options.length > 1) {
        throw new Error(
          'Cannot specify multiple archive options. Choose only one of: --completed, --user-abandoned, or --reactivate'
        )
      }

      return true
    })
    .example('$0 --thread-id abc123 --completed', 'Archive thread as completed')
    .example(
      '$0 --thread-id abc123 --user-abandoned',
      'Archive thread as user abandoned'
    )
    .example(
      '$0 --thread-id abc123 --reactivate',
      'Reactivate an archived thread'
    )
    .help()
    .alias('help', 'h')
    .strict()

const run = async ({ thread_id, completed, user_abandoned, reactivate }) => {
  try {
    let thread_state, reason

    if (reactivate) {
      thread_state = THREAD_STATE.ACTIVE
      // No reason needed for reactivation - timeline entry shows state change
      log(`Reactivating thread ${thread_id}`)
    } else {
      thread_state = THREAD_STATE.ARCHIVED
      if (completed) {
        reason = ARCHIVE_REASON.COMPLETED
        log(`Archiving thread ${thread_id} as completed`)
      } else if (user_abandoned) {
        reason = ARCHIVE_REASON.USER_ABANDONED
        log(`Archiving thread ${thread_id} as user abandoned`)
      }
    }

    const updated_thread = await update_thread_state({
      thread_id,
      thread_state,
      reason: reason || undefined // Only include reason when archiving
    })

    // Success messages
    if (reactivate) {
      console.log(`✓ Thread ${thread_id} has been reactivated`)
    } else if (completed) {
      console.log(`✓ Thread ${thread_id} has been archived as completed`)
    } else if (user_abandoned) {
      console.log(`✓ Thread ${thread_id} has been archived as user abandoned`)
    }

    // Show thread details
    console.log('\nThread details:')
    console.log(`  ID: ${updated_thread.thread_id}`)
    console.log(`  State: ${updated_thread.thread_state}`)
    if (updated_thread.title) {
      console.log(`  Title: ${updated_thread.title}`)
    }
    if (updated_thread.archived_at) {
      console.log(`  Archived at: ${updated_thread.archived_at}`)
    }
    if (updated_thread.archive_reason) {
      console.log(`  Archive reason: ${updated_thread.archive_reason}`)
    }

    return updated_thread
  } catch (error) {
    log('Error:', error)

    // User-friendly error messages
    if (error.message.includes('Thread not found')) {
      throw new Error(`Thread with ID '${thread_id}' was not found`)
    } else if (error.message.includes('already')) {
      throw new Error('Thread is already in the requested state')
    } else {
      throw error
    }
  }
}

export default run

const main = async () => {
  const argv = cli_config(yargs(hideBin(process.argv))).argv

  // Handle directory registration
  handle_cli_directory_registration(argv)

  let error
  try {
    await run({
      thread_id: argv['thread-id'],
      completed: argv.completed,
      user_abandoned: argv['user-abandoned'],
      reactivate: argv.reactivate
    })
  } catch (err) {
    error = err
    console.error(`\n✗ Error: ${err.message}`)

    if (argv.verbose) {
      console.error('\nFull error details:')
      console.error(err)
    }
  }

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  main()
}
