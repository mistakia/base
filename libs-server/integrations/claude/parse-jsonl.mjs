import { createReadStream, existsSync } from 'fs'
import { stat as fs_stat, readdir } from 'fs/promises'
import { createInterface } from 'readline'
import path from 'path'
import debug from 'debug'

import { list_files_recursive } from '#libs-server/repository/filesystem/list-files-recursive.mjs'
import { CLAUDE_DEFAULT_PATHS } from './claude-config.mjs'
import {
  is_warm_session,
  is_agent_file_path
} from './claude-session-helpers.mjs'

const log = debug('integrations:claude:parse-jsonl')
const log_debug = debug('integrations:claude:parse-jsonl:debug')
const log_perf = debug('integrations:claude:perf')

// Max character length for progress entry data.fullOutput field.
// Claude Code logs cumulative command output on every progress tick, which can
// create entries with multi-MB fullOutput strings that repeat hundreds of times.
// Truncating to 10KB per entry prevents V8 heap exhaustion on large sessions.
const MAX_PROGRESS_FULL_OUTPUT_CHARS = 10 * 1024

export const find_claude_project_files = async ({
  claude_projects_directory = CLAUDE_DEFAULT_PATHS.claude_projects_directory,
  claude_projects_directories = null
} = {}) => {
  const dirs = claude_projects_directories || [claude_projects_directory]
  const all_files = []
  const errors = []

  for (const dir of dirs) {
    try {
      const expanded_dir = dir.replace('~', process.env.HOME)
      log(`Looking for Claude project files in ${expanded_dir}`)

      const files = await list_files_recursive({
        directory: expanded_dir,
        file_extension: '.jsonl',
        absolute_paths: true
      })

      log(`Found ${files.length} Claude project files via recursive scan`)
      all_files.push(
        ...files.map((file) => ({
          file_path: file,
          base_name: path.basename(file, '.jsonl')
        }))
      )
    } catch (error) {
      log(`Error finding Claude project files in ${dir}: ${error.message}`)
      errors.push(error)
    }
  }

  // Throw if all directories failed
  if (all_files.length === 0 && errors.length === dirs.length) {
    throw errors[0]
  }

  return all_files
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
  claude_projects_directory = CLAUDE_DEFAULT_PATHS.claude_projects_directory,
  claude_projects_directories = null
}) => {
  const dirs = claude_projects_directories || [claude_projects_directory]
  const target_filename = `${session_id}.jsonl`

  log_debug(`Searching for session file: ${target_filename}`)

  for (const dir of dirs) {
    try {
      const expanded_dir = dir.replace('~', process.env.HOME)

      const files = await list_files_recursive({
        directory: expanded_dir,
        file_extension: '.jsonl',
        absolute_paths: true
      })

      const matching_file = files.find((file) => {
        const filename = path.basename(file)
        const parent_dir = path.basename(path.dirname(file))
        return filename === target_filename && parent_dir !== 'subagents'
      })

      if (matching_file) {
        log_debug(`Found session file: ${matching_file}`)
        return matching_file
      }
    } catch (error) {
      log(`Error finding session file by ID in ${dir}: ${error.message}`)
    }
  }

  log_debug(`Session file not found for ID: ${session_id}`)
  return null
}

