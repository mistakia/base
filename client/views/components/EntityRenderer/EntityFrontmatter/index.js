import React, { useState } from 'react'
import PropTypes from 'prop-types'
import {
  Box,
  Divider,
  Table,
  TableBody,
  Collapse,
  Typography
} from '@mui/material'
import { use_frontmatter_fields } from './hooks/use-frontmatter-fields.js'
import { resolve_renderer } from './renderers/index.js'

const table_sx = { '& .MuiTableCell-root': { padding: '4px 8px' } }
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
        ...(is_sticky && { position: 'sticky', top: 16 })
      }}>
      <Box
        sx={{
          p: 1.5,
          borderBottom: '1px solid #e0e0e0',
          position: 'relative'
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
            pr: frontmatter.type ? 10 : 0
          }}>
          {frontmatter.title || frontmatter.name || 'Untitled'}
        </Typography>
      </Box>

      {(frontmatter.description || frontmatter.observations) && (
        <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
          {frontmatter.description && (
            <Typography
              variant='body2'
              sx={{
                color: '#666',
                fontSize: '12px',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                mb:
                  Array.isArray(frontmatter.observations) &&
                  frontmatter.observations.length > 0
                    ? 1
                    : 0
              }}>
              {frontmatter.description}
            </Typography>
          )}

          {Array.isArray(frontmatter.observations) &&
            frontmatter.observations.length > 0 && (
              <Box sx={{ mt: 1 }}>
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
                      mb: 0.3
                    }}>
                    • {text}
                  </Typography>
                ))}
              </Box>
            )}
        </Box>
      )}

      <Box sx={{ p: 1.5 }}>
        {available_always_visible.filter((k) => k !== 'observations').length >
          0 && (
          <Table size='small' sx={{ mb: 1, ...table_sx }}>
            <TableBody>
              {available_always_visible
                .filter((k) => k !== 'observations')
                .map(render_row)}
            </TableBody>
          </Table>
        )}

        {(available_expandable.length > 0 || other_keys.length > 0) && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
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

        <Collapse in={expanded}>
          <Box sx={{ mt: 1 }}>
            {available_expandable.length > 0 && (
              <Table size='small' sx={table_sx}>
                <TableBody>{available_expandable.map(render_row)}</TableBody>
              </Table>
            )}

            {other_keys.length > 0 && (
              <Table size='small' sx={{ mt: 1, ...table_sx }}>
                <TableBody>{other_keys.map(render_row)}</TableBody>
              </Table>
            )}
          </Box>
        </Collapse>
      </Box>
    </Box>
  )
}

EntityFrontmatter.propTypes = {
  frontmatter: PropTypes.object,
  is_sticky: PropTypes.bool
}

export default EntityFrontmatter
