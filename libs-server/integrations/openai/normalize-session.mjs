/**
 * OpenAI Session Normalization
 *
 * Converts OpenAI/ChatGPT conversation format to normalized session structure
 * for integration with Base thread system.
 */

import debug from 'debug'

const log = debug('integrations:openai:normalize')

// Track unsupported features for reporting
const unsupported_tracking = {
  content_types: new Set(),
  gizmo_types: new Set(),
  message_statuses: new Set(),
  special_features: new Set(),
  conversation_fields: new Set(),
  message_fields: new Set(),
  metadata_fields: new Set(),
  content_part_types: new Set()
}

const log_unsupported = (category, value, context = '') => {
  if (!unsupported_tracking[category].has(value)) {
    unsupported_tracking[category].add(value)
    log(
      `UNSUPPORTED ${category.toUpperCase()}: ${value} ${context ? `(${context})` : ''}`
    )
  }
}

/**
 * Normalize OpenAI conversation to common session format
 */
export function normalize_openai_conversation(conversation) {
  try {
    log(`Normalizing OpenAI conversation: ${conversation.id}`)

    // Track unknown conversation fields
    const known_conversation_fields = [
      'id',
      'conversation_id',
      'title',
      'create_time',
      'update_time',
      'mapping',
      'current_node',
      'gizmo_id',
      'gizmo_type',
      'conversation_template_id',
      'is_archived',
      'is_starred',
      'is_do_not_remember',
      'memory_scope',
      'workspace_id',
      'async_status',
      'default_model_slug',
      'conversation_origin',
      'voice',
      'disabled_tool_ids',
      'moderation_results',
      'safe_urls',
      'blocked_urls',
      'plugin_ids'
    ]
    Object.keys(conversation).forEach((key) => {
      if (!known_conversation_fields.includes(key)) {
        log_unsupported('conversation_fields', key)
      }
    })

    // Track gizmo types if present
    if (conversation.gizmo_type) {
      unsupported_tracking.gizmo_types.add(conversation.gizmo_type)
    }

    const session = {
      // Session identification
      session_id: conversation.conversation_id || conversation.id,
      session_provider: 'openai',

      // Basic metadata
      title: conversation.title || 'Untitled Conversation',
      created_at: parseTimestamp(conversation.create_time),
      updated_at: parseTimestamp(conversation.update_time),

      // Extract messages from mapping structure
      messages: extractMessages(conversation.mapping || {}),

      // OpenAI-specific metadata
      metadata: {
        current_node: conversation.current_node,
        gizmo_id: conversation.gizmo_id,
        gizmo_type: conversation.gizmo_type,
        conversation_template_id: conversation.conversation_template_id,
        is_archived: conversation.is_archived,
        is_starred: conversation.is_starred,
        is_do_not_remember: conversation.is_do_not_remember,
        memory_scope: conversation.memory_scope,
        workspace_id: conversation.workspace_id,
        async_status: conversation.async_status,
        default_model_slug: conversation.default_model_slug,
        conversation_origin: conversation.conversation_origin,
        voice: conversation.voice,
        disabled_tool_ids: conversation.disabled_tool_ids,
        moderation_results: conversation.moderation_results || []
      },

      // Context and capabilities
      context: {
        safe_urls: conversation.safe_urls || [],
        blocked_urls: conversation.blocked_urls || [],
        plugin_ids: conversation.plugin_ids || []
      }
    }

    log(`Normalized ${session.messages.length} messages`)
    return session
  } catch (error) {
    log(`Error normalizing OpenAI conversation: ${error.message}`)
    throw error
  }
}

/**
 * Extract and order messages from OpenAI mapping structure
 */
function extractMessages(mapping) {
  if (!mapping || typeof mapping !== 'object') {
    log('No mapping data found')
    return []
  }

  const messages = []
  const processed_nodes = new Set()

  // Find root node (usually 'client-created-root')
  const root_node = findRootNode(mapping)
  if (!root_node) {
    log('No root node found in mapping')
    return []
  }

  // Traverse the conversation tree depth-first
  traverseConversationTree(mapping, root_node, messages, processed_nodes)

  // Sort by creation time to ensure proper ordering
  messages.sort((a, b) => {
    const time_a = a.timestamp || 0
    const time_b = b.timestamp || 0
    return time_a - time_b
  })

  log(
    `Extracted ${messages.length} messages from ${Object.keys(mapping).length} nodes`
  )
  return messages
}

