import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material'
import { ExpandLess, ExpandMore } from '@mui/icons-material'
import { COLORS } from '@theme/colors.js'

import Button from '@components/primitives/Button'
import BaseToolComponent from '@views/components/ThreadTimelineView/ToolComponents/BaseToolComponent.js'
import { MonospaceText } from '@views/components/primitives/styled'
import { code_to_html } from '@core/shiki-highlighter.js'
import { sanitize_html } from '@views/utils/sanitize-html.mjs'

const DatabaseTool = ({ tool_call_event, tool_result_event }) => {
  const [visible_rows_count, set_visible_rows_count] = useState(3)
  const [show_full_sql, set_show_full_sql] = useState(false)
  const [highlighted_sql_full, set_highlighted_sql_full] = useState('')
  const [highlighted_sql_truncated, set_highlighted_sql_truncated] =
    useState('')
  const get_database_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const sql = params.sql || 'unknown query'
    return { sql }
  }

  const clean_error_message = (raw_message) => {
    if (!raw_message) return ''
    let message =
      typeof raw_message === 'string' ? raw_message : String(raw_message)
    message = message.trim()
    // Strip common MCP prefix: "MCP error -32603: ..."
    message = message.replace(/^MCP\s+error\s*-?\d+:\s*/i, '')
    // Strip generic leading "Error:" prefix if present
    message = message.replace(/^error:\s*/i, '')
    return message.trim()
  }

  useEffect(() => {
    const { sql } = get_database_info()
    const max_chars = 100
    const truncated_sql =
      sql && sql.length > max_chars ? `${sql.slice(0, max_chars - 4)} ...` : sql

    const highlight_sql = async () => {
      try {
        const common_transformers = [
          {
            pre(node) {
              node.properties.style =
                'margin: 0; padding: 0; background: transparent; border: none; display: inline; white-space: pre-wrap; line-height: 1.25; font-size: 12px;'
            },
            code(node) {
              node.properties.style = 'white-space: inherit;'
            }
          }
        ]

        const [full_html, truncated_html] = await Promise.all([
          code_to_html(sql || '', {
            lang: 'sql',
            theme: 'solarized-light',
            transformers: common_transformers
          }),
          code_to_html(truncated_sql || '', {
            lang: 'sql',
            theme: 'solarized-light',
            transformers: common_transformers
          })
        ])

        set_highlighted_sql_full(sanitize_html(full_html))
        set_highlighted_sql_truncated(sanitize_html(truncated_html))
      } catch (err) {
        // fallback: clear highlighted htmls
        set_highlighted_sql_full('')
        set_highlighted_sql_truncated('')
      }
    }

    highlight_sql()
  }, [tool_call_event])

  const render_custom_header = () => {
    const { sql } = get_database_info()
    const has_highlight =
      (show_full_sql ? highlighted_sql_full : highlighted_sql_truncated) !== ''
    const prefix_html =
      '<span style="font-family: var(--font-family-mono); font-weight: 700; color: var(--color-text-secondary); margin-right: 8px; font-size: 13px;">&gt;</span>'
    const combined_html = `${prefix_html}${show_full_sql ? highlighted_sql_full : highlighted_sql_truncated}`
    const query_result = parse_query_result()
    const is_error =
      query_result &&
      (query_result.type === 'error' ||
        (query_result.type === 'message' && query_result.is_error))
    const rows =
      query_result && query_result.type === 'table' ? query_result.rows : null
    const rows_count = rows ? rows.length : 0
    const header_height_px = 34
    const row_height_px = 28
    const table_height_px =
      header_height_px + row_height_px * (visible_rows_count || 3)

    return (
      <Box
        sx={{
          border: `1px solid ${COLORS.border_light}`,
          borderRadius: 1,
          bgcolor: COLORS.surface_secondary,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          mb: 'var(--space-sm)',
          position: 'relative'
        }}>
        <Box sx={{ p: 2, bgcolor: COLORS.surface_secondary }}>
          {has_highlight ? (
            <Box
              onClick={() => set_show_full_sql(!show_full_sql)}
              title={show_full_sql ? 'hide full sql' : 'show full sql'}
              sx={{
                cursor: 'pointer',
                flex: 1,
                minWidth: 0,
                '& pre': {
                  m: 0,
                  p: 0,
                  background: 'transparent !important',
                  fontSize: '13px',
                  lineHeight: 1.4,
                  fontFamily: 'var(--font-family-mono)'
                },
                '& code': {
                  background: 'transparent !important',
                  padding: '0 !important'
                },
                overflowX: 'auto'
              }}
              dangerouslySetInnerHTML={{ __html: combined_html }}
            />
          ) : (
            <Box
              onClick={() => set_show_full_sql(!show_full_sql)}
              title={show_full_sql ? 'hide full sql' : 'show full sql'}
              sx={{ cursor: 'pointer', flex: 1, minWidth: 0 }}>
              <MonospaceText
                variant='xs'
                component='pre'
                sx={{
                  m: 0,
                  display: 'inline',
                  whiteSpace: 'pre-wrap',
                  fontSize: '13px',
                  lineHeight: 1.4,
                  fontFamily: 'var(--font-family-mono)'
                }}>
                {`> ${sql}`}
              </MonospaceText>
            </Box>
          )}
        </Box>

        {is_error && (
          <Box
            sx={{
              mt: 0,
              borderTop: '1px solid',
              borderTopColor: 'error.light',
              bgcolor: 'transparent',
              maxHeight: '200px',
              overflow: 'auto'
            }}>
            <Box
              component='pre'
              sx={{
                fontFamily: 'Monaco, Menlo, monospace',
                fontSize: '11px',
                m: 0,
                p: 1,
                whiteSpace: 'pre-wrap',
                color: 'error.main'
              }}>
              {clean_error_message(query_result.message)}
            </Box>
          </Box>
        )}

        {rows && (
          <Box sx={{ mt: 0 }}>
            <TableContainer
              component={Paper}
              sx={{
                height: rows_count < 3 ? 'auto' : `${table_height_px}px`,
                borderTop: `1px solid ${COLORS.border_light}`,
                borderLeft: 0,
                borderRight: 0,
                borderBottom: 0,
                borderRadius: 0,
                boxShadow: 'none',
                overflowY: rows_count < 3 ? 'visible' : 'auto'
              }}>
              <Table size='small' stickyHeader>
                <TableHead>
                  <TableRow>
                    {Object.keys(rows[0] || {}).map((column) => (
                      <TableCell
                        key={column}
                        sx={{
                          fontWeight: 'bold',
                          fontSize: '11px',
                          bgcolor: 'grey.100',
                          fontFamily: 'Monaco, Menlo, monospace'
                        }}>
                        {column}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow
                      key={idx}
                      sx={{
                        '&:nth-of-type(odd)': { bgcolor: 'grey.50' },
                        '& td': { fontSize: '11px', py: 0.5 }
                      }}>
                      {Object.keys(rows[0] || {}).map((column) => (
                        <TableCell
                          key={column}
                          sx={{
                            fontFamily: 'Monaco, Menlo, monospace',
                            whiteSpace: 'nowrap'
                          }}>
                          {row[column] === null ? (
                            <span
                              style={{
                                fontStyle: 'italic',
                                color: COLORS.text_secondary,
                                fontSize: '10px'
                              }}>
                              NULL
                            </span>
                          ) : typeof row[column] === 'object' ? (
                            <pre
                              style={{
                                margin: 0,
                                fontSize: '10px',
                                maxWidth: '200px',
                                overflow: 'auto'
                              }}>
                              {JSON.stringify(row[column], null, 2)}
                            </pre>
                          ) : (
                            String(row[column])
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {rows_count > 3 && (
              <Box
                sx={{
                  position: 'absolute',
                  right: 8,
                  bottom: 8
                }}>
                <Button
                  variant='secondary'
                  size='small'
                  icon
                  aria-label='toggle rows height'
                  onClick={() =>
                    set_visible_rows_count(visible_rows_count === 3 ? 10 : 3)
                  }>
                  {visible_rows_count === 3 ? (
                    <ExpandMore fontSize='inherit' />
                  ) : (
                    <ExpandLess fontSize='inherit' />
                  )}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  }

  const parse_query_result = () => {
    if (!tool_result_event) return null

    const content = tool_result_event?.content || {}
    if (content.error) {
      const message =
        typeof content.error === 'string'
          ? content.error
          : JSON.stringify(content.error)
      return { type: 'error', message, is_error: true }
    }

    const raw_result = content.result

    if (
      Array.isArray(raw_result) &&
      raw_result.every((r) => typeof r?.text === 'string')
    ) {
      const combined_text = raw_result.map((r) => r.text).join('')
      try {
        const parsed = JSON.parse(combined_text)
        if (Array.isArray(parsed)) {
          return { rows: parsed, type: 'table' }
        }
        return { data: parsed, type: 'json' }
      } catch (e) {
        const lowered = combined_text.toLowerCase()
        const is_error =
          lowered.includes('error') ||
          lowered.includes('failed') ||
          lowered.includes('syntax error')
        return {
          type: is_error ? 'error' : 'message',
          message: combined_text,
          is_error
        }
      }
    }

    if (typeof raw_result === 'string') {
      try {
        const parsed = JSON.parse(raw_result)
        if (Array.isArray(parsed)) {
          return { rows: parsed, type: 'table' }
        }
        return { data: parsed, type: 'json' }
      } catch {
        const lowered = raw_result.toLowerCase()
        const is_error =
          lowered.includes('error') ||
          lowered.includes('failed') ||
          lowered.includes('syntax error')
        return {
          type: is_error ? 'error' : 'message',
          message: raw_result,
          is_error
        }
      }
    }

    if (Array.isArray(raw_result)) {
      return { rows: raw_result, type: 'table' }
    }

    return { data: raw_result, type: 'json' }
  }

  const render_query_result = () => {
    return null
  }

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      header={render_custom_header()}>
      {render_query_result()}
    </BaseToolComponent>
  )
}

DatabaseTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default DatabaseTool
