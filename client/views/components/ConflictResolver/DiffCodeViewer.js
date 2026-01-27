import React, { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { parseDiffFromFile } from '@pierre/diffs'

import { code_to_html } from '@core/shiki-highlighter.js'
import { normalize_language } from '@views/utils/language-utils.js'
import { MonospaceText } from '@components/primitives/styled/index.js'

/**
 * Extract line numbers that are additions from a diff
 * @param {object} diff_metadata - FileDiffMetadata from parseDiffFromFile
 * @returns {Set<number>} Set of line numbers that are additions
 */
const extract_addition_lines = (diff_metadata) => {
  const addition_lines = new Set()

  if (!diff_metadata?.hunks) return addition_lines

  for (const hunk of diff_metadata.hunks) {
    let current_line = hunk.additionStart

    for (const content of hunk.hunkContent) {
      if (content.type === 'context') {
        current_line += content.lines.length
      } else if (content.type === 'change') {
        // Additions are the lines that exist in the new file
        for (let i = 0; i < content.additions.length; i++) {
          addition_lines.add(current_line + i)
        }
        current_line += content.additions.length
      }
    }
  }

  return addition_lines
}

/**
 * CodeViewer with diff highlighting - highlights lines that differ from a base version
 */
const DiffCodeViewer = ({
  code,
  base_code,
  language,
  diff_type = 'addition'
}) => {
  const [highlighted_html, set_highlighted_html] = useState('')
  const [error, set_error] = useState(null)

  const normalized_language = useMemo(
    () => normalize_language(language),
    [language]
  )

  // Compute which lines are different from base
  const diff_lines = useMemo(() => {
    if (!base_code || !code || base_code === code) {
      return new Set()
    }

    try {
      const base_file = { name: 'file', contents: base_code }
      const new_file = { name: 'file', contents: code }
      const diff = parseDiffFromFile(base_file, new_file)
      return extract_addition_lines(diff)
    } catch (err) {
      console.error('Failed to compute diff:', err)
      return new Set()
    }
  }, [code, base_code])

  useEffect(() => {
    let is_active = true

    const render_highlight = async () => {
      try {
        set_error(null)

        // Determine the highlight color based on diff_type
        const highlight_color =
          diff_type === 'addition'
            ? 'rgba(0, 137, 123, 0.15)' // teal for ours
            : 'rgba(211, 47, 47, 0.15)' // red for theirs

        const html = await code_to_html(code || '', {
          lang: normalized_language,
          theme: 'solarized-light',
          transformers: [
            {
              pre(node) {
                node.properties.style =
                  'margin: 0; padding: var(--space-sm); font-size: 11px; line-height: 1.4; overflow: auto; color: #657B83; overflow-x: auto;'
              },
              line(node, line) {
                const is_diff_line = diff_lines.has(line)

                // Add line number
                node.children.unshift({
                  type: 'element',
                  tagName: 'span',
                  properties: {
                    class: 'line-number',
                    style:
                      'display: inline-block; width: 3ch; color: #6e7781; text-align: right; padding-right: var(--space-xs); user-select: none;'
                  },
                  children: [{ type: 'text', value: String(line) }]
                })

                // Add diff highlighting
                if (is_diff_line) {
                  node.properties.style = `background-color: ${highlight_color};`
                  node.properties.class =
                    (node.properties.class || '') + ' diff-line'
                }
              }
            }
          ]
        })
        if (is_active) set_highlighted_html(html)
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
  }, [code, normalized_language, diff_lines, diff_type])

  if (error) {
    return (
      <Box sx={{ p: 1 }}>
        <MonospaceText color='var(--color-text-secondary)'>
          {error}
        </MonospaceText>
      </Box>
    )
  }

  if (!highlighted_html) {
    return (
      <Box sx={{ p: 1 }}>
        <MonospaceText color='var(--color-text-secondary)'>
          Loading...
        </MonospaceText>
      </Box>
    )
  }

  return (
    <div style={{ overflow: 'auto' }}>
      <div dangerouslySetInnerHTML={{ __html: highlighted_html }} />
    </div>
  )
}

DiffCodeViewer.propTypes = {
  code: PropTypes.string.isRequired,
  base_code: PropTypes.string,
  language: PropTypes.string.isRequired,
  diff_type: PropTypes.oneOf(['addition', 'deletion'])
}

export default DiffCodeViewer
