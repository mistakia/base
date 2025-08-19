import path from 'path'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import get_thread from './get-thread.mjs'
import { thread_constants } from '#libs-shared'
import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'
import config from '#config'
import is_main from '#libs-server/utils/is-main.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'

const { THREAD_STATE, validate_thread_state, validate_archive_reason } =
  thread_constants
const log = debug('threads:update')

/**
 * Update thread state
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to update
 * @param {string} params.thread_state New thread state
 * @param {string} [params.reason] Reason for state change (for archived state, must be valid archive reason)
 * @returns {Promise<Object>} Updated thread data
 */
export async function update_thread_state({ thread_id, thread_state, reason }) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  if (!thread_state) {
    throw new Error('thread_state is required')
  }

  // Validate thread_state using shared function
  validate_thread_state(thread_state)

  log(`Updating thread ${thread_id} state to ${thread_state}`)

  // Get current thread data
  const thread = await get_thread({
    thread_id
  })

  // No change if thread_state is already set
  if (thread.thread_state === thread_state) {
    return thread
  }

  // Update metadata
  const metadata_path = path.join(thread.context_dir, 'metadata.json')
  const metadata = { ...thread }

  delete metadata.timeline
  delete metadata.context_dir

  // Set new thread_state
  metadata.thread_state = thread_state
  metadata.updated_at = new Date().toISOString()

  // Add thread_state-specific fields
  if (thread_state === THREAD_STATE.ARCHIVED) {
    metadata.archived_at = new Date().toISOString()
    if (reason) {
      validate_archive_reason(reason)
      metadata.archive_reason = reason
    }
  }

  // Remove thread_state-specific fields if no longer applicable
  if (thread_state !== THREAD_STATE.ARCHIVED) {
    delete metadata.archived_at
    delete metadata.archive_reason
  }

  // Write updated metadata
  await write_file_to_filesystem({
    absolute_path: metadata_path,
    file_content: JSON.stringify(metadata, null, 2)
  })

  // Add thread_state change entry to timeline
  const timeline_entry = {
    id: `thread_state_${Date.now()}`,
    timestamp: metadata.updated_at,
    type: 'thread_state_change',
    previous_thread_state: thread.thread_state,
    new_thread_state: thread_state
  }

  if (reason) {
    timeline_entry.reason = reason
  }

  const timeline = [...thread.timeline, timeline_entry]

  // Write updated timeline
  await write_file_to_filesystem({
    absolute_path: path.join(thread.context_dir, 'timeline.json'),
    file_content: JSON.stringify(timeline, null, 2)
  })

  // Return updated thread data
  return {
    ...metadata,
    timeline,
    context_dir: thread.context_dir
  }
}

/**
 * Update thread metadata
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to update
 * @param {Object} params.metadata Metadata fields to update (includes validation for title and short_description)
 * @param {string} [params.user_base_directory] Custom user base directory (overrides registry)
 * @returns {Promise<Object>} Updated thread data
 */
