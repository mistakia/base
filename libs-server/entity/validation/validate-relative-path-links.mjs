/**
 * Validate that entity content does not contain relative path links (../ or ./)
 * in markdown links or image references. Entity content should use base-uri
 * format or wikilinks instead.
 *
 * Scans all content (including inside code spans and fenced code blocks) so
 * real links inside example fences are still validated. Specific findings can
 * be excused via the `validation_exceptions` frontmatter primitive: each entry
 * is `{rule, match, reason}` and suppresses any error for the named rule whose
 * full match text equals `match`. Exceptions that do not match anything are
 * reported as `unused_exceptions` so they cannot rot silently.
 *
 * @param {Object} params - Parameters
 * @param {string} params.entity_content - Raw markdown content body
 * @param {Array<{rule: string, match: string, reason?: string}>} [params.validation_exceptions]
 * @returns {{errors: string[], unused_exceptions: Array}}
 */
const RULE_ID = 'relative-path-link'

export function validate_relative_path_links({
  entity_content,
  validation_exceptions = []
} = {}) {
  if (!entity_content) {
    return { errors: [], unused_exceptions: [] }
  }

  const applicable_exceptions = validation_exceptions.filter(
    (e) => e && e.rule === RULE_ID && typeof e.match === 'string'
  )
  const used = new Set()

  // Pattern matches markdown links and images with relative paths
  // [text](../path) or ![alt](../../path) or [text](./path)
  const relative_link_regex = /!?\[([^\]]*)\]\((\.\.\/[^)]+|\.\/[^)]+)\)/g
  const errors = []

  let match
  while ((match = relative_link_regex.exec(entity_content)) !== null) {
    const full_match = match[0]
    const path = match[2]

    const matching_exception = applicable_exceptions.find(
      (e) => e.match === full_match
    )
    if (matching_exception) {
      used.add(matching_exception)
      continue
    }

    errors.push(
      `Relative path link found: ${full_match} -- use base-uri format (e.g., user:path/to/file) or wikilinks instead of "${path}"`
    )
  }

  const unused_exceptions = applicable_exceptions.filter((e) => !used.has(e))

  return { errors, unused_exceptions }
}
