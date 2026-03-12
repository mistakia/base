import path from 'path'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import { homedir } from 'os'
import { promisify } from 'util'
import glob_pkg from 'glob'
import debug from 'debug'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import config from '#config'
import { THREAD_STATE } from '#libs-server/threads/threads-constants.mjs'
import create_thread from '#libs-server/threads/create-thread.mjs'
import { generate_thread_id_from_session } from '#libs-server/threads/generate-thread-id-from-session.mjs'
import {
  calculate_session_counts,
  calculate_detailed_message_counts,
  aggregate_token_counts,
  extract_initial_user_prompt_from_messages,
  generate_default_thread_title_from_prompt
} from './session-count-utilities.mjs'
import { build_timeline_from_session } from './build-timeline-entries.mjs'

const glob = promisify(glob_pkg)
const log = debug('integrations:thread:create-from-session')
const log_debug = debug('integrations:thread:create-from-session:debug')

/**
 * Create a stable string representation for comparison by sorting keys recursively
 * and excluding timestamp fields that shouldn't trigger updates
 */
const stable_stringify_for_comparison = (
  obj,
  exclude_keys = ['updated_at', 'created_at']
) => {
  const sort_object = (o) => {
    if (o === null || typeof o !== 'object') {
      return o
    }
    if (Array.isArray(o)) {
      return o.map(sort_object)
    }
    const sorted = {}
    Object.keys(o)
      .filter((key) => !exclude_keys.includes(key))
      .sort()
      .forEach((key) => {
        sorted[key] = sort_object(o[key])
      })
    return sorted
  }
  return JSON.stringify(sort_object(obj))
}

