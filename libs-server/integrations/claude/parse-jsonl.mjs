// import fs from 'fs/promises'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import path from 'path'
import { list_files_recursive } from '#libs-server/repository/filesystem/list-files-recursive.mjs'
import debug from 'debug'

const log = debug('integrations:claude:parse-jsonl')

export const find_claude_project_files = async ({ projects_dir = '~/.claude/projects' } = {}) => {
  try {
    const expanded_dir = projects_dir.replace('~', process.env.HOME)
    log(`Looking for Claude project files in ${expanded_dir}`)

    const files = await list_files_recursive({
      directory: expanded_dir,
      file_extension: '.jsonl',
      absolute_paths: true
    })

    log(`Found ${files.length} Claude project files`)
    return files.map(file => ({
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

    const sessions = new Map()
    let line_count = 0

    for await (const line of line_reader) {
      line_count++

      if (line.trim() === '') {
        continue
      }

      try {
        const entry = JSON.parse(line)

        // Handle summary entries differently - they don't belong to a specific session
        if (entry.type === 'summary') {
          // Store summaries separately - we'll associate them with sessions later
          const summary_session_id = 'summaries'
          if (!sessions.has(summary_session_id)) {
            sessions.set(summary_session_id, {
              session_id: summary_session_id,
              entries: [],
              metadata: {
                file_path,
                type: 'summaries'
              }
            })
          }
          sessions.get(summary_session_id).entries.push({
            ...entry,
            line_number: line_count
          })
          continue
        }

        // Group entries by sessionId - skip entries without sessionId
        const session_id = entry.sessionId
        if (!session_id) {
          log(`Warning: Entry on line ${line_count} has no sessionId, skipping`)
          continue
        }

        if (!sessions.has(session_id)) {
          sessions.set(session_id, {
            session_id,
            entries: [],
            metadata: {
              cwd: entry.cwd,
              version: entry.version,
              user_type: entry.userType,
              file_path
            }
          })
        }

        sessions.get(session_id).entries.push({
          ...entry,
          line_number: line_count
        })
      } catch (parse_error) {
        log(`Error parsing line ${line_count} in ${file_path}: ${parse_error.message}`)
        // Continue processing other lines instead of failing completely
      }
    }

    const session_list = Array.from(sessions.values())
    log(`Parsed ${line_count} lines into ${session_list.length} sessions from ${path.basename(file_path)}`)

    // Extract summaries and associate them with sessions
    const summaries_session = sessions.get('summaries')
    const file_summaries = summaries_session ? summaries_session.entries.map(e => e.summary) : []

    // Remove the summaries session from the main list
    const actual_sessions = session_list.filter(session => session.session_id !== 'summaries')

    // Sort entries within each session by timestamp and add file summaries
    actual_sessions.forEach(session => {
      // Add file summaries to session metadata
      session.metadata.file_summaries = file_summaries

      // Sort entries by timestamp
      session.entries.sort((a, b) => {
        const timestamp_a = new Date(a.timestamp)
        const timestamp_b = new Date(b.timestamp)
        return timestamp_a.getTime() - timestamp_b.getTime()
      })
    })

    return actual_sessions
  } catch (error) {
    log(`Error parsing Claude JSONL file ${file_path}: ${error.message}`)
    throw error
  }
}

export const parse_all_claude_files = async ({ projects_dir = '~/.claude/projects', filter_sessions = null } = {}) => {
  try {
    const files = await find_claude_project_files({ projects_dir })
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

    log(`Parsed ${all_sessions.length} total sessions from ${files.length} files`)

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
  const summaries = entries.filter(entry => entry.type === 'summary')

  // Count different entry types
  const type_counts = entries.reduce((counts, entry) => {
    counts[entry.type] = (counts[entry.type] || 0) + 1
    return counts
  }, {})

  // Get time range
  const timestamps = entries.map(entry => new Date(entry.timestamp)).filter(date => !isNaN(date))
  const start_time = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null
  const end_time = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null

  return {
    session_id: session.session_id,
    entry_count: entries.length,
    type_counts,
    summaries: summaries.map(s => s.summary),
    start_time,
    end_time,
    duration_minutes: start_time && end_time ? (end_time - start_time) / (1000 * 60) : null,
    working_directory: metadata.cwd,
    claude_version: metadata.version,
    file_source: path.basename(metadata.file_path)
  }
}
