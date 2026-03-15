/**
 * Shared output formatting for unified base CLI
 *
 * Provides consistent formatting across all subcommands with tab-separated
 * default output (optimized for agents), verbose multi-line, and JSON modes.
 */

import config from '#config'

// Derive SERVER_URL from config to work across machines and containers.
// Uses 127.0.0.1 (not localhost) to avoid Node 18+ IPv6 resolution issues.
// Inside Docker, BASE_API_HOST is set per-machine in compose overrides
// (host.docker.internal on MacBook, 127.0.0.1 on storage server).
const server_host = process.env.BASE_API_HOST || '127.0.0.1'
const server_port = config.server_port || 8080
const server_protocol = config.ssl ? 'https' : 'http'
export const SERVER_URL = `${server_protocol}://${server_host}:${server_port}`

/**
 * Exit the process after flushing stdout.
 *
 * process.exit() does not wait for stdout to drain when output is piped,
 * which truncates output captured by child_process.exec or similar.
 *
 * @param {number} code - Exit code
 */
export function flush_and_exit(code = 0) {
  process.stdout.write('', () => {
    process.exit(code)
  })
}

/**
 * Format entity for output
 *
 * @param {Object} entity - Entity object
 * @param {Object} options - Formatting options
 * @param {boolean} options.verbose - Multi-line output
 * @param {string[]} options.fields - Fields to include
 * @returns {string} Formatted output
 */
export function format_entity(entity, { verbose = false, fields } = {}) {
  const default_fields = ['base_uri', 'title', 'type', 'status', 'priority']
  const output_fields = fields && fields.length > 0 ? fields : default_fields

  if (verbose) {
    const lines = [entity.base_uri]
    for (const field of output_fields) {
      if (field !== 'base_uri' && entity[field] !== undefined) {
        const value = Array.isArray(entity[field])
          ? entity[field].join(', ')
          : entity[field]
        lines.push(`  ${field}: ${value}`)
      }
    }
    return lines.join('\n')
  }

  return output_fields
    .map((field) => {
      const value = entity[field]
      if (value === undefined || value === null) return ''
      if (Array.isArray(value)) return value.join(',')
      return String(value)
    })
    .join('\t')
}

/**
 * Format relation for output
 *
 * @param {Object} relation - Relation object
 * @param {Object} options - Formatting options
 * @param {boolean} options.verbose - Multi-line output
 * @returns {string} Formatted output
 */
export function format_relation(relation, { verbose = false } = {}) {
  if (verbose) {
    const lines = [relation.base_uri]
    if (relation.relation_type) {
      lines.push(`  relation_type: ${relation.relation_type}`)
    }
    if (relation.title) lines.push(`  title: ${relation.title}`)
    if (relation.type) lines.push(`  type: ${relation.type}`)
    if (relation.context) lines.push(`  context: ${relation.context}`)
    return lines.join('\n')
  }

  return [
    relation.relation_type || '',
    relation.base_uri || '',
    relation.title || '',
    relation.type || ''
  ].join('\t')
}

/**
 * Format thread with relation context for entity threads output
 *
 * @param {Object} thread - Thread object with relation context
 * @param {Object} options - Formatting options
 * @param {boolean} options.verbose - Multi-line output
 * @returns {string} Formatted output
 */
export function format_entity_thread(thread, { verbose = false } = {}) {
  if (verbose) {
    const lines = [thread.thread_id]
    if (thread.title) lines.push(`  Title: ${thread.title}`)
    if (thread.thread_state) lines.push(`  State: ${thread.thread_state}`)
    if (thread.relation_type) lines.push(`  Relation: ${thread.relation_type}`)
    if (thread.created_at) {
      const created = new Date(thread.created_at).toISOString().split('T')[0]
      lines.push(`  Created: ${created}`)
    }
    if (thread.updated_at) {
      const updated = new Date(thread.updated_at).toISOString().split('T')[0]
      lines.push(`  Updated: ${updated}`)
    }
    return lines.join('\n')
  }

  // Default tab-separated output: thread_id, state, relation_type, title
  return [
    thread.thread_id || '',
    thread.thread_state || '',
    thread.relation_type || '',
    thread.title || ''
  ].join('\t')
}

/**
 * Check if an error indicates the API server is unavailable
 *
 * @param {Error} error - Error from fetch attempt
 * @returns {boolean} True if the error indicates server is unreachable
 */
export function is_api_unavailable(error) {
  return (
    error.cause?.code === 'ECONNREFUSED' ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('fetch failed')
  )
}

/**
 * Output results with consistent formatting
 *
 * @param {Object[]} items - Array of items to output
 * @param {Object} options - Output options
 * @param {boolean} options.json - Output as JSON
 * @param {boolean} options.verbose - Verbose output
 * @param {Function} options.formatter - Item formatting function
 * @param {string} options.empty_message - Message when no results
 */
/**
 * Try API call first, fall back to local function if server is unavailable
 *
 * @param {Function} api_fn - Async function calling the HTTP API
 * @param {Function} fallback_fn - Async function using direct access
 * @returns {*} Result from whichever function succeeded
 */
