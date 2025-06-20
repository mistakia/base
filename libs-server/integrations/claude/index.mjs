import debug from 'debug'
import {
  find_claude_project_files,
  parse_claude_jsonl_file,
  parse_all_claude_files,
  get_session_summary
} from './parse-jsonl.mjs'
import {
  normalize_claude_session,
  normalize_claude_sessions
} from './normalize-session.mjs'
import {
  create_thread_from_claude_session,
  create_threads_from_claude_sessions,
  validate_claude_session,
  filter_valid_claude_sessions
} from './thread/index.mjs'

const log = debug('integrations:claude')

export const import_claude_sessions_to_threads = async (options = {}) => {
  const {
    projects_dir = '~/.claude/projects',
    filter_sessions = null,
    user_base_directory = process.env.USER_BASE_DIRECTORY || '/Users/trashman/user-base',
    dry_run = false,
    verbose = false
  } = options

  try {
    log(`Starting Claude session import from ${projects_dir}`)

    // Step 1: Find and parse all Claude project files
    log('Step 1: Parsing Claude project files...')
    const claude_sessions = await parse_all_claude_files({
      projects_dir,
      filter_sessions
    })

    if (verbose) {
      log(`Found ${claude_sessions.length} Claude sessions:`)
      claude_sessions.forEach(session => {
        const summary = get_session_summary(session)
        log(`  ${session.session_id}: ${summary.entry_count} entries (${summary.duration_minutes?.toFixed(1) || 'unknown'} min)`)
      })
    }

    // Step 2: Validate sessions
    log('Step 2: Validating sessions...')
    const { valid: valid_sessions, invalid: invalid_sessions } = filter_valid_claude_sessions(claude_sessions)

    log(`Validation complete: ${valid_sessions.length} valid, ${invalid_sessions.length} invalid`)

    if (invalid_sessions.length > 0 && verbose) {
      log('Invalid sessions:')
      invalid_sessions.forEach(({ session_id, errors }) => {
        log(`  ${session_id}: ${errors.join(', ')}`)
      })
    }

    if (dry_run) {
      log('Dry run mode - would create threads for the following sessions:')
      valid_sessions.forEach(session => {
        const summary = get_session_summary(session)
        log(`  ${session.session_id}: ${summary.entry_count} entries, ${summary.summaries.join('; ')}`)
      })

      return {
        dry_run: true,
        sessions_found: claude_sessions.length,
        valid_sessions: valid_sessions.length,
        invalid_sessions: invalid_sessions.length,
        would_create: valid_sessions.length
      }
    }

    // Step 3: Create threads from valid sessions
    log(`Step 3: Creating threads from ${valid_sessions.length} valid sessions...`)
    const thread_results = await create_threads_from_claude_sessions(valid_sessions, {
      user_base_directory,
      ...options
    })

    // Step 4: Summary
    const final_summary = {
      total_files_processed: claude_sessions.length,
      sessions_found: claude_sessions.length,
      valid_sessions: valid_sessions.length,
      invalid_sessions: invalid_sessions.length,
      threads_created: thread_results.created.length,
      threads_failed: thread_results.failed.length,
      success_rate: thread_results.summary.success_rate,
      results: thread_results
    }

    log('=== Import Summary ===')
    log(`Total sessions found: ${final_summary.sessions_found}`)
    log(`Valid sessions: ${final_summary.valid_sessions}`)
    log(`Threads created: ${final_summary.threads_created}`)
    log(`Success rate: ${final_summary.success_rate}%`)

    if (thread_results.failed.length > 0) {
      log('Failed threads:')
      thread_results.failed.forEach(({ session_id, error }) => {
        log(`  ${session_id}: ${error}`)
      })
    }

    return final_summary
  } catch (error) {
    log(`Error during Claude session import: ${error.message}`)
    throw error
  }
}

export const import_single_claude_file = async (file_path, options = {}) => {
  try {
    log(`Importing single Claude file: ${file_path}`)

    // Parse the specific file
    const sessions = await parse_claude_jsonl_file(file_path)
    log(`Found ${sessions.length} sessions in file`)

    // Filter and validate
    const { valid: valid_sessions } = filter_valid_claude_sessions(sessions)

    if (options.dry_run) {
      return {
        dry_run: true,
        file_path,
        sessions_found: sessions.length,
        valid_sessions: valid_sessions.length
      }
    }

    // Create threads
    const results = await create_threads_from_claude_sessions(valid_sessions, options)

    return {
      file_path,
      sessions_found: sessions.length,
      valid_sessions: valid_sessions.length,
      threads_created: results.created.length,
      results
    }
  } catch (error) {
    log(`Error importing Claude file ${file_path}: ${error.message}`)
    throw error
  }
}

export const list_claude_sessions = async (options = {}) => {
  const {
    projects_dir = '~/.claude/projects',
    include_summaries = true
  } = options

  try {
    const sessions = await parse_all_claude_files({ projects_dir })

    return sessions.map(session => {
      const summary = get_session_summary(session)

      const session_info = {
        session_id: session.session_id,
        file_source: summary.file_source,
        entry_count: summary.entry_count,
        start_time: summary.start_time,
        end_time: summary.end_time,
        duration_minutes: summary.duration_minutes,
        working_directory: summary.working_directory,
        claude_version: summary.claude_version
      }

      if (include_summaries) {
        session_info.summaries = summary.summaries
        session_info.type_counts = summary.type_counts
      }

      return session_info
    })
  } catch (error) {
    log(`Error listing Claude sessions: ${error.message}`)
    throw error
  }
}

// Re-export key functions for convenience
export {
  find_claude_project_files,
  parse_claude_jsonl_file,
  parse_all_claude_files,
  get_session_summary,
  normalize_claude_session,
  normalize_claude_sessions,
  create_thread_from_claude_session,
  create_threads_from_claude_sessions,
  validate_claude_session,
  filter_valid_claude_sessions
}
