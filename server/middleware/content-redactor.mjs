import path from 'path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { visit } from 'unist-util-visit'
import picomatch from 'picomatch'
import debug from 'debug'

import { RELATION_STRING_REGEX } from '#libs-shared/relation-parser.mjs'

const log = debug('redaction:rule-engine')

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const REDACT_CHAR = '█'
const DEFAULT_REDACTED_NUMBER = 9999
export const DEFAULT_REDACTED_STRING = '████████'
const DEFAULT_REDACTED_UUID = '████████-████-████-████-████████████'
const DEFAULT_REDACTED_DATETIME = '████-██-██T██:██:██.███Z'
const DEFAULT_REDACTED_USER_KEY =
  '████████████████████████████████████████████████████████████████'
const DEFAULT_REDACTED_ARRAY_ITEM =
  '████████████████████████████████████████████████'

// Field-specific redactors for known entity properties.
// Used by both redact_entity_properties and redact_entity_object to avoid duplication.
const PROPERTY_REDACTORS = {
  relations: (v) =>
    Array.isArray(v) ? v.map((item) => redact_relation_string(item)) : v,
  tags: (v) =>
    Array.isArray(v) ? v.map(() => DEFAULT_REDACTED_ARRAY_ITEM) : v,
  observations: (v) =>
    Array.isArray(v) ? v.map(() => DEFAULT_REDACTED_ARRAY_ITEM) : v,
  base_uri: (v) => (typeof v === 'string' ? redact_base_uri(v) : v),
  tags_aggregated: (v) => (typeof v === 'string' ? redact_text_content(v) : v)
}

/**
 * Redacts a base_uri string, preserving only `-` characters
 * @param {string} base_uri - The base URI to redact
 * @returns {string} Redacted string with block characters
 */
export const redact_base_uri = (base_uri) => {
  if (!base_uri) return DEFAULT_REDACTED_STRING
  return base_uri.replace(/[^-]/g, REDACT_CHAR)
}

/**
 * Redacts a relation string while preserving structure
 * Input: "follows [[user:task/my-task.md]]"
 * Output: "follows [[████-████/██-████.██]]"
 * @param {string} relation_string - The relation string to redact
 * @returns {string} Redacted relation string preserving structure
 */
const redact_relation_string = (relation_string) => {
  // Handle object-format relations: { type, target, context? }
  if (relation_string && typeof relation_string === 'object') {
    const { type: relation_type, target, context } = relation_string
    if (relation_type && target) {
      const redacted = {
        type: relation_type,
        target: redact_base_uri(target)
      }
      if (context) {
        redacted.context = REDACT_CHAR.repeat(context.length)
      }
      return redacted
    }
    return DEFAULT_REDACTED_ARRAY_ITEM
  }

  if (!is_valid_string(relation_string)) return DEFAULT_REDACTED_ARRAY_ITEM

  const match = relation_string.match(RELATION_STRING_REGEX)
  if (!match) {
    // Not a valid relation format, return fully redacted
    return DEFAULT_REDACTED_ARRAY_ITEM
  }

  const [, relation_type, base_uri, context] = match
  const redacted_uri = redact_base_uri(base_uri)

  let result = `${relation_type} [[${redacted_uri}]]`
  if (context) {
    result += ` (${REDACT_CHAR.repeat(context.length)})`
  }

  return result
}

// Sensitive property patterns that should trigger redaction
const SENSITIVE_PROPERTY_PATTERNS = [
  'title',
  'description',
  'content',
  'content_preview',
  'user_public_key',
  'assigned_to',
  'name',
  'summary'
]

// Default redaction rules for tool parameters
const DEFAULT_TIMELINE_REDACTION_RULES = [
  // Preserve structural/non-sensitive parameters
  { pattern: 'limit', action: 'preserve' },
  { pattern: 'offset', action: 'preserve' },
  { pattern: 'timeout', action: 'preserve' },
  { pattern: 'replace_all', action: 'preserve' },
  { pattern: 'output_mode', action: 'preserve' },
  { pattern: 'head_limit', action: 'preserve' },
  { pattern: 'multiline', action: 'preserve' },
  { pattern: '-*', action: 'preserve' }, // CLI flags like -A, -B, -C
  { pattern: 'type', action: 'preserve' },
  { pattern: 'todos.*.status', action: 'preserve' },
  { pattern: 'status', action: 'preserve' },
  { pattern: 'all_strings', action: 'redact' }
]

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validates if a value is a valid string
 */
