/**
 * Process plaintext content to highlight numbers
 * @param {string} content - The plaintext content to process
 * @returns {string} - HTML content with numbers wrapped in span elements
 */
const highlight_numbers_in_plaintext = (content) => {
  if (!content) return content

  // Regex to match numbers (including decimals) followed by + sign
  // This will match patterns like: 70+, 2+, 250+, 5+, 15+, 1.5+, etc.
  const number_regex = /\b(\d+(?:\.\d+)?)\+/g

  return content.replace(number_regex, (match) => {
    // Wrap the number with + sign with a span that has the betting-number class
    return `<span class="betting-number">${match}</span>`
  })
}

/**
 * Process HTML content to find and highlight numbers in plaintext code blocks
 * @param {string} html_content - The HTML content to process
 * @returns {string} - HTML content with numbers highlighted in plaintext blocks
 */
export const process_plaintext_blocks = (html_content) => {
  if (!html_content) return html_content

  // Find all code blocks with plaintext language - handle both formats
  // Format 1: <pre><code class="hljs hljs-plaintext">...</code></pre>
  // Format 2: <code class="hljs language-plaintext">...</code>
  const plaintext_block_regex =
    /<(?:pre><code|code)\s+class="hljs(?:\s+hljs-plaintext|\s+language-plaintext)">([\s\S]*?)<\/code>(?:<\/pre>)?/g

  return html_content.replace(plaintext_block_regex, (match, content) => {
    // Don't decode HTML entities - work with the raw content as it is
    // The content is already properly encoded for HTML display

    // Highlight numbers in the content (numbers should be plain text, not HTML)
    const highlighted_content = highlight_numbers_in_plaintext(content)

    // Return the same format as the original match
    if (match.includes('<pre>')) {
      return `<pre><code class="hljs hljs-plaintext">${highlighted_content}</code></pre>`
    } else {
      return `<code class="hljs language-plaintext">${highlighted_content}</code>`
    }
  })
}

export default process_plaintext_blocks
