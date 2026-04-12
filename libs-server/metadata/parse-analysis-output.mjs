import debug from 'debug'

const log = debug('metadata:parse')

// ============================================================================
// Constants
// ============================================================================

const METADATA_CONSTRAINTS = {
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 200
}

// ============================================================================
// JSON Extraction
// ============================================================================

/**
 * Extract JSON object from model response text
 * Handles markdown code blocks and raw JSON
 *
 * @param {string} text - Model response text
 * @returns {Object|null} Parsed JSON or null if not found
 */
export const extract_json_from_response = (text) => {
  if (!text || typeof text !== 'string') {
    return null
  }

  // Try to find JSON in markdown code block first
  const json_block_regex = /```(?:json)?\s*([\s\S]*?)```/
  const block_match = text.match(json_block_regex)

  if (block_match) {
    try {
      return JSON.parse(block_match[1].trim())
    } catch (error) {
      log(`Failed to parse JSON from code block: ${error.message}`)
    }
  }

  // Try to find raw JSON object
  const json_object_regex = /\{[\s\S]*\}/
  const object_match = text.match(json_object_regex)

  if (object_match) {
    try {
      return JSON.parse(object_match[0])
    } catch (error) {
      log(`Failed to parse raw JSON: ${error.message}`)
    }
  }

  return null
}

// ============================================================================
// Metadata Parsing
// ============================================================================

/**
 * Parse thread metadata from model response
 *
 * @param {string} response_text - Raw model response text
 * @returns {Object} Parsed metadata with title and short_description
 */
export const parse_metadata_response = (response_text) => {
  const json = extract_json_from_response(response_text)

  if (!json) {
    log('No JSON found in response')
    return {
      success: false,
      error: 'No JSON found in response',
      title: null,
      short_description: null
    }
  }

  // Extract title (support multiple field names)
  let title = json.title || json.name || null

  // Extract description (support multiple field names)
  let short_description =
    json.short_description || json.description || json.summary || null

  // Validate and truncate title
  if (title) {
    if (typeof title !== 'string') {
      title = String(title)
    }
    title = title.trim()
    if (title.length > METADATA_CONSTRAINTS.MAX_TITLE_LENGTH) {
      title =
        title.substring(0, METADATA_CONSTRAINTS.MAX_TITLE_LENGTH - 3) + '...'
    }
  }

  // Validate and truncate description
  if (short_description) {
    if (typeof short_description !== 'string') {
      short_description = String(short_description)
    }
    short_description = short_description.trim()
    if (
      short_description.length > METADATA_CONSTRAINTS.MAX_DESCRIPTION_LENGTH
    ) {
      short_description =
        short_description.substring(
          0,
          METADATA_CONSTRAINTS.MAX_DESCRIPTION_LENGTH - 3
        ) + '...'
    }
  }

  const success = Boolean(title || short_description)

  if (!success) {
    log('No title or description found in JSON')
    return {
      success: false,
      error: 'No title or description found in JSON',
      title: null,
      short_description: null
    }
  }

  log(
    `Parsed metadata - title: "${title}", description: "${short_description}"`
  )
  return {
    success: true,
    title,
    short_description
  }
}

export default parse_metadata_response
