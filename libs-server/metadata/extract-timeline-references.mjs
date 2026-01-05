/**
 * Extract entity references from thread timeline
 *
 * Parses timeline entries to identify file/entity accesses programmatically.
 * Supports tool calls, messages with wikilinks, and bash commands.
 */

import debug from 'debug'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { extract_entity_references } from '#libs-server/entity/format/extractors/reference-extractor.mjs'

const log = debug('metadata:extract-timeline-references')

// ============================================================================
// Constants
// ============================================================================

/**
 * Maps tool names to their access types
 */
export const TOOL_ACCESS_TYPES = {
  // Read operations
  Read: 'read',
  Glob: 'read',
  Grep: 'read',

  // Modify operations
  Edit: 'modify',
  Write: 'modify',
  NotebookEdit: 'modify',

  // Create operations
  mcp__base__entity_create: 'create'
}

/**
 * Maps bash commands to their access types
 */
const BASH_COMMAND_ACCESS_TYPES = {
  cat: 'read',
  head: 'read',
  tail: 'read',
  less: 'read',
  more: 'read',
  rm: 'delete',
  mkdir: 'create',
  touch: 'create',
  cp: { src: 'read', dst: 'create' },
  mv: { src: 'delete', dst: 'create' }
}

// ============================================================================
// Tool Call Extraction
// ============================================================================

/**
 * Extract file references from tool calls in timeline
 * @param {Object} params
 * @param {Array} params.timeline - Thread timeline entries
 * @returns {Array} Array of { path, base_uri, access_type, confidence, source }
 */
export function extract_from_tool_calls({ timeline }) {
  const references = []

  for (const entry of timeline) {
    if (entry.type !== 'tool_call') continue
    if (!entry.content?.tool_name) continue

    const { tool_name, tool_parameters } = entry.content
    const access_type = TOOL_ACCESS_TYPES[tool_name]

    if (!access_type) continue

    // Handle mcp__base__entity_create specially (uses base_uri directly)
    if (tool_name === 'mcp__base__entity_create' && tool_parameters?.base_uri) {
      references.push({
        base_uri: tool_parameters.base_uri,
        access_type,
        confidence: 'high',
        source: 'tool_call'
      })
      continue
    }

    // Handle file path based tools
    const file_path = tool_parameters?.file_path || tool_parameters?.path
    if (file_path) {
      references.push({
        path: file_path,
        access_type,
        confidence: 'high',
        source: 'tool_call'
      })
    }
  }

  return references
}

// ============================================================================
// Message Extraction
// ============================================================================

/**
 * Extract entity references from messages (wikilinks and @path mentions)
 * @param {Object} params
 * @param {Array} params.timeline - Thread timeline entries
 * @returns {Array} Array of { path, base_uri, access_type, confidence, source }
 */
export function extract_from_messages({ timeline }) {
  const references = []

  for (const entry of timeline) {
    if (entry.type !== 'message') continue
    if (!entry.content || typeof entry.content !== 'string') continue

    // Extract [[base_uri]] wikilinks using existing extractor
    const wikilinks = extract_entity_references({
      entity_content: entry.content
    })
    for (const ref of wikilinks) {
      references.push({
        base_uri: ref.base_uri,
        access_type: 'reference',
        confidence: 'high',
        source: 'message_wikilink'
      })
    }

    // Extract @path/to/file patterns from user messages
    if (entry.role === 'user') {
      const at_path_regex = /@([^\s]+\.\w+)/g
      let match
      while ((match = at_path_regex.exec(entry.content)) !== null) {
        references.push({
          path: match[1],
          access_type: 'reference',
          confidence: 'medium',
          source: 'message_at_path'
        })
      }
    }
  }

  return references
}

// ============================================================================
// Bash Command Extraction
// ============================================================================

/**
 * Parse a bash command and extract file paths with their access types
 * @param {string} command - Bash command string
 * @returns {Array} Array of { path, access_type }
 */