export const parse_claude_jsonl_file = async (file_path) => {
  try {
    const parse_start = Date.now()
    log_debug(`Parsing Claude JSONL file: ${file_path}`)

    // Stat BEFORE opening the stream so we can cap the read and report the
    // exact byte position that was consumed. Claude session files are
    // append-only while a session is live, so capping at the pre-parse size
    // means any bytes appended during the parse are deferred to the next
    // invocation rather than being half-read (which would leave byte_offset
    // beyond what was actually parsed and silently skip the gap).
    const file_stat = await fs_stat(file_path)
    const end_byte_offset = file_stat.size

    const file_stream = createReadStream(file_path, {
      end: end_byte_offset > 0 ? end_byte_offset - 1 : 0
    })
    const line_reader = createInterface({
      input: file_stream,
      crlfDelay: Infinity
    })

    let line_count = 0
    let primary_session_id = null
    const file_summaries = []

    // Extract session ID from filename (Claude uses UUID format filenames).
    // When the caller passes a non-UUID filename via --session-file (e.g. a
    // recovery run against thread/<id>/raw-data/claude-session.jsonl), the
    // real session_id is rediscovered below from the first entry's sessionId
    // field so source.session_id doesn't get clobbered with "claude-session".
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

        // Truncate progress entry fullOutput to avoid V8 heap exhaustion.
        // Claude Code logs cumulative command output on every progress tick,
        // creating multi-MB strings repeated hundreds of times in a session.
        if (
          entry.type === 'progress' &&
          entry.data?.fullOutput?.length > MAX_PROGRESS_FULL_OUTPUT_CHARS
        ) {
          entry.data.fullOutput =
            entry.data.fullOutput.slice(0, MAX_PROGRESS_FULL_OUTPUT_CHARS) +
            '\n... [truncated]'
        }

        // Collect summary entries for metadata
        if (entry.type === 'summary') {
          file_summaries.push(entry.summary)
          continue
        }

        // Mutate in place instead of spread-copy to avoid doubling memory
        // for large session files (e.g. 1.7GB subagent sessions)
        entry.line_number = entry.line_number || line_count
        entry.parse_line_number = line_count
        all_entries.push(entry)
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
      end_byte_offset,
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

    // Recover the real session UUID from the first entry when the filename
    // basename is not itself a UUID (recovery imports from raw-data/*.jsonl).
    const uuid_re =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid_re.test(primary_session_id)) {
      const first_with_session = all_entries.find(
        (e) => typeof e?.sessionId === 'string' && uuid_re.test(e.sessionId)
      )
      if (first_with_session) {
        log_debug(
          `Rewriting non-UUID session_id ${primary_session_id} -> ${first_with_session.sessionId} from entry sessionId`
        )
        primary_session_id = first_with_session.sessionId
        session.session_id = primary_session_id
      }
    }

    // Sort entries by parse line number to preserve original file order
    session.entries.sort((a, b) => {
      return (a.parse_line_number || 0) - (b.parse_line_number || 0)
    })

    const parse_ms = Date.now() - parse_start
    log(
      `Parsed ${line_count} lines into 1 session (${primary_session_id}) with ${session.entries.length} entries from ${path.basename(file_path)}`
    )
    log_perf(
      'parse_jsonl file=%s entries=%d lines=%d duration_ms=%d',
      path.basename(file_path),
      session.entries.length,
      line_count,
      parse_ms
    )

    return [session]
  } catch (error) {
    log(`Error parsing Claude JSONL file ${file_path}: ${error.message}`)
    throw error
  }
}

