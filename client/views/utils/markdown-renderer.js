import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import markdownItKatex from '@vscode/markdown-it-katex'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItDeflist from 'markdown-it-deflist'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import { alert as markdownItAlert } from '@mdit/plugin-alert'
import markdownItContainer from 'markdown-it-container'
import markdownItAttrs from 'markdown-it-attrs'
import markdownItXmlStyling from './markdown-it-xml-styling.mjs'
import markdownItTaskCheckbox from './markdown-it-task-checkbox.js'
import markdownItHeadingAnchor from './markdown-it-heading-anchor.js'
import {
  process_links_in_markdown,
  process_links_in_html
} from './link-processor.js'
import { html_tag_whitelist } from './html-tag-whitelist.mjs'
import { process_plaintext_blocks } from './plaintext-number-highlighter.js'
import { process_prompt_blocks } from './prompt-block-processor.js'
import { transform_outside_inline_code } from './inline-code-parser.js'
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.min.css'
import '@mdit/plugin-alert/style'

// Import plaintext language support
import 'highlight.js/lib/languages/plaintext'

// Escape unknown XML-like tags so markdown inside them is still parsed.
// Later, the XML styling plugin will re-wrap these escaped tags for display.

// Escape XML tags in a string segment (not inside code)
const escape_xml_tags_in_segment = (segment) => {
  return segment.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9_-]*)([^<>]*?)>/g,
    (match, tag_name) => {
      const lower = tag_name.toLowerCase()
      if (html_tag_whitelist.has(lower)) return match
      return match.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  )
}

const escape_unknown_xml_tags_outside_code = (content) => {
  if (!content) return content

  const lines = content.split('\n')
  let in_code_fence = false
  // Match fenced code blocks with 0-3 spaces indentation (CommonMark spec)
  const fence_regex = /^ {0,3}```/

  const processed_lines = lines.map((line) => {
    if (fence_regex.test(line)) {
      in_code_fence = !in_code_fence
      return line
    }

    if (in_code_fence) return line

    // Process line while protecting inline code
    return transform_outside_inline_code(line, escape_xml_tags_in_segment)
  })

  return processed_lines.join('\n')
}

// Plugin registration order is load-bearing:
//   1. KaTeX first so math delimiters are tokenized before any other plugin
//      can swallow `$` or `\`.
//   2. GFM extensions (footnote, deflist, sub, sup, emoji, alert) second.
//   3. markdown-it-container (catch-all) for `:::NAME` block fences.
//   4. markdown-it-attrs LAST so `{.class #id}` tokens attach to blocks
//      produced by all the plugins above (including alerts and containers).
// Changing this order can silently break attribute attachment or math
// rendering -- update tests in tests/unit/markdown/ if you touch it.
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
  .use(markdownItKatex)
  .use(markdownItHighlightjs, {
    hljs,
    auto: true,
    code: true,
    inline: false,
    ignoreIllegals: true
  })
  .use(markdownItXmlStyling)
  .use(markdownItTaskCheckbox)
  .use(markdownItHeadingAnchor)
  .use(markdownItFootnote)
  .use(markdownItDeflist)
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItEmoji)
  .use(markdownItAlert)

// Strict attribute whitelist for markdown-it-attrs. Array form (the plugin
// also accepts an Object/RegExp form, but Set is NOT accepted).
const ALLOWED_ATTRS = [
  'id',
  'class',
  'alt',
  'title',
  'width',
  'height',
  'src',
  'href',
  'colspan',
  'rowspan'
]

// Catch-all container: any `:::NAME` fence renders as `<div class="NAME">`.
// The class name is HTML-escaped so authors cannot break out of the attribute.
const escape_html_attr = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

md.use(markdownItContainer, 'any', {
  validate: () => true,
  render: (tokens, idx) => {
    const token = tokens[idx]
    if (token.nesting === 1) {
      const name = token.info.trim().split(/\s+/)[0] || 'container'
      return `<div class="${escape_html_attr(name)}">\n`
    }
    return '</div>\n'
  }
})

// markdown-it-attrs MUST be registered last; see comment above.
md.use(markdownItAttrs, { allowedAttributes: ALLOWED_ATTRS })

const html_escape = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const default_fence = md.renderer.rules.fence
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = (token.info || '').trim().split(/\s+/)[0]

  // Mermaid fences emit a passthrough wrapper; the post-render lifecycle
  // (mermaid-runner.js) consumes [data-mermaid] nodes and renders SVGs.
  // The body must be HTML-escaped so the markup survives DOM insertion;
  // mermaid 11.x reads element.innerHTML and runs entityDecode() before
  // parsing, so `<` / `>` round-trip correctly.
  if (info === 'mermaid') {
    return `<div class="mermaid-source" data-mermaid>${html_escape(token.content)}</div>\n`
  }

  const rendered = default_fence
    ? default_fence(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
  return `<div class="code-block-wrapper">${rendered}<button type="button" class="code-copy-button" data-copy-code aria-label="Copy code to clipboard"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/></svg></button></div>`
}

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
  const html_with_plaintext = process_plaintext_blocks(
    html_with_table_containers
  )

  // Process prompt blocks to highlight @file-path references
  return process_prompt_blocks(html_with_plaintext)
}

export default render_markdown