export async function with_api_fallback(api_fn, fallback_fn) {
  try {
    return await api_fn()
  } catch (error) {
    if (is_api_unavailable(error)) {
      return await fallback_fn()
    }
    throw error
  }
}

/**
 * Output results with consistent formatting
 *
 * @param {Object[]} items - Array of items to output
 * @param {Object} options - Output options
 * @param {boolean} options.json - Output as JSON
 * @param {boolean} options.verbose - Verbose output
 * @param {Function} options.formatter - Item formatting function
 * @param {string} options.empty_message - Message when no results
 */
export function output_results(
  items,
  {
    json = false,
    verbose = false,
    formatter,
    empty_message = 'No results found'
  } = {}
) {
  if (!items || items.length === 0) {
    if (json) {
      console.log('[]')
    } else {
      console.log(empty_message)
    }
    return
  }

  if (json) {
    console.log(JSON.stringify(items, null, 2))
    return
  }

  for (let i = 0; i < items.length; i++) {
    console.log(formatter(items[i], { verbose }))
    if (verbose && i < items.length - 1) {
      console.log('')
    }
  }
}

/**
 * Format a duration in milliseconds to a human-readable relative string
 *
 * @param {string|Date} timestamp - ISO timestamp or Date
 * @returns {string} Relative time string (e.g., "2h ago", "3d ago")
 */
export function format_relative_time(timestamp) {
  if (!timestamp) return '-'
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff_ms = now - then
  if (diff_ms < 0) return 'future'

  const seconds = Math.floor(diff_ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/**
 * Format job for output
 *
 * @param {Object} job - Job object
 * @param {Object} options - Formatting options
 * @param {boolean} options.verbose - Multi-line output
 * @returns {string} Formatted output
 */
export function format_job(job, { verbose = false } = {}) {
  const last_ok = job.last_execution?.success
  const status = job.last_execution ? (last_ok ? 'OK' : 'FAIL') : 'NEW'
  const name = job.name || job.job_id
  const schedule = job.schedule || '-'
  const last_run = format_relative_time(job.last_execution?.timestamp)
  const total = job.stats?.total_runs ?? 0
  const fails = job.stats?.failure_count ?? 0

  if (verbose) {
    const lines = [`[${status}] ${name}`]
    if (job.name && job.name !== job.job_id) {
      lines.push(`  ID: ${job.job_id}`)
    }
    lines.push(`  Source: ${job.source}`)
    if (job.schedule) {
      lines.push(`  Schedule: ${schedule} (${job.schedule_type})`)
    }
    lines.push(`  Total runs: ${total}`)
    lines.push(`  Failures: ${fails}`)
    if (job.last_execution) {
      lines.push(`  Last run: ${last_run} (${job.last_execution.timestamp})`)
      lines.push(`  Duration: ${job.last_execution.duration_ms}ms`)
    }
    if (job.stats?.last_failure) {
      lines.push(
        `  Last failure: ${format_relative_time(job.stats.last_failure)}`
      )
    }
    return lines.join('\n')
  }

  // Tab-separated: status, name, schedule, last_run, total, fails
  return [status, name, schedule, last_run, total, fails].join('\t')
}

/**
 * Truncate text to a max length with ellipsis
 *
 * @param {string} text - Text to truncate
 * @param {number} max_length - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, max_length) {
  if (!text || text.length <= max_length) return text || ''
  return text.slice(0, max_length - 3) + '...'
}

/**
 * Extract text content from message content array or string
 *
 * @param {string|Array} content - Message content
 * @returns {string} Extracted text
 */
function extract_text_content(content) {
  if (!content) return ''
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    const text_parts = content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
    return text_parts.join('\n')
  }

  return ''
}

/**
 * Format ISO timestamp to readable date/time
 *
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted date/time
 */
function format_timestamp(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '')
}

/**
 * Format thread metadata for display
 *
 * @param {Object} thread - Thread object
 * @param {Object} options - Formatting options
 * @param {boolean} options.verbose - Multi-line output
 * @returns {string} Formatted output
 */
export function format_thread(thread, { verbose = false } = {}) {
  if (verbose) {
    const lines = [thread.thread_id]
    if (thread.title) lines.push(`  Title: ${thread.title}`)
    if (thread.thread_state) lines.push(`  State: ${thread.thread_state}`)
    if (thread.created_at) {
      lines.push(`  Created: ${format_timestamp(thread.created_at)}`)
    }
    if (thread.updated_at) {
      lines.push(`  Updated: ${format_timestamp(thread.updated_at)}`)
    }
    if (thread.message_count !== undefined) {
      lines.push(`  Messages: ${thread.message_count}`)
    }
    if (thread.timeline && thread.timeline.length > 0) {
      lines.push(`  Timeline entries: ${thread.timeline.length}`)
    }
    if (thread.relations && thread.relations.length > 0) {
      lines.push(`  Relations: ${thread.relations.length}`)
    }
    return lines.join('\n')
  }

  // Default tab-separated: thread_id, state, title
  return [
    thread.thread_id || '',
    thread.thread_state || '',
    thread.title || ''
  ].join('\t')
}

