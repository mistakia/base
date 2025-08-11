import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import config from '#config'
import { THREAD_STATE } from '#libs-server/threads/threads-constants.mjs'
import create_thread from '#libs-server/threads/create-thread.mjs'
import { generate_thread_id_from_session } from '#libs-server/threads/generate-thread-id-from-session.mjs'
import { calculate_session_counts } from './session-count-utilities.mjs'
import {
  get_raw_data_storage_config,
  get_timestamp_for_raw_data
} from './thread-integration-shared-config.mjs'
import { build_timeline_from_session } from './build-timeline-entries.mjs'

const log = debug('integrations:thread:create-from-session')

export const create_thread_from_session = async ({
  normalized_session,
  user_id = config.user_id,
  user_base_directory = get_user_base_directory(),
  inference_provider,
  model,
  models,
  raw_session_data = null // Original raw data from provider
}) => {
  try {
    // Calculate message and tool call counts from normalized session
    const counts = calculate_session_counts(normalized_session.messages || [])

    // Create external session metadata
    const external_session = {
      session_provider: normalized_session.session_provider,
      session_id: normalized_session.session_id,
      imported_at: new Date().toISOString(),
      provider_metadata: normalized_session.metadata,
      raw_data_saved: !!raw_session_data
    }

    // Extract timeline timestamps for thread creation
    const session_metadata = normalized_session.metadata || {}
    const timeline_created_at = session_metadata.start_time
      ? session_metadata.start_time instanceof Date
        ? session_metadata.start_time.toISOString()
        : session_metadata.start_time
      : null
    const timeline_updated_at = session_metadata.end_time
      ? session_metadata.end_time instanceof Date
        ? session_metadata.end_time.toISOString()
        : session_metadata.end_time
      : null

    // Use the unified create_thread function
    const thread_result = await create_thread({
      user_id,
      workflow_base_uri: null, // External sessions should not have a default workflow
      inference_provider,
      model,
      models,
      thread_state: THREAD_STATE.ACTIVE,
      prompt_properties: {},
      tools: [],
      create_git_branches: false,
      create_memory_repository: false,
      external_session,
      additional_metadata: {
        system_worktree_path: null,
        user_worktree_path: null,
        message_count: counts.message_count,
        tool_call_count: counts.tool_call_count
      },
      created_at: timeline_created_at,
      updated_at: timeline_updated_at
    })

    // Save raw session data if provided
    if (raw_session_data) {
      await save_raw_session_data({
        raw_data_dir: thread_result.raw_data_dir,
        session_provider: normalized_session.session_provider,
        raw_session_data,
        normalized_session
      })
    }

    log(
      `Created thread ${thread_result.thread_id} from ${normalized_session.session_provider} session ${normalized_session.session_id}`
    )

    return {
      thread_id: thread_result.thread_id,
      thread_dir: thread_result.context_dir,
      memory_dir: path.join(thread_result.context_dir, 'memory'),
      raw_data_dir: thread_result.raw_data_dir,
      metadata_path: path.join(thread_result.context_dir, 'metadata.json'),
      metadata: thread_result
    }
  } catch (error) {
    log(`Error creating thread from session: ${error.message}`)
    throw error
  }
}

const save_raw_session_data = async ({
  raw_data_dir,
  session_provider,
  raw_session_data,
  normalized_session
}) => {
  if (!session_provider) {
    throw new Error('session_provider must be defined')
  }

  if (!raw_session_data) {
    log('No raw session data provided to save')
    return
  }

  // Get the configured timestamp format
  const storage_config = get_raw_data_storage_config()
  const timestamp = get_timestamp_for_raw_data(storage_config.timestamp_format)

  log(
    `Using timestamp format '${storage_config.timestamp_format}': ${timestamp}`
  )

  // Save provider-specific raw data format
  switch (session_provider) {
    case 'claude':
      await save_claude_raw_data({
        raw_data_dir,
        raw_data: raw_session_data,
        timestamp
      })
      break
    case 'cursor':
      await save_cursor_raw_data({
        raw_data_dir,
        raw_data: raw_session_data,
        timestamp
      })
      break
    case 'openai':
      await save_openai_raw_data({
        raw_data_dir,
        raw_data: raw_session_data,
        timestamp
      })
      break
    default: {
      throw new Error(
        `Unknown or unsupported session_provider: '${session_provider}'`
      )
    }
  }

  // Always save the normalized session for comparison
  const normalized_file = path.join(
    raw_data_dir,
    `normalized-session-${timestamp}.json`
  )
  await fs.writeFile(
    normalized_file,
    JSON.stringify(normalized_session, null, 2)
  )
  log(`Saved normalized session data to ${normalized_file}`)
}

