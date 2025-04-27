import debug from 'debug'

const log = debug('markdown:processor:extractors:tag-extractor')

/**
 * Extract tags from markdown frontmatter and content
 * @param {Object} parsed_markdown Parsed markdown entity
 * @returns {Array<Object>} Extracted entity tags with tag_id in format <system|user>/<tag-path>
 */
export function extract_entity_tags(parsed_markdown) {
  const tags = []
  const frontmatter = parsed_markdown.frontmatter || {}

  // Extract tags from frontmatter
  if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
    frontmatter.tags.forEach((tag_id) => {
      if (!tag_id.match(/^(system|user)\//)) {
        log(
          `Warning: Invalid tag_id format: ${tag_id}. Must start with system/ or user/`
        )
        return
      }
      tags.push({ tag_id })
    })
  }

  // Extract hashtags from markdown content
  if (parsed_markdown.markdown) {
    const hashtag_regex = /(?<!^|\n)#([a-zA-Z0-9_/-]+)/g
    let match
    while ((match = hashtag_regex.exec(parsed_markdown.markdown)) !== null) {
      const tag_id = match[1]
      if (!tag_id.match(/^(system|user)\//)) {
        log(
          `Warning: Invalid tag_id format: ${tag_id}. Must start with system/ or user/`
        )
        continue
      }
      tags.push({ tag_id })
    }
  }

  return tags
}
