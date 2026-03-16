import path from 'path'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import get_thread from './get-thread.mjs'
import { thread_constants } from '#libs-shared'
import { read_modify_write } from '#libs-server/filesystem/optimistic-write.mjs'
import { queue_relation_analysis } from '#libs-server/metadata/analyze-thread-relations.mjs'
import config from '#config'
import is_main from '#libs-server/utils/is-main.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import {
  append_timeline_entry_jsonl,
  read_timeline_jsonl_or_default
} from '#libs-server/threads/timeline/index.mjs'

const {
  THREAD_STATE,
  ARCHIVE_REASON,
  validate_thread_state,
  validate_archive_reason
} = thread_constants
const log = debug('threads:update')

/**
 * Update thread state
 *
 * @param {Object} params Parameters
 * @param {string} params.thread_id Thread ID to update
 * @param {string} params.thread_state New thread state
 * @param {string} [params.reason] Reason for state change. Required when archiving (must be valid archive reason), optional otherwise
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

  // Validate archive requirements before attempting write
  if (thread_state === THREAD_STATE.ARCHIVED) {
    if (!reason) {
      const valid_reasons = Object.values(ARCHIVE_REASON).join(', ')
      throw new Error(
        `archive_reason is required when archiving a thread. Must be one of: ${valid_reasons}`
      )
    }
    validate_archive_reason(reason)
  }

  // Atomic read-modify-write with optimistic concurrency
  const metadata_path = path.join(thread.context_dir, 'metadata.json')
  const written = await read_modify_write({
    absolute_path: metadata_path,
    modify: (content) => {
      const metadata = JSON.parse(content)

      metadata.thread_state = thread_state
      metadata.updated_at = new Date().toISOString()

      if (thread_state === THREAD_STATE.ARCHIVED) {
        metadata.archived_at = new Date().toISOString()
        metadata.archive_reason = reason
      }

      if (thread_state !== THREAD_STATE.ARCHIVED) {
        delete metadata.archived_at
        delete metadata.archive_reason
      }

      return JSON.stringify(metadata, null, 2)
    }
  })
  const metadata = JSON.parse(written)

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

  // Append timeline entry (streaming write - avoids read-modify-write)
  const timeline_path = path.join(thread.context_dir, 'timeline.jsonl')
  await append_timeline_entry_jsonl({ timeline_path, entry: timeline_entry })

  // Read timeline back from disk to ensure consistency with actual file state
  const timeline = await read_timeline_jsonl_or_default({
    timeline_path,
    default_value: []
  })

  // Queue relation analysis when archiving (if not already analyzed)
  if (
    thread_state === THREAD_STATE.ARCHIVED &&
    !metadata.relations_analyzed_at
  ) {
    try {
      await queue_relation_analysis(thread_id)
      log(`Queued thread ${thread_id} for relation analysis`)
    } catch (error) {
      // Don't fail the archive operation if queuing fails
      log(
        `Failed to queue relation analysis for ${thread_id}: ${error.message}`
      )
    }
  }

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

  const metadata_path = path.join(thread.context_dir, 'metadata.json')

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

  // Atomic read-modify-write with optimistic concurrency
  const written = await read_modify_write({
    absolute_path: metadata_path,
    modify: (content) => {
      const current = JSON.parse(content)
      const updated = {
        ...current,
        ...metadata,
        updated_at: new Date().toISOString()
      }
      return JSON.stringify(updated, null, 2)
    }
  })
  const updated_metadata = JSON.parse(written)

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
