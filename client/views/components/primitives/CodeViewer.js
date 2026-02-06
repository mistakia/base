import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { code_to_html } from '@core/shiki-highlighter.js'
import { normalize_language } from '@views/utils/language-utils.js'
import { sanitize_html } from '@views/utils/sanitize-html.mjs'
import { StatusText, MonospaceText } from './styled/index.js'

const CodeViewer = ({ code, language, is_redacted }) => {
  const [highlighted_html, set_highlighted_html] = useState('')
  const [error, set_error] = useState(null)
  const normalized_language = useMemo(
    () => normalize_language(language),
    [language]
  )

  useEffect(() => {
    let is_active = true

    const render_highlight = async () => {
      try {
        set_error(null)

        // For redacted content, skip syntax highlighting and preserve server format
        if (is_redacted) {
          const lines = (code || '').split('\n')
          const redacted_html = lines
            .map(
              (line, index) =>
                `<div style="white-space: pre;"><span style="display: inline-block; width: 3ch; color: #6e7781; text-align: right; padding-right: var(--space-base); user-select: none;">${index + 1}</span>${line}</div>`
            )
            .join('')

          const wrapped_html = `<pre style="margin: 0; padding: var(--space-base); font-size: var(--font-size-base); line-height: 1.5; overflow: auto; color: var(--color-text-disabled); overflow-x: auto; background-color: color-mix(in srgb, var(--color-text-disabled) 10%, transparent); user-select: none; cursor: not-allowed; opacity: 0.8; border: 1px dashed var(--color-border-subtle); border-radius: 4px;">${redacted_html}</pre>`

          if (is_active) set_highlighted_html(sanitize_html(wrapped_html))
          return
        }

        const html = await code_to_html(code || '', {
          lang: normalized_language,
          theme: 'solarized-light',
          transformers: [
            {
              pre(node) {
                node.properties.style =
                  'margin: 0; padding: var(--space-base); font-size: var(--font-size-base); line-height: 1.5; overflow: auto; color: #657B83; overflow-x: auto;'
              },
              line(node, line) {
                node.children.unshift({
                  type: 'element',
                  tagName: 'span',
                  properties: {
                    class: 'line-number',
                    style:
                      'display: inline-block; width: 6ch; color: #6e7781; text-align: right; padding-right: var(--space-lg); user-select: none;'
                  },
                  children: [{ type: 'text', value: String(line) }]
                })
              }
            }
          ]
        })
        if (is_active) set_highlighted_html(sanitize_html(html))
      } catch (err) {
        if (is_active) {
          set_error(`Failed to highlight code: ${err.message}`)
          set_highlighted_html('')
        }
      }
    }

    render_highlight()

    return () => {
      is_active = false
    }
  }, [code, normalized_language, is_redacted])

  if (error) {
    return (
      <Box
        sx={{
          margin: 'var(--space-base)',
          padding: 'var(--space-base)',
          backgroundColor:
            'color-mix(in srgb, var(--color-warning) 10%, transparent)',
          border: '1px solid var(--color-warning)',
          borderRadius: 'var(--radius-base)'
        }}>
        <StatusText status='error'>{error}</StatusText>
      </Box>
    )
  }

  if (!highlighted_html) {
    return (
      <Box
        sx={{
          margin: 'var(--space-base)',
          padding: 'var(--space-base)',
          border: '1px solid var(--color-border-light)',
          borderRadius: 'var(--radius-base)'
        }}>
        <MonospaceText color='var(--color-text-secondary)'>
          Loading code...
        </MonospaceText>
      </Box>
    )
  }

  return (
    <div
      style={{ overflow: 'auto' }}
      title={
        is_redacted ? 'Access restricted - code content redacted' : undefined
      }
      aria-label={is_redacted ? 'Redacted code content' : undefined}
      role={is_redacted ? 'text' : undefined}>
      <div dangerouslySetInnerHTML={{ __html: highlighted_html }} />
    </div>
  )
}

CodeViewer.propTypes = {
  code: PropTypes.string.isRequired,
  language: PropTypes.string.isRequired,
  is_redacted: PropTypes.bool
}

export default CodeViewer
