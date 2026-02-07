import debug from 'debug'
import { list_tags_from_filesystem } from '#libs-server/tag/filesystem/list-tags-from-filesystem.mjs'
import { read_tag_from_filesystem } from '#libs-server/tag/filesystem/read-tag-from-filesystem.mjs'

const log = debug('metadata:tag-prompt')

// ============================================================================
// Constants
// ============================================================================

const TAG_CONSTRAINTS = {
  MAX_TAGS: 3,
  MIN_CONFIDENCE: 0.7
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

  return `Analyze this coding session and assign appropriate tags from the available taxonomy.

## Thread Information
${thread_context ? thread_context + '\n' : ''}
First user message:
"""
${user_message}
"""

## Available Tags

${formatted_tags}

## Instructions

1. Analyze the thread content to understand what work is being done
2. Select 0-${TAG_CONSTRAINTS.MAX_TAGS} tags that accurately categorize this thread
3. Only assign tags where confidence is high (>70%)
4. Consider:
   - What project/codebase is being worked on?
   - What domain does this relate to?
   - Is this a software task?

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

  // Extract and validate tags
  let tags = json.tags || []

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
    reasoning: json.reasoning || null
  }
}

export { TAG_CONSTRAINTS }
