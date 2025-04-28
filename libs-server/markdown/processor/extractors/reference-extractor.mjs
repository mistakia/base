/**
 * Extract references (wikilinks) from markdown content
 * @param {Object} parsed_markdown Parsed markdown entity
 * @returns {Array} Extracted entity references
 */
export function extract_entity_references(parsed_markdown) {
  const references = []

  // Get tokens from parsed markdown
  const tokens = parsed_markdown.tokens || []
  if (!tokens.length) return references

  // Function to check if a token is inside a code block or inline code
  const is_in_code = (token) => {
    if (!token) return false

    // Check token type for code blocks or inline code
    if (
      token.type === 'code_block' ||
      token.type === 'fence' ||
      token.type === 'code_inline'
    ) {
      return true
    }

    // Check parent token
    if (token.parent) {
      return is_in_code(token.parent)
    }

    return false
  }

  // Process tokens to extract references
  for (const token of tokens) {
    // Only process inline tokens that might contain wikilinks
    if (token.type === 'inline' && token.content) {
      // Skip if token is entirely in a code block
      if (is_in_code(token)) {
        continue
      }

      // For processing inline content with potentially mixed code and text
      const content = token.content

      // Extract all wikilinks NOT inside backticks
      // We first split the content by backtick characters to identify code sections
      const parts = content.split('`')

      // Even-indexed parts are outside backticks, odd-indexed parts are inside backticks
      for (let i = 0; i < parts.length; i++) {
        // Skip parts inside backticks (odd indices)
        if (i % 2 === 1) continue

        // Process parts outside backticks (even indices)
        const part = parts[i]
        const wikilink_regex = /\[\[([^\]]+)\]\]/g
        let match

        while ((match = wikilink_regex.exec(part)) !== null) {
          references.push({
            reference_path: match[1]
          })
        }
      }
    }
  }

  return references
}
