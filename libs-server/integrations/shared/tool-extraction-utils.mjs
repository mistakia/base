/**
 * Shared Tool Extraction Utilities
 *
 * This module provides common functionality for extracting tool interactions from
 * session messages and creating separate timeline entries for tool calls and results.
 *
 * Problem Solved:
 * Previously, tool interactions were embedded as content blocks within messages,
 * violating the thread-timeline-schema.json and preventing proper tool tracking.
 * This module enables separation of tool interactions into dedicated timeline entries
 * while maintaining backward compatibility.
 *
 * Architecture:
 * - Tool calls become separate 'tool_call' timeline entries
 * - Tool results become separate 'tool_result' timeline entries
 * - Parent-child relationships maintain message context
 * - Original message content is filtered to remove tool blocks
 * - Full schema compliance with thread-timeline-schema.json
 */

import debug from 'debug'

const log = debug('integrations:shared:tool-extraction')

/**
 * Creates a schema-compliant tool_call timeline entry
 *
 * @param {Object} config - Tool call configuration
 * @param {string} config.parent_id - ID of the parent message/entry
 * @param {string} config.tool_name - Name of the tool being called
 * @param {Object} config.tool_parameters - Parameters passed to the tool
 * @param {string} config.tool_call_id - Unique identifier for this tool call
 * @param {string} config.timestamp - ISO timestamp (defaults to now)
 * @param {Object} config.provider_data - Provider-specific metadata
 * @param {number} config.sequence_index - Sequential position in content
 * @returns {Object|null} Tool call timeline entry or null if invalid
 */
export const create_tool_call_entry = ({
  parent_id,
  tool_name,
  tool_parameters,
  tool_call_id,
  timestamp,
  provider_data,
  block_index,
  line_number,
  source_uuid = ''
}) => {
  if (!parent_id || !tool_name || !tool_call_id) {
    log('Missing required parameters for tool call entry:', {
      parent_id,
      tool_name,
      tool_call_id
    })
    return null
  }
  if (block_index == null) {
    throw new Error('create_tool_call_entry: block_index required')
  }
  if (line_number == null) {
    throw new Error('create_tool_call_entry: line_number required')
  }
  if (!timestamp) {
    throw new Error('create_tool_call_entry: timestamp required')
  }

  const entry_id = `${parent_id}-tool-call-${block_index}`

  const entry = {
    id: entry_id,
    timestamp,
    type: 'tool_call',
    content: {
      tool_name,
      tool_parameters: tool_parameters || {},
      tool_call_id,
      execution_status: 'pending'
    },
    provider_data: provider_data || {},
    ordering: {
      sequence: line_number * 10000 + block_index,
      source_uuid,
      parent_id
    }
  }

  log('Created tool call entry:', {
    id: entry.id,
    tool_name,
    tool_call_id,
    parent_id
  })

  return entry
}

/**
 * Creates a schema-compliant tool_result timeline entry
 *
 * @param {Object} config - Tool result configuration
 * @param {string} config.tool_call_id - ID of the corresponding tool call
 * @param {*} config.result - Result data from tool execution (any type)
 * @param {Object} config.error - Error information if execution failed
 * @param {string} config.timestamp - ISO timestamp (defaults to now)
 * @param {Object} config.provider_data - Provider-specific metadata
 * @param {number} config.sequence_index - Sequential position in content
 * @returns {Object|null} Tool result timeline entry or null if invalid
 */
export const create_tool_result_entry = ({
  tool_call_id,
  result,
  error,
  timestamp,
  provider_data,
  block_index,
  line_number,
  source_uuid = ''
}) => {
  if (!tool_call_id) {
    log('Missing required tool_call_id for tool result entry')
    return null
  }
  if (block_index == null) {
    throw new Error('create_tool_result_entry: block_index required')
  }
  if (line_number == null) {
    throw new Error('create_tool_result_entry: line_number required')
  }
  if (!timestamp) {
    throw new Error('create_tool_result_entry: timestamp required')
  }

  const entry_id = `${tool_call_id}-result-${block_index}`

  const content = {
    tool_call_id,
    result: result !== undefined ? result : null
  }

  if (error) {
    content.error = error
  }

  const entry = {
    id: entry_id,
    timestamp,
    type: 'tool_result',
    content,
    provider_data: provider_data || {},
    ordering: {
      sequence: line_number * 10000 + block_index,
      source_uuid,
      parent_id: null
    }
  }

  log('Created tool result entry:', {
    id: entry.id,
    tool_call_id,
    has_result: result !== undefined,
    has_error: !!error
  })

  return entry
}

export const link_tool_call_to_result = (
  tool_call_entry,
  tool_result_entry
) => {
  if (!tool_call_entry || !tool_result_entry) {
    log('Cannot link tool call to result: missing entries')
    return false
  }

  const tool_call_id = tool_call_entry.content?.tool_call_id
  const result_call_id = tool_result_entry.content?.tool_call_id

  if (!tool_call_id || !result_call_id || tool_call_id !== result_call_id) {
    log('Cannot link tool call to result: ID mismatch', {
      tool_call_id,
      result_call_id
    })
    return false
  }

  // Update tool call status
  if (tool_call_entry.content) {
    tool_call_entry.content.execution_status = tool_result_entry.content?.error
      ? 'failed'
      : 'completed'
  }

  log('Successfully linked tool call to result:', {
    tool_call_id,
    status: tool_call_entry.content?.execution_status
  })

  return true
}

