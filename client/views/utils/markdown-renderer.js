import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import markdownItXmlStyling from './markdown-it-xml-styling.mjs'
import markdownItTaskCheckbox from './markdown-it-task-checkbox.js'
import {
  process_links_in_markdown,
  process_links_in_html
} from './link-processor.js'
import { html_tag_whitelist } from './html-tag-whitelist.mjs'
import { process_plaintext_blocks } from './plaintext-number-highlighter.js'
import 'highlight.js/styles/github.css'

// Import plaintext language support
import 'highlight.js/lib/languages/plaintext'

// Escape unknown XML-like tags so markdown inside them is still parsed.
// Later, the XML styling plugin will re-wrap these escaped tags for display.

const escape_unknown_xml_tags_outside_code = (content) => {
  if (!content) return content

  const lines = content.split('\n')
  let in_code_fence = false
  const fence_regex = /^```/ // start or end of a fenced code block

  const processed_lines = lines.map((line) => {
    if (fence_regex.test(line)) {
      in_code_fence = !in_code_fence
      return line
    }

    if (in_code_fence) return line

    // Replace unknown tags like <instructions> or </instructions>
    return line.replace(
      /<\/?([a-zA-Z][a-zA-Z0-9_-]*)([^<>]*?)>/g,
      (match, tag_name) => {
        const lower = tag_name.toLowerCase()
        if (html_tag_whitelist.has(lower)) return match
        return match.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }
    )
  })

  return processed_lines.join('\n')
}

// Initialize markdown-it with highlight.js
const md = new MarkdownIt({
  html: true, // Enable HTML tags to allow styled XML tags
  breaks: true,
  linkify: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch (__) {}
    }
    return '' // use external default escaping
  }
})
  .use(markdownItHighlightjs, {
    hljs,
    auto: true,
    code: true,
    inline: true,
    ignoreIllegals: true
  })
  .use(markdownItXmlStyling)
  .use(markdownItTaskCheckbox)

// Wrap tables in scrollable containers
const wrap_tables_in_containers = (html) => {
  return html.replace(
    /<table[^>]*>[\s\S]*?<\/table>/g,
    '<div class="table-container">$&</div>'
  )
}

// Render markdown content
export const render_markdown = (content) => {
  if (!content) return ''

  // Escape unknown XML-like tags so markdown inside is parsed
  const content_with_escaped_xml = escape_unknown_xml_tags_outside_code(content)

  // Process base URI links and wiki links before rendering
  const processed_content = process_links_in_markdown(content_with_escaped_xml)

  // Render markdown to HTML
  const html = md.render(processed_content)

  // Process links in the rendered HTML to add attributes
  const html_with_links = process_links_in_html(html)

  // Wrap tables in scrollable containers
  const html_with_table_containers = wrap_tables_in_containers(html_with_links)

  // Process plaintext blocks to highlight numbers
  return process_plaintext_blocks(html_with_table_containers)
}

export default render_markdown