export const parse_all_claude_files = async ({
  claude_projects_directory = CLAUDE_DEFAULT_PATHS.claude_projects_directory,
  claude_projects_directories = null,
  filter_sessions = null
} = {}) => {
  try {
    const start_time = Date.now()
    const files = await find_claude_project_files({
      claude_projects_directory,
      claude_projects_directories
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
    const total_start = Date.now()

    // Parse the main session
    const parent_sessions = await parse_claude_jsonl_file(session_file)

    // Find and parse subagent sessions
    const subagent_files = await find_subagent_session_files({
      parent_session_file: session_file
    })

    const all_sessions = [...parent_sessions]
    const subagent_start = Date.now()

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
      const subagent_ms = Date.now() - subagent_start
      log(
        `Loaded session ${path.basename(session_file)} with ${subagent_files.length} subagent sessions`
      )
      log_perf(
        'parse_subagents file=%s subagent_count=%d subagent_parse_ms=%d',
        path.basename(session_file),
        subagent_files.length,
        subagent_ms
      )
    }

    const total_ms = Date.now() - total_start
    log_perf(
      'parse_session_with_subagents file=%s total_sessions=%d total_ms=%d',
      path.basename(session_file),
      all_sessions.length,
      total_ms
    )

    return all_sessions
  } catch (error) {
    log(`Error parsing session with subagents: ${error.message}`)
    throw error
  }
}

/**
 * Stream Claude sessions one at a time with agent merging.
 * Uses pre-built agent relationship index for efficient streaming.
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.agent_index - Agent relationship index from scan_claude_agent_relationships()
 *   - parent_to_agent_files: Map<parent_session_id, Array<{file_path, agent_id}>>
 *   - agent_session_ids: Set<session_id>
 *   - parent_session_files: Map<session_id, file_path>
 * @param {Function} params.filter_session - Optional filter function (session) => boolean
 * @param {boolean} params.include_warm_agents - Include warm agents (default: false)
 * @yields {Object} Session object with merged agent sessions
 */
export async function* stream_claude_sessions({
  agent_index,
  filter_session = null,
  include_warm_agents = false,
  from_date = null,
  to_date = null
}) {
  if (
    !agent_index?.parent_session_files ||
    !agent_index?.parent_to_agent_files
  ) {
    throw new Error(
      'agent_index with parent_session_files and parent_to_agent_files is required for streaming'
    )
  }

  const { parent_to_agent_files, parent_session_files } = agent_index

  log(`Streaming ${parent_session_files.size} parent sessions`)

  let yielded_count = 0
  let skipped_count = 0

  for (const [session_id, file_path] of parent_session_files) {
    try {
      // Early date filtering: check file timestamp before full parse
      if (from_date || to_date) {
        const file_timestamp = await get_session_file_timestamp({ file_path })
        if (file_timestamp) {
          const ts = new Date(file_timestamp)
          if (from_date && ts < new Date(from_date)) {
            skipped_count++
            continue
          }
          if (to_date && ts > new Date(to_date + 'T23:59:59')) {
            skipped_count++
            continue
          }
        }
      }

      // Parse the parent session
      const sessions = await parse_claude_jsonl_file(file_path)
      if (sessions.length === 0) {
        skipped_count++
        continue
      }

      const parent_session = sessions[0]
      parent_session.parse_mode = 'full'

      // Apply filter if provided
      if (filter_session && !filter_session(parent_session)) {
        skipped_count++
        continue
      }

      // Check for and merge agent sessions
      const agent_files = parent_to_agent_files.get(session_id) || []
      const agent_sessions = []

      for (const { file_path: agent_file_path } of agent_files) {
        try {
          const agent_session_list =
            await parse_claude_jsonl_file(agent_file_path)
          if (agent_session_list.length > 0) {
            const agent_session = agent_session_list[0]
            agent_session.parse_mode = 'full'

            // Skip warm agents unless explicitly included
            if (
              !include_warm_agents &&
              is_warm_session({ session: agent_session })
            ) {
              log_debug(`Skipping warm agent: ${agent_session.session_id}`)
              continue
            }

            agent_sessions.push(agent_session)
          }
        } catch (error) {
          log(`Failed to parse agent file ${agent_file_path}: ${error.message}`)
        }
      }

      // Attach agent sessions to parent
      if (agent_sessions.length > 0) {
        parent_session.agent_sessions = agent_sessions
        log_debug(
          `Merged ${agent_sessions.length} agents with session ${session_id}`
        )
      }

      yielded_count++
      yield parent_session
    } catch (error) {
      log(`Failed to parse session file ${file_path}: ${error.message}`)
      skipped_count++
    }
  }

  log(
    `Streaming complete: ${yielded_count} sessions yielded, ${skipped_count} skipped`
  )
}

/**
 * Extract minimal metadata from a Claude session file without parsing full content.
 * Reads only the first few lines to extract agent relationship information.
 *
 * @param {Object} params - Parameters object
 * @param {string} params.file_path - Path to JSONL session file
 * @param {number} params.max_lines - Maximum lines to read (default: 5)
 * @returns {Promise<Object>} Metadata object with session_id, is_agent, parent_session_id, agent_id
 */
export const extract_claude_session_metadata = async ({
  file_path,
  max_lines = 5
}) => {
  const session_id = path.basename(file_path, '.jsonl')

  const metadata = {
    session_id,
    file_path,
    is_agent: is_agent_file_path(file_path),
    parent_session_id: null,
    agent_id: null
  }

  // If agent by path, extract agent_id from filename
  if (session_id.startsWith('agent-')) {
    metadata.agent_id = session_id.replace('agent-', '')
  }

  // Read first few lines to extract additional metadata
  const file_stream = createReadStream(file_path)
  const line_reader = createInterface({
    input: file_stream,
    crlfDelay: Infinity
  })

  let lines_read = 0

  try {
    for await (const line of line_reader) {
      if (line.trim() === '') continue

      lines_read++
      if (lines_read > max_lines) break

      try {
        const entry = JSON.parse(line)

        // Check for agentId field (indicates this is an agent session)
        if (entry.agentId && !metadata.agent_id) {
          metadata.agent_id = entry.agentId
          metadata.is_agent = true
        }

        // Check for sessionId field (points to parent session)
        // Only counts as agent if sessionId is DIFFERENT from this session's own ID
        if (entry.sessionId && !metadata.parent_session_id) {
          if (entry.sessionId !== session_id) {
            metadata.parent_session_id = entry.sessionId
            metadata.is_agent = true
          }
        }

        // Early exit if we have all agent info
        if (
          metadata.is_agent &&
          metadata.parent_session_id &&
          metadata.agent_id
        ) {
          break
        }
      } catch {
        // Skip unparseable lines
      }
    }
  } finally {
    // Clean up: destroy stream to stop reading
    file_stream.destroy()
    line_reader.close()
  }

  return metadata
}

/**
 * Extract the earliest entry timestamp from a Claude session file
 * without fully parsing it. Reads only the first few lines to find
 * a non-summary/non-snapshot entry with a timestamp.
 *
 * @param {Object} params - Parameters object
 * @param {string} params.file_path - Path to JSONL session file
 * @param {number} params.max_lines - Maximum lines to read (default: 10)
 * @returns {Promise<string|null>} ISO timestamp string or null if not found
 */
export const get_session_file_timestamp = async ({
  file_path,
  max_lines = 10
}) => {
  const file_stream = createReadStream(file_path)
  const line_reader = createInterface({
    input: file_stream,
    crlfDelay: Infinity
  })

  let lines_read = 0
  let earliest_timestamp = null

  try {
    for await (const line of line_reader) {
      if (line.trim() === '') continue

      lines_read++
      if (lines_read > max_lines) break

      try {
        const entry = JSON.parse(line)

        // Skip summary and snapshot entries -- they don't represent session timing
        if (entry.type === 'summary' || entry.type === 'snapshot') {
          continue
        }

        if (entry.timestamp) {
          earliest_timestamp = entry.timestamp
          break
        }
      } catch {
        // Skip unparseable lines
      }
    }
  } finally {
    file_stream.destroy()
    line_reader.close()
  }

  return earliest_timestamp
}

/**
 * Parse only new bytes appended to a Claude JSONL file since the given byte offset.
 * Uses the same stat.size pattern as read_timeline_jsonl_from_offset in timeline-jsonl.mjs.
 *
 * @param {Object} params - Parameters object
 * @param {string} params.file_path - Path to JSONL session file
 * @param {number} params.byte_offset - Byte position to start reading from
 * @returns {Promise<{entries: Array, new_byte_offset: number, summaries: Array}|null>}
 *   Object with new entries, updated offset, and summaries, or null if file was replaced
 */
export const parse_claude_jsonl_from_offset = async ({
  file_path,
  byte_offset
}) => {
  const parse_start = Date.now()

  let stat
  try {
    stat = await fs_stat(file_path)
  } catch {
    log(`File not found for offset read: ${file_path}`)
    return null
  }

  // File was replaced (smaller than expected offset)
  if (stat.size < byte_offset) {
    log(
      `File replaced (size=${stat.size} < offset=${byte_offset}): ${file_path}`
    )
    return null
  }

  // No new data
  if (stat.size === byte_offset) {
    log_perf(
      'parse_jsonl_from_offset file=%s no_new_data offset=%d',
      path.basename(file_path),
      byte_offset
    )
    return { entries: [], new_byte_offset: byte_offset, summaries: [] }
  }

  // Cap at stat.size to avoid reading bytes appended after the stat call.
  // Matches the pattern in read_timeline_jsonl_from_offset (timeline-jsonl.mjs).
  const file_stream = createReadStream(file_path, {
    start: byte_offset,
    end: stat.size - 1
  })
  const line_reader = createInterface({
    input: file_stream,
    crlfDelay: Infinity
  })

  const entries = []
  const summaries = []
  let line_count = 0

  try {
    for await (const line of line_reader) {
      line_count++

      if (line.trim() === '') {
        continue
      }

      try {
        const entry = JSON.parse(line)

        // Apply same truncation as full parser
        if (
          entry.type === 'progress' &&
          entry.data?.fullOutput?.length > MAX_PROGRESS_FULL_OUTPUT_CHARS
        ) {
          entry.data.fullOutput =
            entry.data.fullOutput.slice(0, MAX_PROGRESS_FULL_OUTPUT_CHARS) +
            '\n... [truncated]'
        }

        if (entry.type === 'summary') {
          summaries.push(entry.summary)
          continue
        }

        entry.line_number = entry.line_number || line_count
        entry.parse_line_number = line_count
        entries.push(entry)
      } catch (parse_error) {
        log(
          `Error parsing line at offset ${byte_offset} + ${line_count} in ${file_path}: ${parse_error.message}`
        )
      }
    }
  } finally {
    file_stream.destroy()
    line_reader.close()
  }

  const parse_ms = Date.now() - parse_start
  log_perf(
    'parse_jsonl_from_offset file=%s entries=%d new_bytes=%d offset=%d->%d duration_ms=%d',
    path.basename(file_path),
    entries.length,
    stat.size - byte_offset,
    byte_offset,
    stat.size,
    parse_ms
  )

  return { entries, new_byte_offset: stat.size, summaries }
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