export const validate_tool_call_entry = (entry) => {
  const errors = []

  if (!entry || typeof entry !== 'object') {
    errors.push('Entry must be an object')
    return errors
  }

  // Required fields from schema
  if (!entry.id) errors.push('Missing required field: id')
  if (!entry.timestamp) errors.push('Missing required field: timestamp')
  if (entry.type !== 'tool_call') errors.push('Type must be "tool_call"')

  // Content validation
  if (!entry.content) {
    errors.push('Missing required field: content')
  } else {
    if (!entry.content.tool_name)
      errors.push('Missing required field: content.tool_name')
    if (!entry.content.tool_parameters)
      errors.push('Missing required field: content.tool_parameters')
    if (!entry.content.tool_call_id)
      errors.push('Missing required field: content.tool_call_id')
  }

  return errors
}

export const validate_tool_result_entry = (entry) => {
  const errors = []

  if (!entry || typeof entry !== 'object') {
    errors.push('Entry must be an object')
    return errors
  }

  // Required fields from schema
  if (!entry.id) errors.push('Missing required field: id')
  if (!entry.timestamp) errors.push('Missing required field: timestamp')
  if (entry.type !== 'tool_result') errors.push('Type must be "tool_result"')

  // Content validation
  if (!entry.content) {
    errors.push('Missing required field: content')
  } else {
    if (!entry.content.tool_call_id)
      errors.push('Missing required field: content.tool_call_id')
    if (entry.content.result === undefined && !entry.content.error) {
      errors.push('Must have either result or error in content')
    }
  }

  return errors
}

export const extract_tool_interactions = (
  content_array,
  parent_entry,
  provider_config
) => {
  if (!Array.isArray(content_array) || !parent_entry || !provider_config) {
    log('Invalid parameters for tool interaction extraction')
    return {
      tool_calls: [],
      tool_results: [],
      filtered_content: content_array || []
    }
  }

  const tool_calls = []
  const tool_results = []
  const filtered_content = []

  content_array.forEach((content_item, index) => {
    const should_extract =
      provider_config.shouldExtractAsTool?.(content_item) || false

    if (should_extract) {
      const tool_data = provider_config.extractToolData(
        content_item,
        parent_entry,
        index
      )

      if (tool_data.type === 'tool_call') {
        const tool_call_entry = create_tool_call_entry({
          parent_id: parent_entry.id || parent_entry.uuid,
          tool_name: tool_data.tool_name,
          tool_parameters: tool_data.tool_parameters,
          tool_call_id: tool_data.tool_call_id,
          timestamp: parent_entry.timestamp,
          provider_data: {
            ...parent_entry.provider_data,
            content_block_index: index,
            is_extracted_tool: true
          },
          block_index: index,
          line_number: parent_entry.line_number ?? parent_entry.provider_data?.line_number ?? 0,
          source_uuid: parent_entry.uuid || parent_entry.id || ''
        })

        if (tool_call_entry) {
          tool_calls.push(tool_call_entry)

          // Replace with text summary in content array
          const summary_text =
            provider_config.createToolSummary?.(tool_data) ||
            `Tool: ${tool_data.tool_name}`

          filtered_content.push({
            type: 'text',
            content: summary_text
          })
        }
      } else if (tool_data.type === 'tool_result') {
        const tool_result_entry = create_tool_result_entry({
          tool_call_id: tool_data.tool_call_id,
          result: tool_data.result,
          error: tool_data.error,
          timestamp: parent_entry.timestamp,
          provider_data: {
            ...parent_entry.provider_data,
            content_block_index: index,
            is_extracted_tool: true
          },
          block_index: index,
          line_number: parent_entry.line_number ?? parent_entry.provider_data?.line_number ?? 0,
          source_uuid: parent_entry.uuid || parent_entry.id || ''
        })

        if (tool_result_entry) {
          tool_results.push(tool_result_entry)

          // Replace with text summary
          const summary_text =
            provider_config.createResultSummary?.(tool_data) ||
            'Tool execution result'

          filtered_content.push({
            type: 'text',
            content: summary_text
          })
        }
      }
    } else {
      // Keep non-tool content as-is
      filtered_content.push(content_item)
    }
  })

  log('Extracted tool interactions:', {
    tool_calls: tool_calls.length,
    tool_results: tool_results.length,
    filtered_content_items: filtered_content.length
  })

  return {
    tool_calls,
    tool_results,
    filtered_content
  }
}

export const find_orphaned_tool_calls = (timeline_entries) => {
  const tool_calls = timeline_entries.filter(
    (entry) => entry.type === 'tool_call'
  )
  const tool_results = timeline_entries.filter(
    (entry) => entry.type === 'tool_result'
  )

  const result_call_ids = new Set(
    tool_results.map((entry) => entry.content?.tool_call_id).filter(Boolean)
  )

  const orphaned_calls = tool_calls.filter(
    (entry) => !result_call_ids.has(entry.content?.tool_call_id)
  )

  if (orphaned_calls.length > 0) {
    log('Found orphaned tool calls:', {
      count: orphaned_calls.length,
      ids: orphaned_calls.map((entry) => entry.content?.tool_call_id)
    })
  }

  return orphaned_calls
}

export const find_orphaned_tool_results = (timeline_entries) => {
  const tool_calls = timeline_entries.filter(
    (entry) => entry.type === 'tool_call'
  )
  const tool_results = timeline_entries.filter(
    (entry) => entry.type === 'tool_result'
  )

  const call_ids = new Set(
    tool_calls.map((entry) => entry.content?.tool_call_id).filter(Boolean)
  )

  const orphaned_results = tool_results.filter(
    (entry) => !call_ids.has(entry.content?.tool_call_id)
  )

  if (orphaned_results.length > 0) {
    log('Found orphaned tool results:', {
      count: orphaned_results.length,
      ids: orphaned_results.map((entry) => entry.content?.tool_call_id)
    })
  }

  return orphaned_results
}
