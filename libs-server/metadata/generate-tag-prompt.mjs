import { createHash } from 'crypto'
import debug from 'debug'
import { list_tags_from_filesystem } from '#libs-server/tag/filesystem/list-tags-from-filesystem.mjs'
import { read_tag_from_filesystem } from '#libs-server/tag/filesystem/read-tag-from-filesystem.mjs'

const log = debug('metadata:tag-prompt')

// ============================================================================
// Constants
// ============================================================================

// Bump this when the prompt template or analysis logic changes.
// Threads analyzed with an older version become re-eligible for analysis.
const PROMPT_VERSION = 2

const TAG_CONSTRAINTS = {
  MAX_TAGS: 3
}

// Ollama `format` schema for structured tag classification output.
// `secondary` has no minItems so edge-case inputs can produce an empty list
// without violating the schema. `rationale` is capped to keep output bounded.
const TAG_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    primary: { type: 'string' },
    secondary: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 2
    },
    rationale: { type: 'string', maxLength: 200 }
  },
  required: ['primary']
}

// ============================================================================
// Tag Loading
// ============================================================================

/**
 * Load all available tags with their full content for context
 *
 * @param {Object} params
 * @param {string} params.user_public_key - User public key
 * @returns {Promise<Array>} Array of tag objects with full content
 */
export async function load_tags_with_content({ user_public_key }) {
  log('Loading tags with content')

  const tags = await list_tags_from_filesystem({
    user_public_key,
    include_archived: false
  })

  const tags_with_content = await Promise.all(
    tags.map(async (tag) => {
      const fallback = {
        base_uri: tag.base_uri,
        title: tag.title,
        description: tag.description,
        content: ''
      }

      try {
        const tag_result = await read_tag_from_filesystem({
          base_uri: tag.base_uri
        })

        if (tag_result.success) {
          return { ...fallback, content: tag_result.entity_content || '' }
        }
        return fallback
      } catch (error) {
        log(`Failed to read tag content for ${tag.base_uri}: ${error.message}`)
        return fallback
      }
    })
  )

  log(`Loaded ${tags_with_content.length} tags with content`)
  return tags_with_content
}

/**
 * Compute a content-based hash of the tag taxonomy.
 * Changes when tags are added, removed, or their content changes.
 * Does not change on git operations that only update mtimes.
 *
 * @param {Array} tags - Array of tag objects with base_uri, description, content
 * @returns {string} Short hex hash (first 12 chars of SHA-256)
 */
export function compute_taxonomy_hash(tags) {
  const sorted_entries = tags
    .map((t) => `${t.base_uri}|${t.description || ''}|${t.content || ''}`)
    .sort()

  const hash = createHash('sha256')
  hash.update(sorted_entries.join('\n'))
  return hash.digest('hex').substring(0, 12)
}

/**
 * Format tags for inclusion in the prompt
 *
 * @param {Array} tags - Array of tag objects with content
 * @returns {string} Formatted tag descriptions
 */
export function format_tags_for_prompt(tags) {
  return tags
    .map((tag) => {
      const content_preview = tag.content
        ? `\n${tag.content.substring(0, 500)}${tag.content.length > 500 ? '...' : ''}`
        : ''

      return `### ${tag.title}
base_uri: ${tag.base_uri}
${tag.description || ''}${content_preview}`
    })
    .join('\n\n')
}

// ============================================================================
// Prompt Generation
// ============================================================================

/**
 * Generate the tag analysis prompt for a thread
 *
 * @param {Object} params
 * @param {string} params.user_message - First user message from the thread
 * @param {string} params.title - Thread title (if available)
 * @param {string} params.short_description - Thread description (if available)
 * @param {Array} params.tags - Available tags with content
 * @returns {string} Prompt for the model
 */
