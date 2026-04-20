import path from 'path'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import { homedir } from 'os'
import { glob } from 'glob'
import debug from 'debug'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'
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
import { acquire_thread_import_lock } from '#libs-server/threads/timeline/thread-import-lock.mjs'
import { assert_thread_metadata_present } from '#libs-server/threads/assert-thread-metadata-present.mjs'
import { queue_relation_analysis } from '#libs-server/metadata/analyze-thread-relations.mjs'

const log = debug('integrations:thread:create-from-session')
const log_debug = debug('integrations:thread:create-from-session:debug')
const log_perf = debug('integrations:claude:perf')

/**
 * Safely convert a date value to ISO string, returning null for invalid dates.
 * Handles Date objects (including Invalid Date), ISO strings, and null/undefined.
 */
const safe_date_to_iso = (value) => {
  if (value == null) return null
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString()
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  return null
}

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

/**
 * Post-write integrity check for a thread directory.
 *
 * After create_thread_from_session or update_existing_thread returns, assert
 * that metadata.json and timeline.jsonl are both on disk (and raw-data/ when
 * raw session data was supplied). Catches the class of failure where an
 * external actor (e.g. sync-all.sh stash_and_abort) has unlinked metadata.json
 * between our writes and our return, so the orphan is surfaced immediately
 * instead of silently waiting for the next backfill to notice.
 */
