import { is_valid_base_uri } from '#libs-shared/relation-validator.mjs'

/**
 * Shared relation string parser for parsing entity relation strings
 * into structured objects for display in components.
 *
 * Relation string format: "relation_type [[base_uri]] (optional context)"
 * Examples:
 *   - "follows [[sys:system/guideline/example.md]]"
 *   - "relates_to [[user:task/my-task.md]] (high priority)"
 *   - "implements [[https://example.com/spec]]"
 */

/**
 * Regex pattern for parsing relation strings
 * Groups:
 *   1. relation_type - non-whitespace characters before the link
 *   2. base_uri - content inside double brackets
 *   3. context - optional content in parentheses after the link
 */
export const RELATION_STRING_REGEX =
  /^(\S+)\s+\[\[([^\]]+)\]\](?:\s+\(([^)]*)\))?$/

/**
 * Regex pattern to detect redacted content. Matches strings composed
 * exclusively of the Unicode block character (U+2588) and structural
 * separators (whitespace and the bracket/punctuation characters that
 * may survive redaction of a relation string), with at least one block
 * character present.
 */
const REDACTED_CONTENT_REGEX = /^[█\s\-/.\[\]()]+$/

/**
 * Check if a string is redacted content (only block characters and
 * structural separators, with at least one block character).
 * @param {string} str - String to check
 * @returns {boolean} True if the string is redacted content
 */
export function is_redacted_content(str) {
  if (!str || typeof str !== 'string') {
    return false
  }
  return str.includes('█') && REDACTED_CONTENT_REGEX.test(str)
}

/**
 * Check if a base_uri is redacted (contains only block characters and structural chars like - / .)
 * @param {string} base_uri - Base URI to check
 * @returns {boolean} True if the base_uri is redacted
 */
export function is_redacted_base_uri(base_uri) {
  if (!base_uri || typeof base_uri !== 'string') {
    return false
  }
  // Redacted base_uri contains only block characters and structural chars (- / .)
  // Must contain at least one block character to be considered redacted
  return /^[█\-/.]+$/.test(base_uri) && base_uri.includes('█')
}

/**
 * Parse a single relation string into a structured object
 * @param {Object} params
 * @param {string} params.relation_string - Relation string like "follows [[sys:path.md]]"
 * @returns {Object|null} Object with relation_type, base_uri, and context, or null if invalid
 */
export function parse_relation_string({ relation_string }) {
  // Handle object-format relations: { type, target, context? }
  if (relation_string && typeof relation_string === 'object') {
    const { type: relation_type, target } = relation_string
    if (relation_type && target) {
      return {
        relation_type,
        base_uri: target,
        context: relation_string.context || null
      }
    }
    return null
  }

  if (!relation_string || typeof relation_string !== 'string') {
    return null
  }

  const match = relation_string.match(RELATION_STRING_REGEX)
  if (!match) {
    return null
  }

  const [, relation_type, base_uri, context] = match

  return {
    relation_type: relation_type.trim(),
    base_uri,
    context: context || null
  }
}

/**
 * Parse an array of relation strings into objects suitable for RelatedEntities component
 * Handles redacted relations (permission-denied content) with redacted flag
 * @param {Object} params
 * @param {Array<string>} params.relations - Array of relation strings
 * @returns {Array<Object>} Array of relation objects with relation_type, base_uri, title, and malformed/redacted flags
 */
export function parse_relations_for_display({ relations }) {
  if (!Array.isArray(relations)) {
    return []
  }

  const results = []

  for (let index = 0; index < relations.length; index++) {
    const relation_string = relations[index]

    // Handle redacted relations (permission-denied content)
    if (is_redacted_content(relation_string)) {
      // Preserve the two-part structure (relation_type + base_uri) when
      // the redacted string contains a whitespace separator between
      // block runs, e.g. "████ ████████".
      const whitespace_split = relation_string.trim().split(/\s+/)
      const relation_type =
        whitespace_split.length > 1 ? whitespace_split[0] : null
      const base_uri =
        whitespace_split.length > 1
          ? whitespace_split.slice(1).join(' ')
          : relation_string
      results.push({
        relation_type,
        base_uri,
        title: null,
        redacted: true,
        // Use index to ensure unique keys for redacted relations
        unique_key: `redacted-${index}`
      })
      continue
    }

    const parsed = parse_relation_string({ relation_string })

    if (!parsed) {
      // Return malformed relation for display as plain text
      results.push({
        relation_type: null,
        base_uri: null,
        title: null,
        malformed: true,
        raw_string:
          typeof relation_string === 'string'
            ? relation_string
            : JSON.stringify(relation_string),
        // Use index to ensure unique keys for malformed relations
        unique_key: `malformed-${index}`
      })
      continue
    }

    // Check if the base_uri is redacted (permission-denied content)
    if (is_redacted_base_uri(parsed.base_uri)) {
      results.push({
        relation_type: parsed.relation_type,
        base_uri: parsed.base_uri,
        title: null,
        redacted: true,
        unique_key: `redacted-${index}`
      })
      continue
    }

    // Mark as invalid if base_uri doesn't pass validation
    const is_invalid = !is_valid_base_uri({ base_uri: parsed.base_uri })

    results.push({
      relation_type: parsed.relation_type,
      base_uri: parsed.base_uri,
      title: null, // Relations don't have titles, will show filename
      context: parsed.context,
      ...(is_invalid && { invalid: true, unique_key: `invalid-${index}` })
    })
  }

  return results
}