const is_valid_string = (value) => value && typeof value === 'string'

/**
 * Validates if a value is a valid object
 */
const is_valid_object = (value) => value && typeof value === 'object'

/**
 * Creates a redacted copy of an object
 */
const create_redacted_copy = (obj) => {
  if (!obj || typeof obj !== 'object') return obj
  return { ...obj, is_redacted: true }
}

// ============================================================================
// CORE REDACTION FUNCTIONS
// ============================================================================

/**
 * Redacts text content with replacement characters matching original length
 */
export const redact_text_content = (
  content,
  replacement_char = REDACT_CHAR
) => {
  if (!is_valid_string(content)) return content

  return content
    .split('\n')
    .map((line) => line.replace(/\S/g, replacement_char))
    .join('\n')
}

/**
 * Redacts code content while preserving indentation and structure
 */
export const redact_code_content = (code) => {
  if (!is_valid_string(code)) return code

  return code
    .split('\n')
    .map((line) => {
      const leading_whitespace = line.match(/^\s*/)[0]
      const content = line.slice(leading_whitespace.length)

      if (content.length === 0) return line

      const redacted_content = content.replace(/\S/g, REDACT_CHAR)
      return leading_whitespace + redacted_content
    })
    .join('\n')
}

/**
 * Redacts URL while preserving basic structure
 */
export const redact_url = (url) => {
  if (!is_valid_string(url)) return url

  try {
    const url_obj = new URL(url)
    return `${url_obj.protocol}//${REDACT_CHAR.repeat(8)}.${REDACT_CHAR.repeat(3)}`
  } catch {
    return redact_text_content(url)
  }
}

// ============================================================================
// MARKDOWN REDACTION
// ============================================================================

/**
 * Detects if content is likely markdown based on file extension
 */
export const is_markdown_content = (file_extension) => {
  return /\.(md|markdown|mdown)$/i.test(file_extension)
}

/**
 * Redacts markdown content while preserving structure and formatting
 */
export const redact_markdown_content = (markdown_content, options = {}) => {
  if (!is_valid_string(markdown_content)) return markdown_content

  const { preserve_structure = true } = options

  if (!preserve_structure) {
    return redact_text_content(markdown_content)
  }

  try {
    const ast = unified().use(remarkParse).parse(markdown_content)

    visit(ast, (node) => {
      switch (node.type) {
        case 'text':
          node.value = redact_text_content(node.value)
          break
        case 'code':
          node.value = redact_code_content(node.value)
          break
        case 'inlineCode':
          node.value = redact_text_content(node.value)
          break
        case 'link':
          if (node.url) node.url = redact_url(node.url)
          if (node.title) node.title = redact_text_content(node.title)
          break
        case 'image':
          if (node.url) node.url = redact_url(node.url)
          if (node.alt) node.alt = redact_text_content(node.alt)
          if (node.title) node.title = redact_text_content(node.title)
          break
        case 'html':
        case 'yaml':
          node.value = redact_text_content(node.value)
          break
        case 'definition':
          if (node.url) node.url = redact_url(node.url)
          if (node.title) node.title = redact_text_content(node.title)
          break
      }
    })

    return unified().use(remarkStringify).stringify(ast)
  } catch (error) {
    console.warn(
      'Markdown parsing failed during redaction, falling back to text redaction:',
      error.message
    )
    return redact_text_content(markdown_content)
  }
}

// ============================================================================
// FILE SYSTEM REDACTION
// ============================================================================

/**
 * Redacts a filename while preserving extension and directory indicators
 */
export const redact_filename_preserving_extension = (filename) => {
  if (!is_valid_string(filename)) return filename

  const extension = path.extname(filename)
  const basename = path.basename(filename, extension)
  const redacted_basename = basename.replace(/\S/g, REDACT_CHAR)

  return redacted_basename + extension
}

/**
 * Redacts path components while preserving structure
 */
