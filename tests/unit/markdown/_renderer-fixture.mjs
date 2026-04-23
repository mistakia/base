// Test fixture that re-builds a markdown-it instance matching the
// production renderer's plugin configuration without pulling in the
// renderer module (which depends on webpack-injected globals and CSS
// imports that do not resolve in a node test environment).
//
// IMPORTANT: when you change plugin order in
// client/views/utils/markdown-renderer.js, mirror it here or the
// regression tests no longer reflect production behavior.

import MarkdownIt from 'markdown-it'
import markdownItKatex from '@vscode/markdown-it-katex'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItDeflist from 'markdown-it-deflist'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import { alert as markdownItAlert } from '@mdit/plugin-alert'
import markdownItContainer from 'markdown-it-container'
import markdownItAttrs from 'markdown-it-attrs'

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

const escape_html_attr = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const html_escape = (str) =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const build_renderer = () => {
  const md = new MarkdownIt({
    html: true,
    breaks: true,
    linkify: true
  })
    .use(markdownItKatex)
    .use(markdownItFootnote)
    .use(markdownItDeflist)
    .use(markdownItSub)
    .use(markdownItSup)
    .use(markdownItEmoji)
    .use(markdownItAlert)
    .use(markdownItContainer, 'any', {
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
    .use(markdownItAttrs, { allowedAttributes: ALLOWED_ATTRS })

  const default_fence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const info = (token.info || '').trim().split(/\s+/)[0]
    if (info === 'mermaid') {
      return `<div class="mermaid-source" data-mermaid>${html_escape(token.content)}</div>\n`
    }
    const rendered = default_fence
      ? default_fence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
    return `<div class="code-block-wrapper">${rendered}<button data-copy-code></button></div>`
  }

  return md
}