/**
 * Find the root node of the conversation tree
 */
function findRootNode(mapping) {
  // Look for client-created-root or a node with no parent
  if (mapping['client-created-root']) {
    return 'client-created-root'
  }

  // Find node with no parent
  const nodes_with_no_parent = Object.keys(mapping).filter((id) => {
    const node = mapping[id]
    return !node.parent || node.parent === null
  })

  return nodes_with_no_parent[0] || Object.keys(mapping)[0]
}

/**
 * Traverse conversation tree and extract messages
 */
function traverseConversationTree(mapping, node_id, messages, processed) {
  if (processed.has(node_id) || !mapping[node_id]) {
    return
  }

  processed.add(node_id)
  const node = mapping[node_id]

  // Extract message data if present
  if (node.message && node.message.content) {
    const message = extractMessageData(node.message, node_id)
    if (message) {
      messages.push(message)
    }
  }

  // Process children in order
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child_id) => {
      traverseConversationTree(mapping, child_id, messages, processed)
    })
  }
}

/**
 * Extract and normalize individual message data
 */
function extractMessageData(message, node_id) {
  try {
    // Skip system messages with no content or hidden messages
    if (message.metadata?.is_visually_hidden_from_conversation) {
      return null
    }

    // Skip messages with no meaningful content
    if (!message.content || !hasContentParts(message.content)) {
      return null
    }

    // Track unknown message fields
    const known_message_fields = [
      'id',
      'author',
      'create_time',
      'update_time',
      'content',
      'status',
      'weight',
      'end_turn',
      'recipient',
      'channel',
      'metadata'
    ]
    Object.keys(message).forEach((key) => {
      if (!known_message_fields.includes(key)) {
        log_unsupported(
          'message_fields',
          key,
          `in ${message.author?.role || 'unknown'} message`
        )
      }
    })

    // Track metadata fields if present
    if (message.metadata && typeof message.metadata === 'object') {
      const known_metadata_fields = [
        'request_id',
        'message_source',
        'message_type',
        'selected_github_repos',
        'is_visually_hidden_from_conversation',
        'timestamp_',
        'finish_details',
        'citations',
        'gizmo_id',
        'is_complete',
        'model_slug',
        'parent_id'
      ]
      Object.keys(message.metadata).forEach((key) => {
        if (!known_metadata_fields.includes(key)) {
          log_unsupported('metadata_fields', key, 'message metadata')
        }
      })
    }

    const normalized_message = {
      id: message.id || node_id,
      role: message.author?.role || 'unknown',
      timestamp: parseTimestamp(message.create_time),
      type: determineMessageType(message)
    }

    // Extract content based on content type
    const content_data = extractContentData(message.content)
    Object.assign(normalized_message, content_data)

    // Add OpenAI-specific metadata
    if (message.metadata) {
      normalized_message.metadata = {
        status: message.status,
        weight: message.weight,
        end_turn: message.end_turn,
        recipient: message.recipient,
        channel: message.channel,
        request_id: message.metadata.request_id,
        message_source: message.metadata.message_source,
        message_type: message.metadata.message_type,
        selected_github_repos: message.metadata.selected_github_repos
      }
    }

    // Track message status for analytics
    if (message.status) {
      unsupported_tracking.message_statuses.add(message.status)
    }

    return normalized_message
  } catch (error) {
    log(`Error extracting message data: ${error.message}`)
    return null
  }
}

/**
 * Check if content has meaningful parts
 */
function hasContentParts(content) {
  if (!content) return false

  // Text content with parts
  if (content.parts && Array.isArray(content.parts)) {
    return content.parts.some((part) => part && part.trim() !== '')
  }

  // Other content types that might be meaningful
  return !!(
    content.model_set_context ||
    content.structured_context ||
    content.repository
  )
}

/**
 * Determine message type based on content and metadata
 */
function determineMessageType(message) {
  const content_type = message.content?.content_type

  // Track content types for analytics
  if (content_type) {
    unsupported_tracking.content_types.add(content_type)
  }

  switch (content_type) {
    case 'text':
      return 'text'
    case 'code':
      return 'code'
    case 'model_editable_context':
      return 'context'
    case 'execution_output':
      return 'tool_result'
    case 'tool_invocation':
      return 'tool_call'
    case 'multimodal_text':
      return 'multimodal'
    default:
      if (message.author?.role === 'tool') {
        return 'tool_result'
      }
      return 'text'
  }
}

/**
 * Extract content data based on content type
 */