export const create_thread_from_session = async ({
  normalized_session,
  user_public_key = config.user_public_key,
  user_base_directory = get_user_base_directory(),
  inference_provider,
  models,
  raw_session_data = null, // Original raw data from provider
  source_overrides = null // Additional source fields (e.g. execution_mode, container_user)
}) => {
  try {
    // Calculate message and tool call counts from normalized session
    const counts = calculate_session_counts(normalized_session.messages || [])

    // Calculate detailed message counts and token information for Claude sessions
    const detailed_counts = calculate_detailed_message_counts(
      normalized_session.messages || []
    )
    const token_counts = aggregate_token_counts(
      normalized_session.metadata || {}
    )

    // Create source metadata (session origin tracking)
    const source = {
      provider: normalized_session.session_provider,
      session_id: normalized_session.session_id,
      imported_at: new Date().toISOString(),
      provider_metadata: {
        ...normalized_session.metadata,
        plan_slug: normalized_session.metadata?.plan_slug || null
      },
      raw_data_saved: !!raw_session_data,
      // Apply source overrides (execution_mode, container_user, container_name)
      ...(source_overrides || {})
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

    // Extract default title from initial user prompt
    const initial_prompt = extract_initial_user_prompt_from_messages({
      messages: normalized_session.messages
    })
    const default_title = generate_default_thread_title_from_prompt({
      prompt: initial_prompt
    })

    // Use the unified create_thread function
    const thread_result = await create_thread({
      user_public_key,
      workflow_base_uri: null, // External sessions should not have a default workflow
      inference_provider,
      models,
      thread_state: THREAD_STATE.ACTIVE,
      prompt_properties: {},
      tools: [],
      create_git_branches: false,
      create_memory_repository: false,
      source,
      title: default_title,
      additional_metadata: {
        system_worktree_path: null,
        user_worktree_path: null,
        message_count: counts.message_count,
        tool_call_count: counts.tool_call_count,
        // Add detailed counts for Claude sessions
        ...(normalized_session.session_provider === 'claude' && {
          user_message_count: detailed_counts.user_message_count,
          assistant_message_count: detailed_counts.assistant_message_count,
          input_tokens: token_counts.input_tokens,
          output_tokens: token_counts.output_tokens,
          cache_creation_input_tokens: token_counts.cache_creation_input_tokens,
          cache_read_input_tokens: token_counts.cache_read_input_tokens
        })
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

    // Save plan to shared location if session has a plan_slug
    const plan_slug = normalized_session.metadata?.plan_slug
    if (plan_slug) {
      await save_plan_to_shared_location({
        plan_slug,
        user_base_directory
      })
    }

    log_debug(
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

  // Extract session_id for provider-specific handling
  const session_id = normalized_session.session_id

  // Save provider-specific raw data format
  switch (session_provider) {
    case 'claude':
      await save_claude_raw_data({
        raw_data_dir,
        raw_data: raw_session_data,
        session_id
      })
      break
    case 'cursor':
      await save_cursor_raw_data({
        raw_data_dir,
        raw_data: raw_session_data
      })
      break
    case 'chatgpt':
      await save_chatgpt_raw_data({
        raw_data_dir,
        raw_data: raw_session_data
      })
      break
    default: {
      throw new Error(
        `Unknown or unsupported session_provider: '${session_provider}'`
      )
    }
  }

  // Always save the normalized session for comparison
  // Use streaming writes to avoid building a massive string for large sessions
  const normalized_file = path.join(raw_data_dir, 'normalized-session.json')
  await stream_write_normalized_session(normalized_file, normalized_session)
  log_debug(`Saved normalized session data to ${normalized_file}`)
}

/**
 * Write normalized session JSON using streaming to avoid building one massive
 * string for sessions with thousands of messages. Writes messages one at a time.
 */
const stream_write_normalized_session = (file_path, session) => {
  return new Promise((resolve, reject) => {
    const ws = createWriteStream(file_path)
    ws.on('error', reject)
    ws.on('finish', resolve)

    const { messages, ...rest } = session

    // Write non-message properties first (these are small)
    ws.write('{\n')
    const rest_entries = Object.entries(rest)
    for (let i = 0; i < rest_entries.length; i++) {
      const [key, value] = rest_entries[i]
      const formatted = JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')
      ws.write(`  ${JSON.stringify(key)}: ${formatted},\n`)
    }

    // Write messages array incrementally - one message at a time
    ws.write('  "messages": [')
    if (messages && messages.length > 0) {
      for (let i = 0; i < messages.length; i++) {
        ws.write(i > 0 ? ',\n    ' : '\n    ')
        ws.write(JSON.stringify(messages[i]))
      }
      ws.write('\n  ')
    }
    ws.write(']\n}\n')
    ws.end()
  })
}

const save_claude_raw_data = async ({ raw_data_dir, raw_data, session_id }) => {
  // Save original JSONL entries if available using streaming writes
  // to avoid holding multiple copies in memory for large sessions
  if (raw_data.entries && Array.isArray(raw_data.entries)) {
    const jsonl_file = path.join(raw_data_dir, 'claude-session.jsonl')
    await new Promise((resolve, reject) => {
      const write_stream = createWriteStream(jsonl_file)
      write_stream.on('error', reject)
      write_stream.on('finish', resolve)
      for (let i = 0; i < raw_data.entries.length; i++) {
        const line = JSON.stringify(raw_data.entries[i])
        // Release entry after serializing to progressively free memory
        // for large sessions (entries already normalized, no longer needed)
        raw_data.entries[i] = null
        write_stream.write(line + '\n')
      }
      write_stream.end()
    })
    // Release the entries array itself
    raw_data.entries = null
    log_debug(`Saved Claude JSONL data to ${jsonl_file}`)
  }

  // Save session metadata
  if (raw_data.metadata) {
    const metadata_file = path.join(raw_data_dir, 'claude-metadata.json')
    await fs.writeFile(
      metadata_file,
      JSON.stringify(raw_data.metadata, null, 2)
    )
    log_debug(`Saved Claude metadata to ${metadata_file}`)
  }

  // Save todo files if they exist for this session
  if (session_id) {
    await save_claude_todos({ raw_data_dir, session_id })
  }
}

const save_claude_todos = async ({ raw_data_dir, session_id }) => {
  const host_todos_dir = path.join(homedir(), '.claude', 'todos')

  try {
    // Check if host todos directory exists
    await fs.access(host_todos_dir)
  } catch {
    // Directory doesn't exist (e.g., container environment) - skip silently
    return
  }

  // Glob for session-specific todo files
  // Matches: <session_id>.json and <session_id>-agent-*.json
  // Using single pattern that matches both naming conventions
  const todo_pattern = path.join(host_todos_dir, `${session_id}*.json`)
  const todo_files = await glob(todo_pattern)

  if (todo_files.length === 0) {
    log_debug(`No todo files found for session ${session_id}`)
    return
  }

  // Filter out empty todo files (files containing just [] or empty)
  const non_empty_todo_files = []
  for (const todo_file of todo_files) {
    try {
      const content = await fs.readFile(todo_file, 'utf-8')
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed) && parsed.length > 0) {
        non_empty_todo_files.push(todo_file)
      }
    } catch {
      // Skip files that can't be read or parsed
    }
  }

  if (non_empty_todo_files.length === 0) {
    log_debug(`No non-empty todo files found for session ${session_id}`)
    return
  }

  // Create todos directory in raw-data
  const todos_dir = path.join(raw_data_dir, 'todos')
  await fs.mkdir(todos_dir, { recursive: true })

  // Copy all non-empty todo files in parallel
  await Promise.all(
    non_empty_todo_files.map((todo_file) => {
      const filename = path.basename(todo_file)
      const dest_file = path.join(todos_dir, filename)
      return fs.copyFile(todo_file, dest_file)
    })
  )

  log_debug(
    `Saved ${non_empty_todo_files.length} todo file(s) for session ${session_id}`
  )
}

/**
 * Save the plan file to the global shared location in the thread submodule
 * Plans are stored at thread/plans/<slug>.md (not under individual thread UUIDs)
 */
const save_plan_to_shared_location = async ({
  plan_slug,
  user_base_directory
}) => {
  if (!plan_slug) {
    return
  }

  const host_plans_dir = path.join(homedir(), '.claude', 'plans')
  const host_plan_file = path.join(host_plans_dir, `${plan_slug}.md`)

  try {
    // Check if host plan file exists
    await fs.access(host_plan_file)
  } catch {
    // Plan file doesn't exist on host - skip silently
    log_debug(`Plan file not found on host: ${host_plan_file}`)
    return
  }

  // Create thread/plans/ directory if it doesn't exist
  const shared_plans_dir = path.join(user_base_directory, 'thread', 'plans')
  await fs.mkdir(shared_plans_dir, { recursive: true })

  const dest_plan_file = path.join(shared_plans_dir, `${plan_slug}.md`)

  try {
    // Check if plan already exists in shared location (avoid race conditions)
    await fs.access(dest_plan_file)
    log_debug(`Plan ${plan_slug} already exists in shared location, skipping`)
    return
  } catch {
    // Plan doesn't exist yet, copy it
  }

  await fs.copyFile(host_plan_file, dest_plan_file)
  log_debug(`Saved plan ${plan_slug} to shared location: ${dest_plan_file}`)
}

const save_cursor_raw_data = async ({ raw_data_dir, raw_data }) => {
  // Save the original conversation object structure
  const conversation_file = path.join(raw_data_dir, 'cursor-conversation.json')
  await fs.writeFile(conversation_file, JSON.stringify(raw_data, null, 2))
  log_debug(`Saved Cursor conversation data to ${conversation_file}`)

  // Save just the messages in a separate file for easier analysis
  if (raw_data.messages && Array.isArray(raw_data.messages)) {
    const messages_file = path.join(raw_data_dir, 'cursor-messages.json')
    await fs.writeFile(
      messages_file,
      JSON.stringify(raw_data.messages, null, 2)
    )
    log_debug(`Saved Cursor messages to ${messages_file}`)
  }
}

const save_chatgpt_raw_data = async ({ raw_data_dir, raw_data }) => {
  // Save the complete conversation response from ChatGPT API
  const conversation_file = path.join(raw_data_dir, 'chatgpt-conversation.json')
  await fs.writeFile(conversation_file, JSON.stringify(raw_data, null, 2))
  log_debug(`Saved ChatGPT conversation data to ${conversation_file}`)

  // Save just the mapping structure for easier analysis
  if (raw_data.mapping) {
    const mapping_file = path.join(raw_data_dir, 'chatgpt-mapping.json')
    await fs.writeFile(mapping_file, JSON.stringify(raw_data.mapping, null, 2))
    log_debug(`Saved ChatGPT mapping to ${mapping_file}`)
  }
}

export const check_thread_exists = async (
  session_id,
  session_provider,
  user_base_directory
) => {
  const thread_id = generate_thread_id_from_session({
    session_id,
    session_provider
  })
  const thread_dir = path.join(user_base_directory, 'thread', thread_id)

  try {
    const stats = await fs.stat(thread_dir)
    if (!stats.isDirectory()) {
      return { exists: false, thread_id, thread_dir }
    }

    // Verify metadata.json exists -- a directory without it is a partial/broken
    // thread (e.g. prior import failed mid-way) and should be recreated
    const metadata_path = path.join(thread_dir, 'metadata.json')
    try {
      await fs.stat(metadata_path)
    } catch (meta_error) {
      if (meta_error.code === 'ENOENT') {
        log_debug(
          `Thread directory ${thread_id} exists but metadata.json is missing, treating as non-existent`
        )
        return { exists: false, thread_id, thread_dir }
      }
      throw meta_error
    }

    return { exists: true, thread_id, thread_dir }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        exists: false,
        thread_id,
        thread_dir
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
    const {
      thread_id,
      thread_dir,
      raw_session_data,
      user_base_directory = get_user_base_directory()
    } = options

    log_debug(
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

    // Save plan to shared location if session has a plan_slug
    const plan_slug = normalized_session.metadata?.plan_slug
    if (plan_slug) {
      await save_plan_to_shared_location({
        plan_slug,
        user_base_directory
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
      log_debug(
        `Updated thread ${thread_id} with ${timeline_result.new_entries_added} new timeline entries (metadata: ${metadata_changed ? 'changed' : 'unchanged'}, timeline: ${timeline_result.timeline_modified ? 'changed' : 'unchanged'})`
      )
    } else {
      log_debug(
        `No changes detected for thread ${thread_id}, files not modified`
      )
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

/**
 * Build source object from existing metadata.
 * When migrating from old metadata format (pre-source field), extracts
 * session tracking fields from old external_session and normalized session
 * to preserve session_id, imported_at, and raw_data_saved.
 */
function build_source_from_existing(existing_metadata, normalized_session) {
  if (existing_metadata.source) {
    return existing_metadata.source
  }

  // Migrate from old format - extract tracking fields from
  // old external_session and normalized session data
  const external_session = existing_metadata.external_session
  return {
    provider:
      external_session?.provider ||
      external_session?.session_provider ||
      normalized_session.session_provider,
    session_id:
      external_session?.session_id || normalized_session.session_id || null,
    imported_at: external_session?.imported_at || new Date().toISOString(),
    raw_data_saved: external_session?.raw_data_saved ?? false
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
    const detailed_counts = calculate_detailed_message_counts(
      normalized_session.messages || []
    )
    const token_counts = aggregate_token_counts(
      normalized_session.metadata || {}
    )

    const updated_metadata = {
      ...existing_metadata,
      message_count: counts.message_count,
      tool_call_count: counts.tool_call_count,
      source: {
        ...build_source_from_existing(existing_metadata, normalized_session),
        provider_metadata: {
          ...normalized_session.metadata,
          plan_slug: normalized_session.metadata?.plan_slug || null
        }
      },
      // Add detailed counts for Claude sessions
      ...(normalized_session.session_provider === 'claude' && {
        user_message_count: detailed_counts.user_message_count,
        assistant_message_count: detailed_counts.assistant_message_count,
        input_tokens: token_counts.input_tokens,
        output_tokens: token_counts.output_tokens,
        cache_creation_input_tokens: token_counts.cache_creation_input_tokens,
        cache_read_input_tokens: token_counts.cache_read_input_tokens
      })
    }

    // Compare using stable stringify that excludes timestamps and handles key ordering
    const existing_stable = stable_stringify_for_comparison(existing_metadata)
    const updated_stable = stable_stringify_for_comparison(updated_metadata)
    const metadata_changed = existing_stable !== updated_stable

    if (metadata_changed) {
      // Only update updated_at when meaningful changes exist
      const session_metadata = normalized_session.metadata || {}
      const timeline_updated_at = session_metadata.end_time
        ? session_metadata.end_time instanceof Date
          ? session_metadata.end_time.toISOString()
          : session_metadata.end_time
        : new Date().toISOString()

      updated_metadata.updated_at = timeline_updated_at

      await fs.writeFile(
        metadata_path,
        JSON.stringify(updated_metadata, null, 2)
      )
      log_debug(`Updated thread metadata at ${metadata_path}`)
    } else {
      log_debug(`Metadata unchanged, skipping write for ${metadata_path}`)
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
  log_debug(`Creating threads from ${normalized_sessions.length} sessions`)

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
          log_debug(
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
          log_debug(
            `Successfully updated thread ${thread_id} for session ${session.session_id} (${update_result.new_entries_added} new entries, files ${update_result.files_modified ? 'modified' : 'unchanged'})`
          )
        } else {
          log_debug(
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

      // Get models for this specific session
      const models = options.get_models
        ? options.get_models(session)
        : options.models

      const thread_result = await create_thread_from_session({
        normalized_session: session,
        user_public_key: options.user_public_key || config.user_public_key,
        user_base_directory:
          options.user_base_directory || get_user_base_directory(),
        inference_provider: options.inference_provider,
        models,
        raw_session_data
      })
      results.created.push({
        session_id: session.session_id,
        thread_id: thread_result.thread_id,
        thread_dir: thread_result.thread_dir
      })

      log_debug(
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