export const redact_path_components = (absolute_path) => {
  if (!is_valid_string(absolute_path)) return absolute_path

  const parts = absolute_path.split('/')
  return parts
    .map((part, index) => {
      if (part === '' && index === 0) return ''
      if (part === '.' || part === '..') return part
      return redact_filename_preserving_extension(part)
    })
    .join('/')
}

/**
 * Redacts a file object for directory listings
 */
export const redact_file_info = ({ file_info }) => {
  const redacted = create_redacted_copy(file_info)

  if (redacted.name) {
    redacted.name = redact_filename_preserving_extension(redacted.name)
  }

  if (redacted.modified) {
    redacted.modified = DEFAULT_REDACTED_DATETIME
  }

  if (redacted.size !== null && redacted.size !== undefined) {
    const magnitude = Math.floor(Math.log10(redacted.size + 1))
    redacted.size = parseInt('9'.repeat(magnitude + 1))
  }

  return redacted
}

/**
 * Redacts file content response
 */
export const redact_file_content_response = (file_response) => {
  const redacted = create_redacted_copy(file_response)
  const file_extension = redacted.path ? path.extname(redacted.path) : ''

  if (redacted.content) {
    redacted.content = is_markdown_content(file_extension)
      ? redact_markdown_content(redacted.content)
      : redact_text_content(redacted.content)
  }

  if (redacted.markdown) {
    redacted.markdown = redact_markdown_content(redacted.markdown)
  }

  if (redacted.frontmatter && typeof redacted.frontmatter === 'object') {
    redacted.frontmatter = redact_object_values(redacted.frontmatter)
  }

  if (redacted.path) {
    redacted.path = redact_path_components(redacted.path)
  }

  return redacted
}

// ============================================================================
// OBJECT & PROPERTY REDACTION
// ============================================================================

/**
 * Redacts datetime property while preserving ISO format structure
 */
export const redact_datetime_property = (datetime) => {
  if (!is_valid_string(datetime)) return datetime
  return DEFAULT_REDACTED_DATETIME
}

/**
 * Redacts UUID property while preserving UUID format structure
 */
export const redact_uuid_property = (uuid) => {
  if (!is_valid_string(uuid)) return uuid
  return DEFAULT_REDACTED_UUID
}

/**
 * Determines if a property should be redacted based on sensitivity
 */
const should_redact_property = (key, value) => {
  return (
    SENSITIVE_PROPERTY_PATTERNS.includes(key) ||
    key.includes('content') ||
    key.includes('description') ||
    (typeof value === 'string' && value.length > 100)
  )
}

/**
 * Redacts specific object property while preserving key and type structure
 */
export const redact_object_property = (value, property_name) => {
  if (value === null || value === undefined) return value

  // Type-aware redaction based on property name patterns
  if (
    property_name.includes('_at') ||
    property_name.includes('_by') ||
    property_name === 'created_at' ||
    property_name === 'updated_at'
  ) {
    return redact_datetime_property(value)
  }

  if (property_name === 'entity_id' || property_name.includes('_id')) {
    return redact_uuid_property(value)
  }

  if (property_name === 'user_public_key') {
    return DEFAULT_REDACTED_USER_KEY
  }

  if (typeof value === 'string') return redact_text_content(value)
  if (typeof value === 'number') return DEFAULT_REDACTED_NUMBER
  if (typeof value === 'boolean') return false

  return DEFAULT_REDACTED_STRING
}

// Non-sensitive structural keys on system-entry metadata that must survive
// redaction so the client dispatch logic (system_type discriminator, state
// transitions) keeps working.
const SYSTEM_METADATA_PASSTHROUGH_KEYS = new Set([
  'from_state',
  'to_state',
  'error_type',
  'is_interrupt',
  'level',
  'unsupported_message_type',
  'original_type',
  'queue_operation',
  'permission_mode',
  'attachment_type',
  'added_tool_count',
  'removed_tool_count',
  'snapshot_message_id',
  'is_snapshot_update',
  'file_count',
  'title'
])

const SYSTEM_METADATA_STRING_MAX_LENGTH = 2048
const SYSTEM_METADATA_TITLE_MAX_LENGTH = 256