function parse_bash_command(command) {
  const results = []
  if (!command || typeof command !== 'string') return results

  // Split by common command separators
  const parts = command.split(/[;&|]+/)

  for (const part of parts) {
    const tokens = part.trim().split(/\s+/)
    if (tokens.length < 2) continue

    const cmd = tokens[0]
    const access_info = BASH_COMMAND_ACCESS_TYPES[cmd]

    if (!access_info) continue

    if (typeof access_info === 'string') {
      // Simple command with single access type
      for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i]
        // Skip flags
        if (token.startsWith('-')) continue
        // Skip if not a path-like string
        if (!token.includes('/') && !token.includes('.')) continue

        results.push({ path: token, access_type: access_info })
      }
    } else if (typeof access_info === 'object') {
      // Commands with src/dst like cp and mv
      const args = tokens.slice(1).filter((t) => !t.startsWith('-'))
      if (args.length >= 2) {
        results.push({ path: args[0], access_type: access_info.src })
        results.push({
          path: args[args.length - 1],
          access_type: access_info.dst
        })
      }
    }
  }

  return results
}

/**
 * Extract file references from bash commands in timeline
 * @param {Object} params
 * @param {Array} params.timeline - Thread timeline entries
 * @returns {Array} Array of { path, access_type, confidence, source }
 */
export function extract_from_bash_commands({ timeline }) {
  const references = []

  for (const entry of timeline) {
    if (entry.type !== 'tool_call') continue
    if (entry.content?.tool_name !== 'Bash') continue

    const command = entry.content?.tool_parameters?.command
    if (!command) continue

    const parsed = parse_bash_command(command)
    for (const { path, access_type } of parsed) {
      references.push({
        path,
        access_type,
        confidence: 'medium',
        source: 'bash_command'
      })
    }
  }

  return references
}

// ============================================================================
// Path to Base URI Conversion
// ============================================================================

/**
 * Convert file paths to base URIs and filter invalid paths
 * @param {Object} params
 * @param {Array} params.references - Array of references with path or base_uri
 * @returns {Array} Array of references with base_uri set
 */
export function convert_paths_to_base_uris({ references }) {
  const converted = []

  for (const ref of references) {
    // Already has base_uri
    if (ref.base_uri) {
      converted.push(ref)
      continue
    }

    // Skip if no path
    if (!ref.path) continue

    // Skip non-.md files (only track entity files)
    if (!ref.path.endsWith('.md')) continue

    try {
      const base_uri = create_base_uri_from_path(ref.path)
      converted.push({
        ...ref,
        base_uri,
        path: undefined // Remove path after conversion
      })
    } catch (error) {
      // Path is outside managed repositories - skip it
      log(`Skipping path outside managed repos: ${ref.path}`)
    }
  }

  return converted
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Deduplicate references and merge access types
 * Access type precedence: create > modify > read > reference
 * @param {Object} params
 * @param {Array} params.references - Array of references
 * @returns {Array} Deduplicated array of references
 */
export function deduplicate_references({ references }) {
  const access_priority = {
    create: 4,
    modify: 3,
    delete: 3,
    read: 2,
    reference: 1
  }
  const by_uri = new Map()

  for (const ref of references) {
    if (!ref.base_uri) continue

    const existing = by_uri.get(ref.base_uri)
    if (!existing) {
      by_uri.set(ref.base_uri, { ...ref })
      continue
    }

    // Merge: keep higher priority access type and higher confidence
    const existing_priority = access_priority[existing.access_type] || 0
    const new_priority = access_priority[ref.access_type] || 0

    if (new_priority > existing_priority) {
      existing.access_type = ref.access_type
    }

    if (ref.confidence === 'high' && existing.confidence !== 'high') {
      existing.confidence = 'high'
    }
  }

  return Array.from(by_uri.values())
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Extract all entity references from a thread timeline
 * @param {Object} params
 * @param {Array} params.timeline - Thread timeline entries
 * @returns {Object} { references: [{ base_uri, access_type, confidence }] }
 */
export function extract_timeline_references({ timeline }) {
  if (!timeline || !Array.isArray(timeline)) {
    return { references: [] }
  }

  // Collect references from all sources
  const tool_refs = extract_from_tool_calls({ timeline })
  const message_refs = extract_from_messages({ timeline })
  const bash_refs = extract_from_bash_commands({ timeline })

  const all_refs = [...tool_refs, ...message_refs, ...bash_refs]

  // Convert paths to base URIs and filter
  const converted = convert_paths_to_base_uris({ references: all_refs })

  // Deduplicate and merge access types
  const deduplicated = deduplicate_references({ references: converted })

  log(`Extracted ${deduplicated.length} unique entity references from timeline`)

  return { references: deduplicated }
}

export default extract_timeline_references
