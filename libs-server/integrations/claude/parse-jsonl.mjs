// import fs from 'fs/promises'
import { createReadStream, existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { createInterface } from 'readline'
import path from 'path'
import { list_files_recursive } from '#libs-server/repository/filesystem/list-files-recursive.mjs'
import debug from 'debug'
import { CLAUDE_DEFAULT_PATHS } from './claude-config.mjs'

const log = debug('integrations:claude:parse-jsonl')
const log_debug = debug('integrations:claude:parse-jsonl:debug')

export const find_claude_project_files = async ({
  claude_projects_directory = CLAUDE_DEFAULT_PATHS.claude_projects_directory
} = {}) => {
  try {
    const expanded_dir = claude_projects_directory.replace(
      '~',
      process.env.HOME
    )
    log(`Looking for Claude project files in ${expanded_dir}`)

    const files = await list_files_recursive({
      directory: expanded_dir,
      file_extension: '.jsonl',
      absolute_paths: true
    })

    log(`Found ${files.length} Claude project files via recursive scan`)
    return files.map((file) => ({
      file_path: file,
      base_name: path.basename(file, '.jsonl')
    }))
  } catch (error) {
    log(`Error finding Claude project files: ${error.message}`)
    throw error
  }
}

/**
 * Find a specific session file by session ID
 * Searches for <session-id>.jsonl in the projects directory
 *
 * @param {Object} params - Parameters object
 * @param {string} params.session_id - Session ID (UUID format)
 * @param {string} params.claude_projects_directory - Projects directory path
 * @returns {Promise<string|null>} Path to session file or null if not found
 */
export const find_session_file_by_id = async ({
  session_id,
  claude_projects_directory = CLAUDE_DEFAULT_PATHS.claude_projects_directory
}) => {
  try {
    const expanded_dir = claude_projects_directory.replace(
      '~',
      process.env.HOME
    )
    const target_filename = `${session_id}.jsonl`

    log_debug(`Searching for session file: ${target_filename}`)

    // Search for the specific file
    const files = await list_files_recursive({
      directory: expanded_dir,
      file_extension: '.jsonl',
      absolute_paths: true
    })

    // Find matching file (exact match on filename, not in subagents directory)
    const matching_file = files.find((file) => {
      const filename = path.basename(file)
      const parent_dir = path.basename(path.dirname(file))
      // Exclude files in subagents directories
      return filename === target_filename && parent_dir !== 'subagents'
    })

    if (matching_file) {
      log_debug(`Found session file: ${matching_file}`)
      return matching_file
    }

    log_debug(`Session file not found for ID: ${session_id}`)
    return null
  } catch (error) {
    log(`Error finding session file by ID: ${error.message}`)
    return null
  }
}

export const parse_claude_jsonl_file = async (file_path) => {
  try {
    log_debug(`Parsing Claude JSONL file: ${file_path}`)

    const file_stream = createReadStream(file_path)
    const line_reader = createInterface({
      input: file_stream,
      crlfDelay: Infinity
    })

    let line_count = 0
    let primary_session_id = null
    const file_summaries = []

    // Extract session ID from filename (Claude uses UUID format filenames)
    primary_session_id = path.basename(file_path, '.jsonl')

    // Collect all entries from the file
    const all_entries = []
    for await (const line of line_reader) {
      line_count++

      if (line.trim() === '') {
        continue
      }

      try {
        const entry = JSON.parse(line)

        // Collect summary entries for metadata
        if (entry.type === 'summary') {
          file_summaries.push(entry.summary)
          continue
        }

        all_entries.push({
          ...entry,
          line_number: entry.line_number || line_count,
          parse_line_number: line_count
        })
      } catch (parse_error) {
        log(
          `Error parsing line ${line_count} in ${file_path}: ${parse_error.message}`
        )
        // Continue processing other lines instead of failing completely
      }
    }

    // Create single session with primary session ID containing all entries
    const session = {
      session_id: primary_session_id,
      entries: all_entries,
      metadata: {
        file_path,
        file_summaries
      }
    }

    // Extract metadata from entries
    all_entries.forEach((entry) => {
      if (!session.metadata.cwd && entry.cwd) {
        session.metadata.cwd = entry.cwd
      }
      if (!session.metadata.version && entry.version) {
        session.metadata.version = entry.version
      }
      if (!session.metadata.user_type && entry.userType) {
        session.metadata.user_type = entry.userType
      }
    })

    // Sort entries by parse line number to preserve original file order
    session.entries.sort((a, b) => {
      return (a.parse_line_number || 0) - (b.parse_line_number || 0)
    })

    log(
      `Parsed ${line_count} lines into 1 session (${primary_session_id}) with ${session.entries.length} entries from ${path.basename(file_path)}`
    )

    return [session]
  } catch (error) {
    log(`Error parsing Claude JSONL file ${file_path}: ${error.message}`)
    throw error
  }
}

export const parse_all_claude_files = async ({
  claude_projects_directory = CLAUDE_DEFAULT_PATHS.claude_projects_directory,
  filter_sessions = null
} = {}) => {
  try {
    const start_time = Date.now()
    const files = await find_claude_project_files({
      claude_projects_directory
    })

    log(
      `Performance: Found files in ${Date.now() - start_time}ms (recursive scan mode)`
    )

    const all_sessions = []

    for (const { file_path } of files) {
      try {
        const sessions = await parse_claude_jsonl_file(file_path)
        all_sessions.push(...sessions)
      } catch (error) {
        log(`Failed to parse file ${file_path}: ${error.message}`)
        // Continue with other files
      }
    }

    log(
      `Parsed ${all_sessions.length} total sessions from ${files.length} files`
    )

    // Apply filtering if provided
    if (filter_sessions) {
      const filtered_sessions = all_sessions.filter(filter_sessions)
      log(`Filtered to ${filtered_sessions.length} sessions`)
      return filtered_sessions
    }

    return all_sessions
  } catch (error) {
    log(`Error parsing all Claude files: ${error.message}`)
    throw error
  }
}

/**
 * Find subagent session files for a parent session
 *
 * Subagent sessions are stored in:
 * <projects-dir>/<parent-session-id>/subagents/agent-<agentId>.jsonl
 *
 * @param {Object} params - Parameters object
 * @param {string} params.parent_session_file - Path to parent session JSONL file
 * @returns {Promise<Array>} Array of subagent session file paths
 */
export const find_subagent_session_files = async ({ parent_session_file }) => {
  try {
    const parent_dir = path.dirname(parent_session_file)
    const session_id = path.basename(parent_session_file, '.jsonl')

    // Check for subagents directory: <parent-dir>/<session-id>/subagents/
    const subagents_dir = path.join(parent_dir, session_id, 'subagents')

    if (!existsSync(subagents_dir)) {
      log_debug(`No subagents directory found at ${subagents_dir}`)
      return []
    }

    // List agent-*.jsonl files in subagents directory
    const files = await readdir(subagents_dir)
    const agent_files = files
      .filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))
      .map((f) => path.join(subagents_dir, f))

    log_debug(
      `Found ${agent_files.length} subagent files for session ${session_id}`
    )

    return agent_files
  } catch (error) {
    log(`Error finding subagent files: ${error.message}`)
    return []
  }
}