const truncate_redacted_string = (
  value,
  max_length = SYSTEM_METADATA_STRING_MAX_LENGTH
) =>
  value.length > max_length
    ? value.slice(0, max_length) + ' [truncated]'
    : value

const redact_system_metadata = (metadata) => {
  if (!is_valid_object(metadata)) return metadata
  const redacted = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'title' && typeof value === 'string') {
      redacted[key] = truncate_redacted_string(
        value,
        SYSTEM_METADATA_TITLE_MAX_LENGTH
      )
    } else if (SYSTEM_METADATA_PASSTHROUGH_KEYS.has(key)) {
      redacted[key] = value
    } else if (typeof value === 'string') {
      redacted[key] = truncate_redacted_string(redact_text_content(value))
    } else if (is_valid_object(value) || Array.isArray(value)) {
      log(
        `system metadata: non-passthrough structural value key=${key} type=${Array.isArray(value) ? 'array' : 'object'}`
      )
      redacted[key] = redact_object_values(value)
    } else {
      redacted[key] = value
    }
  }
  return redacted
}

const MESSAGE_METADATA_PASSTHROUGH_KEYS = new Set([
  'model',
  'request_id',
  'usage',
  'stop_reason',
  'stop_sequence',
  'is_meta',
  'level',
  'parse_line_number',
  'toolUseID'
])

const redact_message_metadata = (metadata) => {
  if (!is_valid_object(metadata)) return metadata
  const redacted = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (MESSAGE_METADATA_PASSTHROUGH_KEYS.has(key)) {
      redacted[key] = value
    } else if (typeof value === 'string') {
      redacted[key] = truncate_redacted_string(redact_text_content(value))
    } else if (is_valid_object(value) || Array.isArray(value)) {
      redacted[key] = redact_object_values(value)
    } else {
      redacted[key] = value
    }
  }
  return redacted
}

const MESSAGE_BLOCK_URL_KEYS = ['url', 'source', 'image_url']

const redact_message_content_block = (block) => {
  if (!is_valid_object(block)) return block
  const redacted = {
    ...block,
    content: redact_text_content(block.content || '')
  }
  if (is_valid_object(block.metadata)) {
    redacted.metadata = redact_object_values(block.metadata)
  }
  for (const key of MESSAGE_BLOCK_URL_KEYS) {
    if (typeof block[key] === 'string') {
      redacted[key] = redact_text_content(block[key])
    }
  }
  return redacted
}

const redact_tool_result_array_element = (element) => {
  if (element === null || element === undefined) return element
  if (typeof element === 'string') return redact_text_content(element)
  if (typeof element === 'object') return redact_object_values(element)
  return element
}

/**
 * Redacts object values while preserving keys
 */
export const redact_object_values = (obj) => {
  if (!is_valid_object(obj)) return obj

  const redacted = {}

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      redacted[key] = value
    } else if (typeof value === 'string') {
      redacted[key] = redact_text_content(value)
    } else if (typeof value === 'number') {
      redacted[key] = DEFAULT_REDACTED_NUMBER
    } else if (typeof value === 'boolean') {
      redacted[key] = false
    } else if (Array.isArray(value)) {
      redacted[key] = value.map((item) =>
        typeof item === 'object'
          ? redact_object_values(item)
          : redact_text_content(String(item))
      )
    } else if (typeof value === 'object') {
      redacted[key] = redact_object_values(value)
    } else {
      redacted[key] = DEFAULT_REDACTED_STRING
    }
  }

  return redacted
}

// ============================================================================
// ENTITY REDACTION
// ============================================================================

/**
 * Redacts entity properties object while preserving key structure
 */
export const redact_entity_properties = (properties, options = {}) => {
  if (!is_valid_object(properties)) return properties

  const { preserve_keys = ['type', 'entity_type'], redact_keys = [] } = options
  const redacted = {}

  for (const [key, value] of Object.entries(properties)) {
    if (preserve_keys.includes(key)) {
      redacted[key] = value
      continue
    }

    // Structure-preserving redaction for known fields
    if (PROPERTY_REDACTORS[key]) {
      redacted[key] = PROPERTY_REDACTORS[key](value)
      continue
    }

    if (redact_keys.includes(key) || should_redact_property(key, value)) {
      if (Array.isArray(value)) {
        redacted[key] = value.map(() => DEFAULT_REDACTED_ARRAY_ITEM)
      } else {
        redacted[key] = redact_object_property(value, key)
      }
    } else {
      redacted[key] = value
    }
  }

  return redacted
}