const save_claude_raw_data = async ({ raw_data_dir, raw_data, timestamp }) => {
  // Save original JSONL entries if available
  if (raw_data.entries && Array.isArray(raw_data.entries)) {
    const jsonl_content = raw_data.entries
      .map((entry) => JSON.stringify(entry))
      .join('\n')
    const jsonl_file = path.join(
      raw_data_dir,
      `claude-session-${timestamp}.jsonl`
    )
    await fs.writeFile(jsonl_file, jsonl_content)
    log(`Saved Claude JSONL data to ${jsonl_file}`)
  }

  // Save session metadata
  if (raw_data.metadata) {
    const metadata_file = path.join(
      raw_data_dir,
      `claude-metadata-${timestamp}.json`
    )
    await fs.writeFile(
      metadata_file,
      JSON.stringify(raw_data.metadata, null, 2)
    )
    log(`Saved Claude metadata to ${metadata_file}`)
  }
}

const save_cursor_raw_data = async ({ raw_data_dir, raw_data, timestamp }) => {
  // Save the original conversation object structure
  const conversation_file = path.join(
    raw_data_dir,
    `cursor-conversation-${timestamp}.json`
  )
  await fs.writeFile(conversation_file, JSON.stringify(raw_data, null, 2))
  log(`Saved Cursor conversation data to ${conversation_file}`)

  // Save just the messages in a separate file for easier analysis
  if (raw_data.messages && Array.isArray(raw_data.messages)) {
    const messages_file = path.join(
      raw_data_dir,
      `cursor-messages-${timestamp}.json`
    )
    await fs.writeFile(
      messages_file,
      JSON.stringify(raw_data.messages, null, 2)
    )
    log(`Saved Cursor messages to ${messages_file}`)
  }
}

const save_openai_raw_data = async ({ raw_data_dir, raw_data, timestamp }) => {
  // Save the complete conversation response from OpenAI API
  const conversation_file = path.join(
    raw_data_dir,
    `openai-conversation-${timestamp}.json`
  )
  await fs.writeFile(conversation_file, JSON.stringify(raw_data, null, 2))
  log(`Saved OpenAI conversation data to ${conversation_file}`)

  // Save just the mapping structure for easier analysis
  if (raw_data.mapping) {
    const mapping_file = path.join(
      raw_data_dir,
      `openai-mapping-${timestamp}.json`
    )
    await fs.writeFile(mapping_file, JSON.stringify(raw_data.mapping, null, 2))
    log(`Saved OpenAI mapping to ${mapping_file}`)
  }
}

export const check_thread_exists = async (
  session_id,
  session_provider,
  user_base_directory
) => {
  try {
    const thread_id = generate_thread_id_from_session({
      session_id,
      session_provider
    })
    const thread_dir = path.join(user_base_directory, 'thread', thread_id)

    const stats = await fs.stat(thread_dir)
    return {
      exists: stats.isDirectory(),
      thread_id,
      thread_dir
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      const thread_id = generate_thread_id_from_session({
        session_id,
        session_provider
      })
      return {
        exists: false,
        thread_id,
        thread_dir: path.join(user_base_directory, 'thread', thread_id)
      }
    }
    throw error
  }
}

export const update_existing_thread = async (
  normalized_session,
  options = {}
) => {
  try {
    const { thread_id, thread_dir, raw_session_data } = options

    log(
      `Updating existing thread ${thread_id} for session ${normalized_session.session_id}`
    )

    // Update raw data if provided
    if (raw_session_data) {
      const raw_data_dir = path.join(thread_dir, 'raw-data')
      await fs.mkdir(raw_data_dir, { recursive: true })
      await save_raw_session_data({
        raw_data_dir,
        session_provider: normalized_session.session_provider,
        raw_session_data,
        normalized_session
      })
    }

    // Update thread metadata
    const metadata_changed = await update_thread_metadata(
      thread_dir,
      normalized_session
    )

    // Build/update timeline with merge support
    const timeline_result = await build_timeline_from_session(
      normalized_session,
      { thread_dir },
      {
        update_existing: true
      }
    )

    const files_modified = metadata_changed || timeline_result.timeline_modified

    if (files_modified) {
      log(
        `Updated thread ${thread_id} with ${timeline_result.new_entries_added} new timeline entries (metadata: ${metadata_changed ? 'changed' : 'unchanged'}, timeline: ${timeline_result.timeline_modified ? 'changed' : 'unchanged'})`
      )
    } else {
      log(`No changes detected for thread ${thread_id}, files not modified`)
    }

    return {
      thread_id,
      thread_dir,
      new_entries_added: timeline_result.new_entries_added,
      total_entries: timeline_result.entry_count,
      files_modified
    }
  } catch (error) {
    log(`Error updating existing thread: ${error.message}`)
    throw error
  }
}

