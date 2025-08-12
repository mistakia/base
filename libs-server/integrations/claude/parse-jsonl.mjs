// import fs from 'fs/promises'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import path from 'path'
import { list_files_recursive } from '#libs-server/repository/filesystem/list-files-recursive.mjs'
import debug from 'debug'
import { CLAUDE_DEFAULT_PATHS } from './claude-config.mjs'

const log = debug('integrations:claude:parse-jsonl')

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

    log(`Found ${files.length} Claude project files`)
    return files.map((file) => ({
      file_path: file,
      base_name: path.basename(file, '.jsonl')
    }))
  } catch (error) {
    log(`Error finding Claude project files: ${error.message}`)
    throw error
  }
}

export const parse_claude_jsonl_file = async (file_path) => {
  try {
    log(`Parsing Claude JSONL file: ${file_path}`)

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
    const files = await find_claude_project_files({ claude_projects_directory })
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
