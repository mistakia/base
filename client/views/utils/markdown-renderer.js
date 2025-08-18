import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import markdownItXmlStyling from './markdown-it-xml-styling.mjs'
import markdownItTaskCheckbox from './markdown-it-task-checkbox.js'
import {
  process_links_in_markdown,
  process_links_in_html
} from './link-processor.js'
import 'highlight.js/styles/github.css'

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
  .use(markdownItTaskCheckbox, {
    disabled: true, // Disable checkbox interaction
    divWrap: false, // Don't wrap in div
    idPrefix: 'task_', // Prefix for checkbox IDs
    ulClass: 'task-list', // Class for task lists
    liClass: 'task-list-item' // Class for task list items
  })

// Render markdown content
export const render_markdown = (content) => {
  if (!content) return ''

  // Process base URI links and wiki links before rendering
  const processed_content = process_links_in_markdown(content)

  // Render markdown to HTML
  const html = md.render(processed_content)

  // Process links in the rendered HTML to add attributes
  return process_links_in_html(html)
}

export default render_markdown