/**
 * Format thread work context (status) for display
 *
 * @param {Object} status - Status data with messages
 * @param {Object} options - Formatting options
 * @param {boolean} options.verbose - Multi-line output
 * @param {number} options.max_length - Max content length for truncation
 * @returns {string} Formatted output
 */
export function format_thread_status(
  status,
  { verbose = false, max_length = 500 } = {}
) {
  const lines = []

  // Header
  lines.push(`Thread: ${status.thread_id}`)
  if (status.title) lines.push(`Title: ${status.title}`)
  if (status.thread_state) lines.push(`State: ${status.thread_state}`)
  lines.push('')

  // Initial Request
  if (status.first_user_message) {
    const content = extract_text_content(status.first_user_message.content)
    const timestamp = format_timestamp(status.first_user_message.timestamp)
    lines.push(`Initial Request${timestamp ? ` (${timestamp})` : ''}:`)
    lines.push(`  ${truncate(content, max_length).replace(/\n/g, '\n  ')}`)
    lines.push('')
  }

  // Last User Message (if different from first)
  if (status.last_user_message) {
    const content = extract_text_content(status.last_user_message.content)
    const timestamp = format_timestamp(status.last_user_message.timestamp)
    lines.push(`Last User Message${timestamp ? ` (${timestamp})` : ''}:`)
    lines.push(`  ${truncate(content, max_length).replace(/\n/g, '\n  ')}`)
    lines.push('')
  }

  // Last Assistant Message
  if (status.last_assistant_message) {
    const content = extract_text_content(status.last_assistant_message.content)
    const timestamp = format_timestamp(status.last_assistant_message.timestamp)
    lines.push(`Last Assistant Message${timestamp ? ` (${timestamp})` : ''}:`)
    lines.push(`  ${truncate(content, max_length).replace(/\n/g, '\n  ')}`)
    lines.push('')
  }

  // Relations (if included)
  if (status.relations && status.relations.length > 0) {
    lines.push(`Relations (${status.relations.length}):`)
    for (const rel of status.relations.slice(0, verbose ? 20 : 5)) {
      lines.push(`  ${rel.relation_type || ''} ${rel.target_uri || ''}`)
    }
    if (!verbose && status.relations.length > 5) {
      lines.push(`  ... and ${status.relations.length - 5} more`)
    }
    lines.push('')
  }

  // Tool counts (if included)
  if (status.tool_counts && Object.keys(status.tool_counts).length > 0) {
    lines.push('Tool Usage:')
    const sorted = Object.entries(status.tool_counts).sort(
      (a, b) => b[1] - a[1]
    )
    for (const [tool, count] of sorted.slice(0, verbose ? 20 : 10)) {
      lines.push(`  ${tool}: ${count}`)
    }
    if (!verbose && sorted.length > 10) {
      lines.push(`  ... and ${sorted.length - 10} more`)
    }
  }

  return lines.join('\n').trimEnd()
}

/**
 * Format timeline entry for display
 *
 * @param {Object} entry - Timeline entry
 * @param {Object} options - Formatting options
 * @param {boolean} options.verbose - Multi-line output
 * @returns {string} Formatted output
 */
export function format_timeline_entry(entry, { verbose = false } = {}) {
  const timestamp = format_timestamp(entry.timestamp)
  const type = entry.type || 'unknown'

  if (verbose) {
    const lines = [timestamp]

    if (type === 'message') {
      lines.push(`  Type: message`)
      lines.push(`  Role: ${entry.role || 'unknown'}`)
      const content = extract_text_content(entry.content)
      if (content) {
        lines.push(`  Content:`)
        const content_lines = content.split('\n')
        const display_lines = content_lines.slice(0, 10)
        for (const line of display_lines) {
          lines.push(`    ${line}`)
        }
        if (content_lines.length > 10) {
          lines.push(`    ... (truncated)`)
        }
      }
    } else if (type === 'tool_call') {
      lines.push(`  Type: tool_call`)
      lines.push(`  Tool: ${entry.tool_name || 'unknown'}`)
      if (entry.tool_call_id) {
        lines.push(`  Call ID: ${entry.tool_call_id}`)
      }
    } else if (type === 'tool_result') {
      lines.push(`  Type: tool_result`)
      if (entry.tool_call_id) {
        lines.push(`  Call ID: ${entry.tool_call_id}`)
      }
      if (entry.is_error) {
        lines.push(`  Error: true`)
      }
    } else if (type === 'thinking') {
      lines.push(`  Type: thinking`)
      const content = entry.thinking || entry.content || ''
      if (content) {
        lines.push(`  Content: ${truncate(content, 200)}`)
      }
    } else {
      lines.push(`  Type: ${type}`)
    }

    return lines.join('\n')
  }

  // Default: timestamp, type/role, truncated content
  let type_role = type
  if (type === 'message' && entry.role) {
    type_role = `message:${entry.role}`
  } else if (type === 'tool_call' && entry.tool_name) {
    type_role = `tool:${entry.tool_name}`
  }

  const content = extract_text_content(entry.content)
  const truncated = truncate(content, 80).replace(/\n/g, ' ')

  return [timestamp, type_role, truncated].join('\t')
}