export function generate_tag_analysis_prompt({
  user_message,
  title,
  short_description,
  tags
}) {
  const formatted_tags = format_tags_for_prompt(tags)

  const thread_context = [
    title ? `Title: ${title}` : null,
    short_description ? `Description: ${short_description}` : null
  ]
    .filter(Boolean)
    .join('\n')

  return `Analyze this session and assign appropriate tags from the available taxonomy.

## Thread Information
${thread_context ? thread_context + '\n' : ''}
User messages:
"""
${user_message}
"""

## Available Tags

${formatted_tags}

## Instructions

1. Analyze the thread content to understand what work is being done
2. Select 0-${TAG_CONSTRAINTS.MAX_TAGS} tags that accurately categorize this thread
3. Only assign tags you are confident about -- when in doubt, omit
4. Consider:
   - What project or domain does this relate to?
   - What type of work is being done?
   - Check each tag's Scope and Decision Rule sections for guidance on boundaries between similar tags

## Response Format

Return a JSON object with:
- "tags": Array of base_uri strings for selected tags (empty array if no tags match)
- "reasoning": Brief explanation of why each tag was selected

\`\`\`json
{
  "tags": ["user:tag/example-tag.md"],
  "reasoning": "Brief explanation"
}
\`\`\``
}

/**
 * Parse the tag analysis response from the model
 *
 * @param {string} response_text - Raw model response text
 * @param {Array} available_tags - Available tags for validation
 * @returns {Object} Parsed result with tags array and success flag
 */
export function parse_tag_analysis_response(response_text, available_tags) {
  if (!response_text || typeof response_text !== 'string') {
    return {
      success: false,
      error: 'Empty response',
      tags: []
    }
  }

  // Extract JSON from response
  let json = null

  // Try markdown code block first
  const json_block_regex = /```(?:json)?\s*([\s\S]*?)```/
  const block_match = response_text.match(json_block_regex)

  if (block_match) {
    try {
      json = JSON.parse(block_match[1].trim())
    } catch (error) {
      log(`Failed to parse JSON from code block: ${error.message}`)
    }
  }

  // Try raw JSON object
  if (!json) {
    const json_object_regex = /\{[\s\S]*\}/
    const object_match = response_text.match(json_object_regex)

    if (object_match) {
      try {
        json = JSON.parse(object_match[0])
      } catch (error) {
        log(`Failed to parse raw JSON: ${error.message}`)
      }
    }
  }

  if (!json) {
    return {
      success: false,
      error: 'No JSON found in response',
      tags: []
    }
  }

  // Accept either the structured v3 shape ({primary, secondary, rationale})
  // or the legacy v2 shape ({tags, reasoning}). The structured shape is what
  // Ollama returns when called with TAG_OUTPUT_SCHEMA; the legacy shape is
  // what free-text v2 prompts and the OpenCode path produce.
  let tags
  const reasoning = json.reasoning || json.rationale || null
  if (typeof json.primary === 'string') {
    const secondary = Array.isArray(json.secondary) ? json.secondary : []
    tags = [json.primary, ...secondary]
  } else {
    tags = json.tags || []
  }

  if (!Array.isArray(tags)) {
    tags = []
  }

  // Validate tags against available tags
  const available_base_uris = new Set(available_tags.map((t) => t.base_uri))
  const valid_tags = tags.filter((tag) => {
    if (typeof tag !== 'string') {
      log(`Invalid tag type: ${typeof tag}`)
      return false
    }
    if (!available_base_uris.has(tag)) {
      log(`Tag not in available tags: ${tag}`)
      return false
    }
    return true
  })

  // Limit to max tags
  const final_tags = valid_tags.slice(0, TAG_CONSTRAINTS.MAX_TAGS)

  log(`Parsed ${final_tags.length} valid tags from response`)

  return {
    success: true,
    tags: final_tags,
    reasoning
  }
}

export { TAG_CONSTRAINTS, PROMPT_VERSION, TAG_OUTPUT_SCHEMA }
