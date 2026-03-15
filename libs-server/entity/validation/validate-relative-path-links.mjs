/**
 * Validate that entity content does not contain relative path links (../ or ./)
 * in markdown links or image references. Entity content should use base-uri
 * format or wikilinks instead.
 *
 * Only checks markdown links [text](path) and images ![alt](path).
 * Skips content inside code blocks and inline code.
 *
 * @param {Object} params - Parameters
 * @param {string} params.entity_content - Raw markdown content body
 * @param {Array} [params.tokens] - Parsed markdown-it tokens (for code block awareness)
 * @returns {Object} - { errors: string[] }
 */
export function validate_relative_path_links({
  entity_content,
  tokens = []
} = {}) {
  const errors = []

  if (!entity_content) {
    return { errors }
  }

  // Pattern matches markdown links and images with relative paths
  // [text](../path) or ![alt](../../path) or [text](./path)
  const relative_link_regex = /!?\[([^\]]*)\]\((\.\.\/[^)]+|\.\/[^)]+)\)/g

  if (tokens.length > 0) {
    // Token-aware extraction: skip code blocks
    for (const token of tokens) {
      if (token.type === 'inline' && token.content) {
        if (is_in_code_token(token)) {
          continue
        }

        const parts = token.content.split('`')
        for (let i = 0; i < parts.length; i++) {
          if (i % 2 === 1) continue
          find_relative_links(parts[i], relative_link_regex, errors)
        }
      }
    }
  } else {
    // Simple extraction: strip fenced code blocks, then scan
    const content_without_code = entity_content.replace(
      /```[\s\S]*?```/g,
      ''
    )
    find_relative_links(content_without_code, relative_link_regex, errors)
  }

  return { errors }
}

function find_relative_links(text, regex, errors) {
  let match
  // Reset regex lastIndex for reuse
  regex.lastIndex = 0
  while ((match = regex.exec(text)) !== null) {
    const full_match = match[0]
    const path = match[2]
    errors.push(
      `Relative path link found: ${full_match} -- use base-uri format (e.g., user:path/to/file) or wikilinks instead of "${path}"`
    )
  }
}

function is_in_code_token(token) {
  if (!token) return false
  if (
    token.type === 'code_block' ||
    token.type === 'fence' ||
    token.type === 'code_inline'
  ) {
    return true
  }
  if (token.parent) {
    return is_in_code_token(token.parent)
  }
  return false
}