/**
 * Redacts an entity object (task, thread, etc.) while preserving structure
 */
export const redact_entity_object = (entity, options = {}) => {
  if (!is_valid_object(entity)) return entity

  const { preserve_keys = ['type', 'entity_type'], redact_keys = [] } = options
  const redacted = create_redacted_copy(entity)

  if (redacted.entity_properties) {
    redacted.entity_properties = redact_entity_properties(
      redacted.entity_properties,
      { preserve_keys, redact_keys }
    )
  }

  if (redacted.entity_content) {
    redacted.entity_content = redact_text_content(redacted.entity_content)
  }

  if (redacted.absolute_path) {
    redacted.absolute_path = redact_path_components(redacted.absolute_path)
  }

  if (redacted.file_info) {
    redacted.file_info = {
      ...redacted.file_info,
      base_uri: redacted.file_info.base_uri
        ? redacted.file_info.base_uri.replace(/[^:/]/g, REDACT_CHAR)
        : null
    }
  }

  // Redact frontmatter object (contains full entity data from DuckDB queries)
  if (redacted.frontmatter && typeof redacted.frontmatter === 'object') {
    redacted.frontmatter = redact_entity_properties(redacted.frontmatter, {
      preserve_keys,
      redact_keys
    })
  }

  // Apply field-specific redactors for known top-level fields
  for (const [field, redactor] of Object.entries(PROPERTY_REDACTORS)) {
    if (redacted[field] != null) {
      redacted[field] = redactor(redacted[field])
    }
  }

  // Redact remaining properties on the object
  const handled_keys = new Set([
    'entity_properties',
    'entity_content',
    'absolute_path',
    'file_info',
    'frontmatter',
    'is_redacted',
    ...Object.keys(PROPERTY_REDACTORS)
  ])
  for (const [key, value] of Object.entries(redacted)) {
    if (handled_keys.has(key) || preserve_keys.includes(key)) {
      continue
    }

    if (redact_keys.includes(key) || should_redact_property(key, value)) {
      if (Array.isArray(value)) {
        redacted[key] = value.map(() => DEFAULT_REDACTED_ARRAY_ITEM)
      } else {
        redacted[key] = redact_object_property(value, key)
      }
    }
  }

  return redacted
}

// ============================================================================
// THREAD REDACTION
// ============================================================================

/**
 * Redacts timeline entry content based on entry type
 */
const redact_timeline_entry = (entry) => {
  const redacted_entry = { ...entry }

  switch (redacted_entry.type) {
    case 'message':
      if (redacted_entry.content) {
        if (typeof redacted_entry.content === 'string') {
          redacted_entry.content = redact_text_content(redacted_entry.content)
        } else if (Array.isArray(redacted_entry.content)) {
          redacted_entry.content = redacted_entry.content.map(
            redact_message_content_block
          )
        }
      }
      if (redacted_entry.metadata) {
        redacted_entry.metadata = redact_message_metadata(
          redacted_entry.metadata
        )
      }
      break

    case 'tool_call':
      if (redacted_entry.content?.tool_parameters) {
        redacted_entry.content = {
          ...redacted_entry.content,
          tool_parameters: redact_timeline_parameters(
            redacted_entry.content.tool_parameters
          )
        }
      }
      break

    case 'tool_result':
      if (redacted_entry.content?.result) {
        if (typeof redacted_entry.content.result === 'string') {
          redacted_entry.content.result = redact_text_content(
            redacted_entry.content.result
          )
        } else if (Array.isArray(redacted_entry.content.result)) {
          redacted_entry.content.result = redacted_entry.content.result.map(
            redact_tool_result_array_element
          )
        } else if (typeof redacted_entry.content.result === 'object') {
          redacted_entry.content.result = redact_object_values(
            redacted_entry.content.result
          )
        }
      }
      if (typeof redacted_entry.content?.error === 'string') {
        redacted_entry.content.error = redact_text_content(
          redacted_entry.content.error
        )
      } else if (is_valid_object(redacted_entry.content?.error)) {
        if (typeof redacted_entry.content.error.message === 'string') {
          redacted_entry.content.error = {
            ...redacted_entry.content.error,
            message: redact_text_content(redacted_entry.content.error.message)
          }
        } else {
          redacted_entry.content.error = redact_object_values(
            redacted_entry.content.error
          )
        }
      }
      break

    case 'system':
      if (redacted_entry.content) {
        redacted_entry.content = redact_text_content(redacted_entry.content)
      }
      if (redacted_entry.metadata) {
        redacted_entry.metadata = redact_system_metadata(
          redacted_entry.metadata
        )
      }
      break

    case 'thinking':
      if (redacted_entry.content) {
        if (typeof redacted_entry.content === 'string') {
          redacted_entry.content = redact_text_content(redacted_entry.content)
        } else if (typeof redacted_entry.content === 'object') {
          redacted_entry.content = {
            ...redacted_entry.content,
            thinking: redacted_entry.content.thinking
              ? redact_text_content(redacted_entry.content.thinking)
              : redacted_entry.content.thinking,
            signature: redacted_entry.content.signature
              ? redact_text_content(redacted_entry.content.signature)
              : redacted_entry.content.signature
          }
        }
      }
      if (redacted_entry.metadata) {
        redacted_entry.metadata = redact_object_values(redacted_entry.metadata)
      }
      break
  }

  if (redacted_entry.provider_data) {
    redacted_entry.provider_data = redact_object_values(
      redacted_entry.provider_data
    )
  }

  return redacted_entry
}