/**
 * Parse a session file and its associated subagent sessions
 *
 * @param {string} session_file - Path to parent session JSONL file
 * @returns {Promise<Array>} Array of sessions (parent + subagents)
 */
export const parse_session_with_subagents = async (session_file) => {
  try {
    // Parse the main session
    const parent_sessions = await parse_claude_jsonl_file(session_file)

    // Find and parse subagent sessions
    const subagent_files = await find_subagent_session_files({
      parent_session_file: session_file
    })

    const all_sessions = [...parent_sessions]

    for (const agent_file of subagent_files) {
      try {
        const agent_sessions = await parse_claude_jsonl_file(agent_file)
        all_sessions.push(...agent_sessions)
        log_debug(`Loaded subagent session from ${path.basename(agent_file)}`)
      } catch (error) {
        log(`Failed to parse subagent file ${agent_file}: ${error.message}`)
      }
    }

    if (subagent_files.length > 0) {
      log(
        `Loaded session ${path.basename(session_file)} with ${subagent_files.length} subagent sessions`
      )
    }

    return all_sessions
  } catch (error) {
    log(`Error parsing session with subagents: ${error.message}`)
    throw error
  }
}

export const get_session_summary = (session) => {
  const { entries, metadata } = session

  // Find summary entries
  const summaries = entries.filter((entry) => entry.type === 'summary')

  // Count different entry types
  const type_counts = entries.reduce((counts, entry) => {
    counts[entry.type] = (counts[entry.type] || 0) + 1
    return counts
  }, {})

  // Get time range
  const timestamps = entries
    .map((entry) => new Date(entry.timestamp))
    .filter((date) => !isNaN(date))
  const start_time =
    timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null
  const end_time =
    timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null

  return {
    session_id: session.session_id,
    entry_count: entries.length,
    type_counts,
    summaries: summaries.map((s) => s.summary),
    start_time,
    end_time,
    duration_minutes:
      start_time && end_time ? (end_time - start_time) / (1000 * 60) : null,
    working_directory: metadata.cwd,
    claude_version: metadata.version,
    file_source: path.basename(metadata.file_path)
  }
}
