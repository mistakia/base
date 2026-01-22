/**
 * Parses content to identify inline code spans and applies transformations
 * only to text outside of code spans.
 *
 * Handles CommonMark-compliant inline code:
 * - Single backticks: `code`
 * - Double backticks: ``code with ` inside``
 * - Any number of backticks with matching closing sequence
 */

/**
 * Parse content into parts, identifying inline code spans.
 * @param {string} content - The content to parse
 * @returns {Array<{type: 'text'|'code', content: string}>} Parsed parts
 */
const parse_inline_code = (content) => {
  const parts = []
  let pos = 0

  while (pos < content.length) {
    // Find next backtick starting at pos
    let backtick_start = -1
    for (let i = pos; i < content.length; i++) {
      if (content[i] === '`') {
        backtick_start = i
        break
      }
    }

    if (backtick_start === -1) {
      // No more backticks
      if (pos < content.length) {
        parts.push({ type: 'text', content: content.slice(pos) })
      }
      break
    }

    // Add text before backticks
    if (backtick_start > pos) {
      parts.push({ type: 'text', content: content.slice(pos, backtick_start) })
    }

    // Count opening backticks
    let open_count = 0
    let i = backtick_start
    while (i < content.length && content[i] === '`') {
      open_count++
      i++
    }

    // Find matching closing sequence (same count, not adjacent to other backticks)
    const opening_backticks = '`'.repeat(open_count)
    let search_pos = i
    let close_pos = -1

    while (search_pos < content.length) {
      const idx = content.indexOf(opening_backticks, search_pos)
      if (idx === -1) break

      // Ensure it's exactly open_count backticks (not part of a longer sequence)
      const before_ok = idx === 0 || content[idx - 1] !== '`'
      const after_ok =
        idx + open_count >= content.length || content[idx + open_count] !== '`'

      if (before_ok && after_ok) {
        close_pos = idx
        break
      }
      search_pos = idx + 1
    }

    if (close_pos !== -1) {
      // Found matching close
      const full_span = content.slice(backtick_start, close_pos + open_count)
      parts.push({ type: 'code', content: full_span })
      pos = close_pos + open_count
    } else {
      // No matching close, treat opening backticks as text
      parts.push({ type: 'text', content: opening_backticks })
      pos = backtick_start + open_count
    }
  }

  return parts
}

/**
 * Apply a transformation function only to text outside inline code backticks.
 * Inline code spans are preserved as-is without transformation.
 *
 * @param {string} content - The content to process
 * @param {function} transform_fn - Function to apply to non-code text segments
 * @returns {string} Transformed content with inline code preserved
 */
export const transform_outside_inline_code = (content, transform_fn) => {
  if (!content) return content

  const parts = parse_inline_code(content)

  // If no parts (empty content), return as-is
  if (parts.length === 0) {
    return content
  }

  // Transform text parts, preserve code parts
  return parts
    .map((part) =>
      part.type === 'code' ? part.content : transform_fn(part.content)
    )
    .join('')
}