/**
 * Redacts thread data while preserving structure
 */
export const redact_thread_data = (thread) => {
  if (!thread) return thread

  const redacted = create_redacted_copy(thread)

  // Redact title and description fields that may contain PII
  if (redacted.title) {
    redacted.title = redact_text_content(redacted.title)
  }

  if (redacted.short_description) {
    redacted.short_description = redact_text_content(redacted.short_description)
  }

  if (redacted.description) {
    redacted.description = redact_text_content(redacted.description)
  }

  // Redact working directory information
  if (redacted.working_directory) {
    redacted.working_directory = redact_text_content(redacted.working_directory)
  }

  if (redacted.working_directory_path) {
    redacted.working_directory_path = redact_path_components(
      redacted.working_directory_path
    )
  }

  // Redact tags array
  if (redacted.tags && Array.isArray(redacted.tags)) {
    redacted.tags = redacted.tags.map(() => DEFAULT_REDACTED_ARRAY_ITEM)
  }

  // Redact relations array (preserving relation_type and structure, redacting base_uri)
  if (redacted.relations && Array.isArray(redacted.relations)) {
    redacted.relations = redacted.relations.map((relation) =>
      redact_relation_string(relation)
    )
  }

  // Redact file_references array (base_uri strings)
  if (redacted.file_references && Array.isArray(redacted.file_references)) {
    redacted.file_references = redacted.file_references.map((base_uri) =>
      redact_base_uri(base_uri)
    )
  }

  // Redact directory_references array (base_uri strings)
  if (
    redacted.directory_references &&
    Array.isArray(redacted.directory_references)
  ) {
    redacted.directory_references = redacted.directory_references.map(
      (base_uri) => redact_base_uri(base_uri)
    )
  }

  // Redact external session identifier
  if (redacted.external_session_id) {
    redacted.external_session_id = DEFAULT_REDACTED_UUID
  }

  // Preserve message counts, tool call counts, token counts, cost,
  // and model/provider fields for public views -- these are aggregate
  // statistics and metadata that do not leak private content

  // Redact timeline entries
  if (redacted.timeline && Array.isArray(redacted.timeline)) {
    redacted.timeline = redacted.timeline.map(redact_timeline_entry)
  }

  // Redact latest timeline event (added by enrich_thread_with_timeline)
  if (redacted.latest_timeline_event) {
    redacted.latest_timeline_event = redact_timeline_entry(
      redacted.latest_timeline_event
    )
  }

  return redacted
}

// ============================================================================
// RULE ENGINE
// ============================================================================

/**
 * Evaluates redaction rules against an object key path
 */
