import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import markdownItTaskCheckbox from './markdown-it-task-checkbox'
import 'highlight.js/styles/github.css'

// Initialize markdown-it with highlight.js
const md = new MarkdownIt({
  html: false,
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
  return md.render(content)
}

export default render_markdown
