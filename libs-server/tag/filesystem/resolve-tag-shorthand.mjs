import debug from 'debug'

const log = debug('tag:resolve-shorthand')

/**
 * Convert user-friendly tag names to proper Base URI format
 *
 * Handles:
 * - Full Base URI format passthrough (e.g., "user:tag/base-project.md")
 * - Shorthand conversion (e.g., "base-project" -> "user:tag/base-project.md")
 * - Comma-separated multiple tags
 *
 * @param {string} tag_input - Tag(s) to resolve (comma-separated for multiple)
 * @returns {string[]} Array of resolved tag URIs
 */
export const resolve_tag_shorthand = (tag_input) => {
  if (!tag_input || typeof tag_input !== 'string') {
    throw new Error('Tag input must be a non-empty string')
  }

  log('Resolving tag shorthand for input:', tag_input)

  // Split by comma and trim whitespace
  const raw_tags = tag_input
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)

  if (raw_tags.length === 0) {
    throw new Error('No valid tags found in input')
  }

  const resolved_tags = raw_tags.map(tag => {
    // Check if already in full Base URI format
    if (tag.includes(':') && tag.includes('/') && tag.endsWith('.md')) {
      log('Tag already in Base URI format:', tag)
      return tag
    }

    // Convert shorthand to user:tag/shorthand.md format
    const resolved_tag = `user:tag/${tag}.md`
    log('Converted shorthand tag:', { original: tag, resolved: resolved_tag })
    return resolved_tag
  })

  log('Resolved tags:', resolved_tags)
  return resolved_tags
}