function extractContentData(content) {
  const content_type = content.content_type

  switch (content_type) {
    case 'text':
    case 'multimodal_text':
      return extractTextContent(content)

    case 'code':
      return extractCodeContent(content)

    case 'model_editable_context':
      return extractContextContent(content)

    case 'execution_output':
      return extractExecutionOutput(content)

    case 'tool_invocation':
      return extractToolInvocation(content)

    default:
      // Fallback to text extraction
      log(
        `Unexpected content_type '${content_type}' - falling back to text extraction`
      )
      return extractTextContent(content)
  }
}

/**
 * Extract text content from parts array
 */
function extractTextContent(content) {
  if (content.parts && Array.isArray(content.parts)) {
    const text_parts = content.parts.filter(
      (part) => typeof part === 'string' && part.trim()
    )

    return {
      content: text_parts.join('\n'),
      content_parts: content.parts.map((part) => ({
        type: 'text',
        text: part
      }))
    }
  }

  return { content: '' }
}

/**
 * Extract code content
 */
function extractCodeContent(content) {
  return {
    content: content.text || '',
    language: content.language,
    code: content.text,
    content_type: 'code'
  }
}

/**
 * Extract model context content
 */
function extractContextContent(content) {
  return {
    content: content.model_set_context || '',
    context_data: {
      repository: content.repository,
      repo_summary: content.repo_summary,
      structured_context: content.structured_context
    },
    content_type: 'context'
  }
}

/**
 * Extract execution output
 */
function extractExecutionOutput(content) {
  return {
    content: content.text || content.output || '',
    execution_data: {
      output: content.output,
      error: content.error,
      exit_code: content.exit_code
    },
    content_type: 'execution_output'
  }
}

/**
 * Extract tool invocation
 */
function extractToolInvocation(content) {
  return {
    content: `Tool: ${content.tool_name || 'unknown'}`,
    tool_call: {
      name: content.tool_name,
      parameters: content.parameters,
      invocation_id: content.invocation_id
    },
    content_type: 'tool_invocation'
  }
}

/**
 * Parse OpenAI timestamp (can be float seconds or ISO string)
 */
function parseTimestamp(timestamp) {
  if (!timestamp) return null

  // Handle float timestamp (seconds since epoch)
  if (typeof timestamp === 'number') {
    return new Date(timestamp * 1000).toISOString()
  }

  // Handle ISO string
  if (typeof timestamp === 'string') {
    return new Date(timestamp).toISOString()
  }

  return null
}

/**
 * Validate normalized session
 */
export function validate_openai_session(session) {
  const errors = []

  if (!session.session_id) {
    errors.push('Missing session_id')
  }

  if (!session.messages || !Array.isArray(session.messages)) {
    errors.push('Missing or invalid messages array')
  }

  if (session.messages.length === 0) {
    errors.push('No messages found in session')
  }

  // Check for required message fields
  session.messages.forEach((msg, index) => {
    if (!msg.id) errors.push(`Message ${index}: missing id`)
    if (!msg.role) errors.push(`Message ${index}: missing role`)
    if (!msg.content && !msg.tool_call) {
      errors.push(`Message ${index}: missing content`)
    }
  })

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Get summary of unsupported features encountered
 */
export function get_unsupported_summary() {
  return {
    content_types: Array.from(unsupported_tracking.content_types),
    gizmo_types: Array.from(unsupported_tracking.gizmo_types),
    message_statuses: Array.from(unsupported_tracking.message_statuses),
    special_features: Array.from(unsupported_tracking.special_features),
    conversation_fields: Array.from(unsupported_tracking.conversation_fields),
    message_fields: Array.from(unsupported_tracking.message_fields),
    metadata_fields: Array.from(unsupported_tracking.metadata_fields),
    content_part_types: Array.from(unsupported_tracking.content_part_types)
  }
}

// Legacy function for backward compatibility
export function get_unsupported_features() {
  return get_unsupported_summary()
}

/**
 * Clear unsupported feature tracking
 */
export function clear_unsupported_tracking() {
  unsupported_tracking.content_types.clear()
  unsupported_tracking.gizmo_types.clear()
  unsupported_tracking.message_statuses.clear()
  unsupported_tracking.special_features.clear()
  unsupported_tracking.conversation_fields.clear()
  unsupported_tracking.message_fields.clear()
  unsupported_tracking.metadata_fields.clear()
  unsupported_tracking.content_part_types.clear()
}
