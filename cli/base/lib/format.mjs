/**
 * Shared output formatting for unified base CLI
 *
 * Provides consistent formatting across all subcommands with tab-separated
 * default output (optimized for agents), verbose multi-line, and JSON modes.
 */

export const SERVER_URL = 'http://localhost:8080'

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