const update_thread_metadata = async (thread_dir, normalized_session) => {
  try {
    const metadata_path = path.join(thread_dir, 'metadata.json')

    // Read existing metadata
    const existing_metadata = JSON.parse(
      await fs.readFile(metadata_path, 'utf-8')
    )

    // Calculate updated counts from normalized session
    const counts = calculate_session_counts(normalized_session.messages || [])

    // Update relevant fields
    const now = new Date().toISOString()

    // Use timeline end_time for updated_at if available, otherwise use current time
    const session_metadata = normalized_session.metadata || {}
    const timeline_updated_at = session_metadata.end_time
      ? session_metadata.end_time instanceof Date
        ? session_metadata.end_time.toISOString()
        : session_metadata.end_time
      : now

    const updated_metadata = {
      ...existing_metadata,
      updated_at: timeline_updated_at,
      message_count: counts.message_count,
      tool_call_count: counts.tool_call_count,
      external_session: {
        ...existing_metadata.external_session,
        provider_metadata: normalized_session.metadata
      }
    }

    // Check if metadata actually changed before writing
    const metadata_changed =
      JSON.stringify(existing_metadata) !== JSON.stringify(updated_metadata)

    if (metadata_changed) {
      // Write updated metadata only if it changed
      await fs.writeFile(
        metadata_path,
        JSON.stringify(updated_metadata, null, 2)
      )
      log(`Updated thread metadata at ${metadata_path}`)
    } else {
      log(`Metadata unchanged, skipping write for ${metadata_path}`)
    }

    return metadata_changed
  } catch (error) {
    log(`Error updating thread metadata: ${error.message}`)
    // Don't throw - metadata update failure shouldn't stop timeline update
    return false
  }
}

export const create_threads_from_sessions = async (
  normalized_sessions,
  options = {}
) => {
  log(`Creating threads from ${normalized_sessions.length} sessions`)

  const { allow_updates = false } = options

  const results = {
    created: [],
    updated: [],
    skipped: [],
    failed: []
  }

  for (const session of normalized_sessions) {
    try {
      // Check if thread already exists
      const { exists, thread_id, thread_dir } = await check_thread_exists(
        session.session_id,
        session.session_provider,
        options.user_base_directory || get_user_base_directory()
      )

      if (exists) {
        if (allow_updates) {
          // Update existing thread with new session data
          log(
            `Thread ${thread_id} already exists for session ${session.session_id}, updating...`
          )

          // Get raw session data for this specific session
          const raw_session_data = options.get_raw_session_data
            ? options.get_raw_session_data(session)
            : options.raw_session_data

          const update_result = await update_existing_thread(session, {
            ...options,
            thread_id,
            thread_dir,
            raw_session_data
          })
          results.updated.push({
            session_id: session.session_id,
            thread_id,
            thread_dir,
            new_entries_added: update_result.new_entries_added,
            files_modified: update_result.files_modified
          })
          log(
            `Successfully updated thread ${thread_id} for session ${session.session_id} (${update_result.new_entries_added} new entries, files ${update_result.files_modified ? 'modified' : 'unchanged'})`
          )
        } else {
          log(
            `Thread ${thread_id} already exists for session ${session.session_id}, skipping`
          )
          results.skipped.push({
            session_id: session.session_id,
            thread_id,
            reason: 'thread_already_exists'
          })
        }
        continue
      }

      // Create new thread
      // Get raw session data for this specific session
      const raw_session_data = options.get_raw_session_data
        ? options.get_raw_session_data(session)
        : options.raw_session_data

      // Get model/models for this specific session
      const model = options.get_model
        ? options.get_model(session)
        : options.model

      const models = options.get_models
        ? options.get_models(session)
        : options.models

      const thread_result = await create_thread_from_session({
        normalized_session: session,
        user_id: options.user_id || config.user_id,
        user_base_directory:
          options.user_base_directory || get_user_base_directory(),
        inference_provider: options.inference_provider,
        model,
        models,
        raw_session_data
      })
      results.created.push({
        session_id: session.session_id,
        thread_id: thread_result.thread_id,
        thread_dir: thread_result.thread_dir
      })

      log(
        `Successfully created thread ${thread_result.thread_id} for session ${session.session_id}`
      )
    } catch (error) {
      log(
        `Failed to create/update thread for session ${session.session_id}: ${error.message}`
      )
      results.failed.push({
        session_id: session.session_id,
        error: error.message
      })
    }
  }

  log(
    `Thread processing complete: ${results.created.length} created, ${results.updated.length} updated, ${results.skipped.length} skipped, ${results.failed.length} failed`
  )
  return results
}