export const evaluate_redaction_rules = ({
  rules,
  key_path,
  value,
  context = {}
}) => {
  log(`Evaluating redaction rules for key: ${key_path}, type: ${typeof value}`)

  if (!rules || !Array.isArray(rules)) {
    log('No redaction rules provided, defaulting to preserve')
    return {
      should_redact: false,
      reason: 'No redaction rules configured',
      matching_rule: null
    }
  }

  for (const rule of rules) {
    if (!rule.pattern || !rule.action) {
      log(`Skipping invalid redaction rule: ${JSON.stringify(rule)}`)
      continue
    }

    // Special rule types
    if (rule.pattern === 'all_strings' && typeof value === 'string') {
      log(`Rule matched special pattern: ${rule.pattern}`)
      return {
        should_redact: rule.action === 'redact',
        reason: `${rule.action} by special rule: ${rule.pattern}`,
        matching_rule: rule
      }
    }

    if (
      rule.pattern === 'long_strings' &&
      typeof value === 'string' &&
      value.length > (rule.min_length || 50)
    ) {
      log(`Rule matched long string pattern: ${rule.pattern}`)
      return {
        should_redact: rule.action === 'redact',
        reason: `${rule.action} by long string rule: ${rule.pattern}`,
        matching_rule: rule
      }
    }

    // Use picomatch for glob pattern matching on key paths
    const pattern_matcher = picomatch(rule.pattern)
    if (pattern_matcher(key_path)) {
      log(`Rule matched key path pattern: ${rule.pattern} -> ${rule.action}`)
      return {
        should_redact: rule.action === 'redact',
        reason: `${rule.action} by rule: ${rule.pattern}`,
        matching_rule: rule
      }
    }
  }

  log('No matching redaction rules found, defaulting to preserve')
  return {
    should_redact: false,
    reason: 'No matching redaction rules (default preserve)',
    matching_rule: null
  }
}

/**
 * Applies redaction rules to an object
 */
export const apply_redaction_rules = (obj, rules, base_path = '') => {
  if (!is_valid_object(obj)) return obj

  const redacted_obj = Array.isArray(obj) ? [] : {}

  for (const [key, value] of Object.entries(obj)) {
    const key_path = base_path ? `${base_path}.${key}` : key

    if (typeof value === 'object' && value !== null) {
      redacted_obj[key] = apply_redaction_rules(value, rules, key_path)
    } else {
      const evaluation = evaluate_redaction_rules({
        rules,
        key_path,
        value,
        context: { parent_path: base_path }
      })

      if (evaluation.should_redact) {
        redacted_obj[key] =
          typeof value === 'string'
            ? redact_text_content(value)
            : redact_object_property(value, key)
      } else {
        redacted_obj[key] = value
      }
    }
  }

  return redacted_obj
}

/**
 * Redacts tool parameters using configurable rules
 */
export const redact_timeline_parameters = (
  parameters,
  rules = DEFAULT_TIMELINE_REDACTION_RULES
) => {
  if (!is_valid_object(parameters)) return parameters
  return apply_redaction_rules(parameters, rules)
}

// ============================================================================
// ACTIVE SESSION REDACTION
// ============================================================================

/**
 * Redacts active session data while preserving structure
 *
 * Used for sessions where the user doesn't have permission to view
 * the associated thread content.
 *
 * @param {Object} session - Active session record
 * @returns {Object} Redacted session with is_redacted flag
 */
export const redact_session_data = (session) => {
  if (!session) return session

  const redacted = create_redacted_copy(session)

  // Redact thread title
  if (redacted.thread_title) {
    redacted.thread_title = redact_text_content(redacted.thread_title)
  }

  // Redact latest timeline event using the same logic as thread timeline
  if (redacted.latest_timeline_event) {
    redacted.latest_timeline_event = redact_timeline_entry(
      redacted.latest_timeline_event
    )
  }

  // Redact file system paths
  if (redacted.working_directory) {
    redacted.working_directory = redact_path_components(
      redacted.working_directory
    )
  }

  if (redacted.transcript_path) {
    redacted.transcript_path = redact_path_components(redacted.transcript_path)
  }

  return redacted
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Checks if an object appears to be redacted
 */
export const is_object_redacted = (obj) => Boolean(obj?.is_redacted)
