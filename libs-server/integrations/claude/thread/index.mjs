import debug from 'debug'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'
import {
  create_thread_from_session,
  create_threads_from_sessions
} from '#libs-server/integrations/thread/create-from-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'

const log = debug('integrations:claude:thread')

export const create_thread_from_claude_session = async (
  claude_session,
  options = {}
) => {
  try {
    log(`Creating thread from Claude session: ${claude_session.session_id}`)

    // Normalize the Claude session to common format
    const normalized_session = normalize_claude_session(claude_session)

    // Extract models from metadata
    const models = normalized_session.metadata.models || []

    // Pass raw Claude session data for preservation
    const thread_options = {
      ...options,
      inference_provider: 'anthropic',
      models,
      raw_session_data: claude_session
    }

    // Create thread structure and metadata
    const thread_info = await create_thread_from_session({
      normalized_session,
      ...thread_options
    })

    // Build timeline entries from session messages
    const timeline_info = await build_timeline_from_session(
      normalized_session,
      thread_info
    )

    log(
      `Successfully created thread ${thread_info.thread_id} with ${timeline_info.entry_count} timeline entries`
    )

    return {
      thread_id: thread_info.thread_id,
      thread_dir: thread_info.thread_dir,
      session_id: claude_session.session_id,
      timeline_entries: timeline_info.entry_count,
      metadata: thread_info.metadata,
      timeline_path: timeline_info.timeline_path,
      normalized_session
    }
  } catch (error) {
    log(
      `Error creating thread from Claude session ${claude_session.session_id}: ${error.message}`
    )
    throw error
  }
}

export const create_threads_from_claude_sessions = async (
  claude_sessions,
  options = {}
) => {
  log(`Creating threads from ${claude_sessions.length} Claude sessions`)

  // Normalize all sessions first
  const normalized_sessions = claude_sessions.map((session) => {
    const normalized = normalize_claude_session(session)
    // Attach raw session data for preservation
    normalized._raw_session_data = session
    return normalized
  })

  // Enhanced options with raw data mapping and inference provider
  const enhanced_options = {
    ...options,
    inference_provider: 'anthropic',
    get_raw_session_data: (normalized_session) =>
      normalized_session._raw_session_data,
    // Extract models for each session individually
    get_models: (normalized_session) => {
      return normalized_session.metadata.models || []
    }
  }

  const batch_results = await create_threads_from_sessions(
    normalized_sessions,
    enhanced_options
  )

  // Format results for Claude-specific response
  const results = {
    created: batch_results.created,
    updated: batch_results.updated,
    skipped: batch_results.skipped,
    failed: batch_results.failed,
    total_sessions: claude_sessions.length
  }

  const summary = {
    total: results.total_sessions,
    created: results.created.length,
    updated: results.updated.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    success_rate:
      results.total_sessions > 0
        ? (
            ((results.created.length + results.updated.length) /
              results.total_sessions) *
            100
          ).toFixed(1)
        : 0
  }

  log(
    `Claude thread processing summary: ${summary.created}/${summary.total} created, ${summary.updated} updated (${summary.success_rate}% success rate)`
  )

  return {
    ...results,
    summary
  }
}

export const validate_claude_session = (claude_session) => {
  const errors = []

  if (!claude_session.session_id) {
    errors.push('Missing session_id')
  }

  if (!claude_session.entries || !Array.isArray(claude_session.entries)) {
    errors.push('Missing or invalid entries array')
  }

  if (!claude_session.metadata) {
    errors.push('Missing metadata')
  }

  if (claude_session.entries) {
    const required_fields = ['uuid', 'timestamp', 'type']
    claude_session.entries.forEach((entry, index) => {
      required_fields.forEach((field) => {
        if (!entry[field]) {
          errors.push(`Entry ${index} missing required field: ${field}`)
        }
      })
    })
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export const filter_valid_claude_sessions = (claude_sessions) => {
  const valid_sessions = []
  const invalid_sessions = []

  claude_sessions.forEach((session) => {
    const validation = validate_claude_session(session)
    if (validation.valid) {
      valid_sessions.push(session)
    } else {
      invalid_sessions.push({
        session_id: session.session_id,
        errors: validation.errors
      })
    }
  })

  if (invalid_sessions.length > 0) {
    log(`Found ${invalid_sessions.length} invalid sessions:`)
    invalid_sessions.forEach(({ session_id, errors }) => {
      log(`  Session ${session_id}: ${errors.join(', ')}`)
    })
  }

  return {
    valid: valid_sessions,
    invalid: invalid_sessions,
    total: claude_sessions.length
  }
}
