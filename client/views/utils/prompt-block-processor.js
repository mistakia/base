/**
 * Process prompt code blocks to highlight special tokens:
 * - @<file-path> references (e.g. @src/utils/helper.js, @./config.json)
 * - /slash-commands (e.g. /commit, /review-pr, /help)
 *
 * @param {string} html_content - Rendered HTML string
 * @returns {string} - HTML with highlighted tokens in prompt blocks
 */

const highlight_prompt_tokens = (content) => {
  // Highlight /slash-commands first (to avoid conflicts with file paths containing /)
  // Matches / at start of line or after whitespace, followed by a command name
  let result = content.replace(
    /(^|\n|&#10;|\s)(\/[a-zA-Z][a-zA-Z0-9_-]*)/g,
    '$1<span class="prompt-slash-cmd">$2</span>'
  )

  // Highlight @file-path references
  // Matches @ followed by optional ./ or ../ then path segments with common extensions
  result = result.replace(
    /(@(?:\.{0,2}\/)?[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/g,
    '<span class="prompt-file-ref">$1</span>'
  )

  return result
}

export const process_prompt_blocks = (html_content) => {
  if (!html_content) return html_content

  // Match prompt code blocks in both hljs class formats
  const prompt_block_regex =
    /<(?:pre><code|code)\s+class="[^"]*language-prompt[^"]*">([\s\S]*?)<\/code>(?:<\/pre>)?/g

  return html_content.replace(prompt_block_regex, (match, content) => {
    const highlighted = highlight_prompt_tokens(content)

    // Return with same wrapper structure
    if (match.includes('<pre>')) {
      const class_match = match.match(/class="([^"]*)"/)
      const class_name = class_match ? class_match[1] : 'language-prompt'
      return `<pre><code class="${class_name}">${highlighted}</code></pre>`
    } else {
      const class_match = match.match(/class="([^"]*)"/)
      const class_name = class_match ? class_match[1] : 'language-prompt'
      return `<code class="${class_name}">${highlighted}</code>`
    }
  })
}

export default process_prompt_blocks