export async function update_thread_metadata({
  thread_id,
  metadata = {},
  user_base_directory
}) {
  if (!thread_id) {
    throw new Error('thread_id is required')
  }

  if (!metadata || Object.keys(metadata).length === 0) {
    throw new Error('metadata must contain at least one field to update')
  }

  log(`Updating thread ${thread_id} metadata`)

  // Get current thread data
  const thread = await get_thread({
    thread_id
  })

  // Update metadata
  const metadata_path = path.join(thread.context_dir, 'metadata.json')
  const current_metadata = { ...thread }

  delete current_metadata.timeline
  delete current_metadata.context_dir

  // Prevent updating protected fields
  const protected_fields = ['thread_id', 'user_public_key', 'created_at']

  for (const field of protected_fields) {
    if (metadata[field] !== undefined) {
      delete metadata[field]
    }
  }

  // Validate title format and length constraints
  if (metadata.title !== undefined) {
    if (metadata.title !== null) {
      if (typeof metadata.title !== 'string') {
        throw new Error('title must be a string')
      }
      if (metadata.title.length === 0) {
        throw new Error('title cannot be empty')
      }
    }
  }

  // Validate description format and length constraints
  if (metadata.short_description !== undefined) {
    if (metadata.short_description !== null) {
      if (typeof metadata.short_description !== 'string') {
        throw new Error('short_description must be a string')
      }
      if (metadata.short_description.length === 0) {
        throw new Error('short_description cannot be empty')
      }
    }
  }

  // Special handling for thread_state changes
  if (
    metadata.thread_state !== undefined &&
    metadata.thread_state !== thread.thread_state
  ) {
    // Use the dedicated function for thread_state changes
    return update_thread_state({
      thread_id,
      thread_state: metadata.thread_state,
      reason: metadata.reason,
      user_base_directory
    })
  }

  // Update metadata
  const updated_metadata = {
    ...current_metadata,
    ...metadata,
    updated_at: new Date().toISOString()
  }

  // Write updated metadata
  await write_file_to_filesystem({
    absolute_path: metadata_path,
    file_content: JSON.stringify(updated_metadata, null, 2)
  })

  // Return updated thread data
  return {
    ...updated_metadata,
    timeline: thread.timeline,
    context_dir: thread.context_dir
  }
}

// Export default function as update_thread_state for convenience
export default update_thread_state

// CLI support when run directly
if (is_main(import.meta.url)) {
  debug.enable('threads:update,threads:utils')

  const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
    .default('user_base_directory', config.user_base_directory)
    .scriptName('update-thread')
    .usage('Update thread state or metadata.\n\nUsage: $0 [options]')
    .option('thread_id', {
      alias: 't',
      describe: 'Thread ID to update',
      type: 'string',
      required: true
    })
    .option('thread_state', {
      alias: 's',
      describe: 'New thread state',
      type: 'string',
      choices: Object.values(THREAD_STATE)
    })
    .option('reason', {
      alias: 'r',
      describe: 'Reason for state change (required for archived state)',
      type: 'string'
    })
    .option('metadata', {
      alias: 'm',
      describe: 'JSON string of metadata fields to update',
      type: 'string'
    })
    .option('title', {
      describe: 'Update thread title',
      type: 'string'
    })
    .option('short_description', {
      describe: 'Update thread short description',
      type: 'string'
    })
    .check((argv) => {
      if (
        !argv.thread_state &&
        !argv.metadata &&
        !argv.title &&
        !argv.short_description
      ) {
        throw new Error(
          'Must specify either --thread_state, --metadata, --title, or --short_description'
        )
      }
      if (argv.thread_state === THREAD_STATE.ARCHIVED && !argv.reason) {
        throw new Error('Reason is required when archiving a thread')
      }
      if (argv.metadata) {
        try {
          JSON.parse(argv.metadata)
        } catch (error) {
          throw new Error('Invalid JSON format for --metadata option')
        }
      }
      return true
    })
    .strict()
    .help()
    .alias('help', 'h').argv

  const main = async () => {
    handle_cli_directory_registration(argv)

    let error
    try {
      let updated_thread

      if (argv.thread_state) {
        // Update thread state
        updated_thread = await update_thread_state({
          thread_id: argv.thread_id,
          thread_state: argv.thread_state,
          reason: argv.reason
        })
        console.log(`Thread state updated to: ${argv.thread_state}`)
      } else {
        // Update metadata
        let metadata = {}

        if (argv.metadata) {
          metadata = { ...metadata, ...JSON.parse(argv.metadata) }
        }

        if (argv.title) {
          metadata.title = argv.title
        }

        if (argv.short_description) {
          metadata.short_description = argv.short_description
        }

        updated_thread = await update_thread_metadata({
          thread_id: argv.thread_id,
          metadata,
          user_base_directory: argv.user_base_directory
        })
        console.log('Thread metadata updated')
      }

      console.log('Updated thread:')
      console.log(JSON.stringify(updated_thread, null, 2))
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
