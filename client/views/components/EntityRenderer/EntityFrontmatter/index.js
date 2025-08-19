import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Table, TableBody, Collapse, Typography } from '@mui/material'
import { use_frontmatter_fields } from './hooks/use-frontmatter-fields.js'
import { resolve_renderer } from './renderers/index.js'
import { parse_relation } from './renderers/relations-field.js'
import { handle_link_click } from '@views/utils/link-processor.js'

const table_sx = {
  '& .MuiTableCell-root': { padding: '4px 8px' },
  '& .MuiTable-root': {
    tableLayout: 'fixed',
    width: '100%'
  },
  '& .MuiTableContainer-root': {
    overflow: 'auto',
    maxWidth: '100%'
  }
}
const chip_style = { textTransform: 'capitalize' }
const expand_button_sx = {
  background: 'none',
  border: 'none',
  color: '#0366d6',
  fontSize: '12px',
  padding: '4px 8px',
  cursor: 'pointer',
  transition: 'color 0.2s ease',
  fontFamily: 'inherit',
  '&:hover': { color: '#0451a5', textDecoration: 'underline' }
}

const EntityFrontmatter = ({ frontmatter, is_sticky = false }) => {
  const [expanded, set_expanded] = useState(false)
  if (!frontmatter) return null

  const { available_always_visible, available_expandable, other_keys } =
    use_frontmatter_fields({ frontmatter })

  const render_row = (key_name) => {
    const Renderer = resolve_renderer({ key_name })
    return (
      <Renderer
        key={key_name}
        key_name={key_name}
        value={frontmatter[key_name]}
      />
    )
  }

  return (
    <Box
      sx={{
        border: '1px solid #e0e0e0',
        borderRadius: 1,
        bgcolor: '#fafafa',
        maxWidth: '100%',
        minWidth: '280px',
        overflow: 'hidden',
        ...(is_sticky && { position: 'sticky', top: 16 })
      }}>
      <Box
        sx={{
          p: 1.5,
          borderBottom: '1px solid #e0e0e0',
          position: 'relative',
          overflow: 'hidden'
        }}>
        {frontmatter.type && (
          <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
            <div className='chip' style={chip_style}>
              {frontmatter.type}
            </div>
          </Box>
        )}

        <Typography
          variant='h6'
          sx={{
            fontSize: '14px',
            fontWeight: 600,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            lineHeight: 1.4,
            pr: frontmatter.type ? 10 : 0,
            maxWidth: '100%'
          }}>
          {frontmatter.title || frontmatter.name || 'Untitled'}
        </Typography>
      </Box>

      {frontmatter.description && (
        <Box
          sx={{
            p: 1.5,
            borderBottom: '1px solid #e0e0e0',
            overflow: 'hidden'
          }}>
          <Typography
            variant='body2'
            sx={{
              color: '#666',
              fontSize: '12px',
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              maxWidth: '100%'
            }}>
            {frontmatter.description}
          </Typography>
        </Box>
      )}

      {Array.isArray(frontmatter.observations) &&
        frontmatter.observations.length > 0 && (
          <Box
            sx={{
              p: 1.5,
              borderBottom: '1px solid #e0e0e0',
              overflow: 'hidden'
            }}>
            <Typography
              variant='caption'
              sx={{
                display: 'block',
                fontSize: '10px',
                fontWeight: 600,
                color: '#999',
                mb: 0.5
              }}>
              OBSERVATIONS
            </Typography>
            {frontmatter.observations.map((text, idx) => (
              <Typography
                key={idx}
                variant='caption'
                sx={{
                  display: 'block',
                  fontSize: '11px',
                  color: '#555',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  maxWidth: '100%',
                  mb: 0.3
                }}>
                • {text}
              </Typography>
            ))}
          </Box>
        )}

      {Array.isArray(frontmatter.relations) &&
        frontmatter.relations.length > 0 && (
          <Box
            sx={{
              p: 1.5,
              borderBottom: '1px solid #e0e0e0',
              overflow: 'hidden'
            }}>
            {frontmatter.relations.map((relation, idx) => {
              const parsed = parse_relation(relation)
              if (!parsed) {
                return (
                  <Typography
                    key={idx}
                    variant='caption'
                    sx={{
                      display: 'block',
                      fontSize: '11px',
                      color: '#555',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word',
                      maxWidth: '100%',
                      mb: 0.3
                    }}>
                    • {relation}
                  </Typography>
                )
              }

              return (
                <Typography
                  key={idx}
                  variant='caption'
                  sx={{
                    display: 'block',
                    fontSize: '11px',
                    color: '#555',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    maxWidth: '100%',
                    mb: 0.3
                  }}>
                  <span style={{ fontWeight: 600, color: '#666' }}>
                    {parsed.relation_type}
                  </span>{' '}
                  <a
                    href={parsed.client_path}
                    style={{
                      color: '#0366d6',
                      textDecoration: 'none',
                      borderBottom: '1px solid transparent',
                      transition: 'border-color 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.borderBottomColor = '#0366d6'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.borderBottomColor = 'transparent'
                    }}
                    onClick={handle_link_click}
                    data-internal-link='true'>
                    {parsed.filename}
                  </a>
                </Typography>
              )
            })}
          </Box>
        )}

      <Box sx={{ overflow: 'hidden' }}>
        {available_always_visible.length > 0 && (
          <Box sx={{ overflow: 'auto', maxWidth: '100%' }}>
            <Table size='small' sx={{ ...table_sx }}>
              <TableBody>{available_always_visible.map(render_row)}</TableBody>
            </Table>
          </Box>
        )}

        <Collapse in={expanded}>
          <Box sx={{ mt: 1, overflow: 'hidden' }}>
            {available_expandable.length > 0 && (
              <Box sx={{ overflow: 'auto', maxWidth: '100%' }}>
                <Table size='small' sx={table_sx}>
                  <TableBody>{available_expandable.map(render_row)}</TableBody>
                </Table>
              </Box>
            )}

            {other_keys.length > 0 && (
              <Box sx={{ overflow: 'auto', maxWidth: '100%' }}>
                <Table size='small' sx={{ mt: 1, ...table_sx }}>
                  <TableBody>{other_keys.map(render_row)}</TableBody>
                </Table>
              </Box>
            )}
          </Box>
        </Collapse>

        {(available_expandable.length > 0 || other_keys.length > 0) && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
              <button
                onClick={() => set_expanded(!expanded)}
                style={{ all: 'unset' }}>
                <Box component='span' sx={expand_button_sx}>
                  {expanded ? 'show less' : 'show more'}
                </Box>
              </button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}

EntityFrontmatter.propTypes = {
  frontmatter: PropTypes.object,
  is_sticky: PropTypes.bool
}

export default EntityFrontmatter