export const verify_thread_directory_integrity = async ({
  thread_dir,
  expect_raw_data = false
}) => {
  const checks = [
    { name: 'metadata.json', full: path.join(thread_dir, 'metadata.json') },
    { name: 'timeline.jsonl', full: path.join(thread_dir, 'timeline.jsonl') }
  ]
  if (expect_raw_data) {
    checks.push({ name: 'raw-data/', full: path.join(thread_dir, 'raw-data') })
  }

  const missing = []
  for (const check of checks) {
    try {
      await fs.access(check.full)
    } catch (error) {
      if (error.code === 'ENOENT') {
        missing.push(check.name)
      } else {
        throw error
      }
    }
  }

  if (missing.length > 0) {
    const err = new Error(
      `thread directory integrity check failed: ${thread_dir} is missing ${missing.join(', ')} after write`
    )
    err.code = 'THREAD_POST_WRITE_INTEGRITY'
    err.thread_dir = thread_dir
    err.missing = missing
    throw err
  }
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
    const timeline_created_at = safe_date_to_iso(session_metadata.start_time)
    const timeline_updated_at = safe_date_to_iso(session_metadata.end_time)

    // Flag anomaly: non-empty session with zero assistant messages
    if (
      counts.message_count > 0 &&
      detailed_counts.assistant_message_count === 0
    ) {
      log(
        `Warning: session ${normalized_session.session_id} has ${counts.message_count} messages but 0 assistant messages (possible silent failure)`
      )
    }

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

export const save_raw_session_data = async ({
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
        session_id,
        parse_mode: normalized_session.parse_mode
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

  // normalized-session.json intentionally not written -- 8.8 GB of dead weight
  // that is never read back by any code. Bulk session data is synced via rsync.
}

const save_claude_raw_data = async ({
  raw_data_dir,
  raw_data,
  session_id,
  parse_mode
}) => {
  if (parse_mode !== 'full' && parse_mode !== 'delta') {
    throw new Error(
      `save_claude_raw_data: parse_mode must be 'full' or 'delta', got ${parse_mode}`
    )
  }

  // Save original JSONL entries if available using streaming writes
  // to avoid holding multiple copies in memory for large sessions
  if (raw_data.entries && Array.isArray(raw_data.entries)) {
    const jsonl_file = path.join(raw_data_dir, 'claude-session.jsonl')
    const flags = parse_mode === 'full' ? 'w' : 'a'
    await new Promise((resolve, reject) => {
      const write_stream = createWriteStream(jsonl_file, { flags })
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
    log_debug(
      `Saved Claude JSONL data to ${jsonl_file} (parse_mode=${parse_mode})`
    )
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
      user_base_directory = get_user_base_directory(),
      source_overrides = null
    } = options

    log_debug(
      `Updating existing thread ${thread_id} for session ${normalized_session.session_id}`
    )

    await fs.mkdir(thread_dir, { recursive: true })
    const import_lock = await acquire_thread_import_lock({ thread_dir })
    let metadata_changed
    let timeline_result
    try {
      // metadata.json must be the first file in thread_dir. If it is already
      // present this is a no-op on disk thanks to the hash-comparison short
      // circuit; if it is missing (repair path), update_thread_metadata seeds
      // a skeleton and writes a full record before anything else touches the
      // directory.
      metadata_changed = await update_thread_metadata(
        thread_dir,
        normalized_session,
        { source_overrides }
      )

      // Enforce the lifecycle-anchor invariant before any sibling file is
      // written. If metadata.json is still missing at this point the writer
      // swallowed an error we need to surface loudly.
      await assert_thread_metadata_present({ thread_dir })

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

      // Always rebuild timeline from the full normalized session.
      timeline_result = await build_timeline_from_session(normalized_session, {
        thread_dir,
        thread_id
      })
    } finally {
      await import_lock.release()
    }

    await verify_thread_directory_integrity({
      thread_dir,
      expect_raw_data: !!raw_session_data
    })

    const files_modified = metadata_changed || timeline_result.timeline_modified

    if (files_modified) {
      log_debug(
        `Updated thread ${thread_id} (${timeline_result.entry_count} timeline entries; metadata: ${metadata_changed ? 'changed' : 'unchanged'}, timeline: ${timeline_result.timeline_modified ? 'changed' : 'unchanged'})`
      )
      // Re-queue relation analysis so cached continuation-signal flags and
      // relations reflect the updated timeline. Without this, re-imports that
      // append new assistant turns with continuation prompts would leave
      // has_continuation_prompt stale and be filtered out of future pools.
      try {
        await queue_relation_analysis(thread_id)
      } catch (error) {
        log(
          `Failed to queue relation analysis for re-imported thread ${thread_id}: ${error.message}`
        )
      }
    } else {
      log_debug(
        `No changes detected for thread ${thread_id}, files not modified`
      )
    }

    return {
      thread_id,
      thread_dir,
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

export const update_thread_metadata = async (
  thread_dir,
  normalized_session,
  { source_overrides = null } = {}
) => {
  try {
    const metadata_start = Date.now()
    const metadata_path = path.join(thread_dir, 'metadata.json')

    // Read existing metadata. When metadata.json is missing (e.g. a prior
    // import crashed mid-write, or only raw-data/ + timeline.jsonl survived),
    // seed with a minimal skeleton so the merge/write path below can bootstrap
    // a fresh metadata file rather than silently no-op.
    let existing_metadata
    try {
      existing_metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))
    } catch (read_error) {
      if (read_error.code !== 'ENOENT') throw read_error
      existing_metadata = {
        thread_id: path.basename(thread_dir),
        created_at: new Date().toISOString()
      }
    }

    // Never downgrade a container_user thread. Once the container-aware
    // import path has stamped a thread with execution_mode='container_user',
    // no subsequent import may rewrite those fields, even if the new import
    // supplies its own source_overrides (e.g. sync_session_fallback running
    // from the owner's process with execution_mode='host').
    const existing_execution_mode =
      existing_metadata.source?.execution_mode || null
    const effective_source_overrides =
      existing_execution_mode === 'container_user' ? null : source_overrides
    if (
      existing_execution_mode === 'container_user' &&
      source_overrides &&
      source_overrides.execution_mode !== 'container_user'
    ) {
      log(
        `Refusing to overwrite container_user attribution on ${thread_dir} (incoming execution_mode=${source_overrides.execution_mode})`
      )
    }

    // Calculate updated counts from normalized session.
    // When precomputed_counts exist (incremental sync), use them instead of
    // iterating the partial messages array.
    const precomputed = normalized_session.precomputed_counts
    const counts = precomputed
      ? {
          message_count: precomputed.message_count,
          tool_call_count: precomputed.tool_call_count
        }
      : calculate_session_counts(normalized_session.messages || [])
    const detailed_counts = precomputed
      ? {
          user_message_count: precomputed.user_message_count,
          assistant_message_count: precomputed.assistant_message_count
        }
      : calculate_detailed_message_counts(normalized_session.messages || [])
    const token_counts = precomputed
      ? {
          input_tokens: precomputed.input_tokens,
          output_tokens: precomputed.output_tokens,
          cache_creation_input_tokens: precomputed.cache_creation_input_tokens,
          cache_read_input_tokens: precomputed.cache_read_input_tokens
        }
      : aggregate_token_counts(normalized_session.metadata || {})

    const updated_metadata = {
      ...existing_metadata,
      message_count: counts.message_count,
      tool_call_count: counts.tool_call_count,
      source: {
        ...build_source_from_existing(existing_metadata, normalized_session),
        provider_metadata: {
          ...normalized_session.metadata,
          plan_slug: normalized_session.metadata?.plan_slug || null
        },
        // Apply source overrides last so explicit container attribution
        // from the calling import path wins, but fall back to existing
        // values when no overrides are supplied. Overrides are suppressed
        // when they would downgrade a container_user thread.
        ...(effective_source_overrides || {})
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

    // Backfill title from session messages if missing (thread-first flow
    // pre-creates threads with title: null)
    if (!updated_metadata.title) {
      const initial_prompt = extract_initial_user_prompt_from_messages({
        messages: normalized_session.messages
      })
      const default_title = generate_default_thread_title_from_prompt({
        prompt: initial_prompt
      })
      if (default_title) {
        updated_metadata.title = default_title
      }
    }

    // Compare using stable stringify that excludes timestamps and handles key ordering
    const existing_stable = stable_stringify_for_comparison(existing_metadata)
    const updated_stable = stable_stringify_for_comparison(updated_metadata)
    const metadata_changed = existing_stable !== updated_stable

    const diff_ms = Date.now() - metadata_start

    if (metadata_changed) {
      // Only update updated_at when meaningful changes exist
      const session_metadata = normalized_session.metadata || {}
      const timeline_updated_at =
        safe_date_to_iso(session_metadata.end_time) || new Date().toISOString()

      updated_metadata.updated_at = timeline_updated_at

      const write_start = Date.now()
      await write_file_to_filesystem({
        absolute_path: metadata_path,
        file_content: JSON.stringify(updated_metadata, null, 2)
      })
      const write_ms = Date.now() - write_start
      log_debug(`Updated thread metadata at ${metadata_path}`)
      log_perf(
        'update_thread_metadata session=%s metadata_changed=true diff_ms=%d write_ms=%d total_ms=%d',
        normalized_session.session_id,
        diff_ms,
        write_ms,
        Date.now() - metadata_start
      )
    } else {
      log_debug(`Metadata unchanged, skipping write for ${metadata_path}`)
      log_perf(
        'update_thread_metadata session=%s metadata_changed=false diff_ms=%d',
        normalized_session.session_id,
        diff_ms
      )
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
            files_modified: update_result.files_modified
          })
          log_debug(
            `Successfully updated thread ${thread_id} for session ${session.session_id} (files ${update_result.files_modified ? 'modified' : 'unchanged'})`
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
