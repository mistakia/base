import React from 'react'
import PropTypes from 'prop-types'
import { Typography, TableRow, TableCell } from '@mui/material'
import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'

// Parse relation string and extract relation type and base URI
export const parse_relation = (relation_string) => {
  // Match pattern: "relation_type [[scheme:path]]"
  const match = relation_string.match(/^(.+?)\s+\[\[(sys|user):([^\]]+)\]\]$/)
  if (!match) return null

  const [, relation_type, scheme, path] = match
  const base_uri = `${scheme}:${path}`
  const client_path = convert_base_uri_to_path(base_uri)

  // Extract filename from path (remove .md extension)
  const filename = path.split('/').pop().replace(/\.md$/, '')

  return {
    relation_type: relation_type.trim(),
    filename,
    client_path
  }
}

const relation_cell_sx = {
  padding: '4px 8px',
  width: '100%',
  fontSize: '10px',
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
  wordBreak: 'break-word'
}

export const RelationsField = ({ key_name, value }) => {
  if (!Array.isArray(value)) return null

  return (
    <>
      {value.map((relation, idx) => {
        const parsed = parse_relation(relation)
        if (!parsed) {
          // Fallback for malformed relations
          return (
            <TableRow key={idx}>
              <TableCell sx={relation_cell_sx} colSpan={2}>
                <Typography variant='caption' sx={{ fontSize: '10px' }}>
                  {relation}
                </Typography>
              </TableCell>
            </TableRow>
          )
        }

        return (
          <TableRow key={idx}>
            <TableCell sx={relation_cell_sx} colSpan={2}>
              <Typography variant='caption' sx={{ fontSize: '10px' }}>
                <span style={{ fontWeight: 600, color: '#666' }}>
                  {parsed.relation_type}
                </span>{' '}
                <a
                  href={parsed.client_path}
                  target='_blank'
                  rel='noopener noreferrer'
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
                  data-internal-link='true'>
                  {parsed.filename}
                </a>
              </Typography>
            </TableCell>
          </TableRow>
        )
      })}
    </>
  )
}

RelationsField.propTypes = {
  key_name: PropTypes.string.isRequired,
  value: PropTypes.array.isRequired
}
