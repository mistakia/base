/**
 * Extract entity references from thread timeline
 *
 * Parses timeline entries to identify file/entity accesses programmatically.
 * Supports tool calls, messages with wikilinks, and bash commands.
 */

import path from 'path'
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

  // Delegation. Agent tool calls a subagent with a free-form prompt; entity
  // references inside the prompt are extracted via the wikilink scanner.
  Agent: 'reference',

  // MCP task management tools
  TaskCreate: 'create',
  TaskUpdate: 'modify',

  // Create operations (legacy MCP tool, kept for historical thread compatibility)
  mcp__base__entity_create: 'create'
}

/**
 * Tool names whose base_uri identity comes from tool_parameters.base_uri
 * (MCP-style create/modify tools) rather than file_path or path.
 */
const BASE_URI_PARAMETER_TOOLS = new Set([
  'mcp__base__entity_create',
  'TaskCreate',
  'TaskUpdate'
])

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

const SCRIPT_EXTENSIONS = ['.mjs', '.js', '.cjs', '.ts', '.tsx', '.py', '.sh']

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

    // Handle MCP-style tools that identify entities directly by base_uri.
    if (BASE_URI_PARAMETER_TOOLS.has(tool_name)) {
      const base_uri =
        tool_parameters?.base_uri || tool_parameters?.task_uri || null
      if (base_uri) {
        references.push({
          base_uri,
          access_type,
          confidence: 'high',
          source: 'tool_call'
        })
      }
      continue
    }

    // Handle Agent tool: extract wikilinks and @path mentions from the prompt
    // parameter. The Agent tool itself doesn't touch files directly, but its
    // prompt typically names the entities the subagent will investigate.
    if (tool_name === 'Agent') {
      const prompt_text =
        typeof tool_parameters?.prompt === 'string'
          ? tool_parameters.prompt
          : null
      if (prompt_text) {
        const wikilinks = extract_entity_references({
          entity_content: prompt_text
        })
        for (const ref of wikilinks) {
          references.push({
            base_uri: ref.base_uri,
            access_type: 'reference',
            confidence: 'medium',
            source: 'tool_call_agent'
          })
        }
        const at_path_regex = /@([^\s]+\.\w+)/g
        let match
        while ((match = at_path_regex.exec(prompt_text)) !== null) {
          references.push({
            path: match[1],
            access_type: 'reference',
            confidence: 'low',
            source: 'tool_call_agent'
          })
        }
      }
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
 * Resolve a potentially relative path to an absolute path
 * @param {string} file_path - Path that may be relative or absolute
 * @param {string} [working_directory] - Working directory to resolve against
 * @returns {string} Absolute path
 */
function resolve_path(file_path, working_directory) {
  if (!file_path) return file_path

  // Already absolute
  if (path.isAbsolute(file_path)) {
    return file_path
  }

  // Resolve relative path against working directory
  if (working_directory) {
    return path.resolve(working_directory, file_path)
  }

  // Cannot resolve - return as-is
  return file_path
}

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
      const working_directory = entry.metadata?.working_directory
      const at_path_regex = /@([^\s]+\.\w+)/g
      let match
      while ((match = at_path_regex.exec(entry.content)) !== null) {
        const raw_path = match[1]
        const resolved_path = resolve_path(raw_path, working_directory)

        references.push({
          path: resolved_path,
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

    // `bun script.mjs` / `node script.mjs` / `python3 script.py` etc.
    // The script path is the first non-flag token with a script extension,
    // treated as a read (we are executing its code).
    if (cmd === 'bun' || cmd === 'node' || cmd === 'python' || cmd === 'python3') {
      for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i]
        if (token.startsWith('-')) continue
        if (SCRIPT_EXTENSIONS.some((ext) => token.endsWith(ext))) {
          results.push({ path: token, access_type: 'read' })
          break
        }
      }
      continue
    }

    // `git add <files>` or `git checkout <files>`. These touch file paths but
    // are not currently mapped by BASH_COMMAND_ACCESS_TYPES. Treat add as
    // modify (content entering the index) and checkout as read (content
    // coming out of an object).
    if (cmd === 'git' && (tokens[1] === 'add' || tokens[1] === 'checkout')) {
      const access_type = tokens[1] === 'add' ? 'modify' : 'read'
      for (let i = 2; i < tokens.length; i++) {
        const token = tokens[i]
        if (token.startsWith('-')) continue
        if (token === '--') continue
        if (!token.includes('/') && !token.includes('.')) continue
        results.push({ path: token, access_type })
      }
      continue
    }

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

    // Detect `base entity create` CLI commands
    const entity_create_match = command.match(
      /base\s+entity\s+create\s+["']?((?:user|sys):[^\s"']+)["']?/
    )
    if (entity_create_match) {
      references.push({
        base_uri: entity_create_match[1],
        access_type: 'create',
        confidence: 'high',
        source: 'bash_command'
      })
      continue
    }

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

/**
 * Separate references into entity files, code files, and directories
 * Entity references: .md files that resolve to base URIs
 * File references: code files (.js, .mjs, .ts, etc.)
 * Directory references: paths identified as directories
 * @param {Object} params
 * @param {Array} params.references - Array of references with path or base_uri
 * @returns {Object} { entity_references, file_references, directory_references }
 */
export function separate_reference_types({ references }) {
  const entity_references = []
  const file_references = []
  const directory_references = []

  // File extensions to track as code files
  const code_extensions = [
    '.js',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.jsx',
    '.json',
    '.yaml',
    '.yml',
    '.sh',
    '.py',
    '.rb',
    '.go',
    '.rs',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.css',
    '.scss',
    '.html',
    '.sql',
    '.graphql'
  ]

  for (const ref of references) {
    // Already has base_uri - it's an entity reference
    if (ref.base_uri) {
      entity_references.push(ref)
      continue
    }

    // Skip if no path
    if (!ref.path) continue

    const path = ref.path

    // Check if it's a directory (ends with /)
    if (path.endsWith('/')) {
      const path_without_slash = path.replace(/\/$/, '') // Remove trailing slash
      try {
        const base_uri = create_base_uri_from_path(path_without_slash)
        directory_references.push({
          base_uri,
          access_type: ref.access_type,
          confidence: ref.confidence,
          source: ref.source
        })
      } catch (error) {
        // Path is outside managed repositories - skip it
        log(
          `Skipping directory path outside managed repos: ${path_without_slash}`
        )
      }
      continue
    }

    // Check if it's a .md entity file
    if (path.endsWith('.md')) {
      try {
        const base_uri = create_base_uri_from_path(path)
        entity_references.push({
          ...ref,
          base_uri,
          path: undefined
        })
      } catch (error) {
        // Path is outside managed repositories - skip it
        log(`Skipping entity path outside managed repos: ${path}`)
      }
      continue
    }

    // Check if it's a code file
    const has_code_extension = code_extensions.some((ext) => path.endsWith(ext))
    if (has_code_extension) {
      try {
        const base_uri = create_base_uri_from_path(path)
        file_references.push({
          base_uri,
          access_type: ref.access_type,
          confidence: ref.confidence,
          source: ref.source
        })
      } catch (error) {
        // Path is outside managed repositories - skip it
        log(`Skipping file path outside managed repos: ${path}`)
      }
      continue
    }

    // Check if path looks like a directory (no extension and contains /)
    if (!path.includes('.') && path.includes('/')) {
      try {
        const base_uri = create_base_uri_from_path(path)
        directory_references.push({
          base_uri,
          access_type: ref.access_type,
          confidence: ref.confidence,
          source: ref.source
        })
      } catch (error) {
        // Path is outside managed repositories - skip it
        log(`Skipping directory path outside managed repos: ${path}`)
      }
    }
  }

  return {
    entity_references,
    file_references,
    directory_references
  }
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

/**
 * Extract all references from a thread timeline, separated by type
 * @param {Object} params
 * @param {Array} params.timeline - Thread timeline entries
 * @returns {Object} {
 *   entity_references: [{ base_uri, access_type, confidence }],
 *   file_references: [{ path, access_type, confidence }],
 *   directory_references: [{ path, access_type, confidence }]
 * }
 */
export function extract_timeline_references_separated({ timeline }) {
  if (!timeline || !Array.isArray(timeline)) {
    return {
      entity_references: [],
      file_references: [],
      directory_references: []
    }
  }

  // Collect references from all sources
  const tool_refs = extract_from_tool_calls({ timeline })
  const message_refs = extract_from_messages({ timeline })
  const bash_refs = extract_from_bash_commands({ timeline })

  const all_refs = [...tool_refs, ...message_refs, ...bash_refs]

  // Separate into entity, file, and directory references
  const separated = separate_reference_types({ references: all_refs })

  // Deduplicate each type
  const entity_references = deduplicate_references({
    references: separated.entity_references
  })
  const file_references = deduplicate_references({
    references: separated.file_references
  })
  const directory_references = deduplicate_references({
    references: separated.directory_references
  })

  log(
    `Extracted ${entity_references.length} entity refs, ${file_references.length} file refs, ${directory_references.length} dir refs`
  )

  return {
    entity_references,
    file_references,
    directory_references
  }
}

export default extract_timeline_references
