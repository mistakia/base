/**
 * RelationItem Component
 *
 * Displays a single relation item with relation type and entity link.
 * Used for both forward (frontmatter) and reverse (API) relations.
 */

import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import { COLORS } from '@theme/colors.js'
import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'

const item_container_sx = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: '20px',
  lineHeight: '1.4'
}

const relation_type_sx = {
  fontSize: '10px',
  color: COLORS.text_secondary,
  fontWeight: 600,
  flexShrink: 0
}

const link_sx = {
  fontSize: '12px',
  color: COLORS.icon_link,
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'color 0.2s ease',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '300px'
}

const get_entity_link = (base_uri) => {
  try {
    return convert_base_uri_to_path(base_uri)
  } catch (error) {
    // Fallback for file references
    if (base_uri && base_uri.startsWith('file:')) {
      return `/files?path=${encodeURIComponent(base_uri.replace('file:', ''))}`
    }
    return '#'
  }
}

const get_display_title = ({ title, base_uri }) => {
  if (title) return title

  // Extract filename from base_uri
  if (!base_uri) return 'Unknown'
  const parts = base_uri.split('/')
  const filename = parts[parts.length - 1] || base_uri
  return filename.replace('.md', '')
}

const malformed_relation_sx = {
  fontSize: '12px',
  color: COLORS.error,
  fontStyle: 'italic',
  padding: '2px 4px',
  backgroundColor: 'rgba(255, 0, 0, 0.05)',
  borderRadius: '2px',
  border: '1px solid rgba(255, 0, 0, 0.2)'
}

const redacted_relation_sx = {
  fontSize: '12px',
  color: COLORS.text_tertiary,
  padding: '2px 4px',
  backgroundColor: COLORS.surface_hover,
  borderRadius: '2px',
  userSelect: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '300px'
}

const RelationItem = ({
  relation_type,
  base_uri,
  title,
  malformed,
  raw_string,
  redacted
}) => {
  // Handle redacted relations (permission-denied content)
  if (redacted) {
    return (
      <Box sx={item_container_sx}>
        {relation_type && (
          <Box component='span' sx={relation_type_sx}>
            {relation_type}
          </Box>
        )}
        <Box
          component='span'
          sx={redacted_relation_sx}
          title='Redacted - insufficient permissions'>
          {base_uri || '████████'}
        </Box>
      </Box>
    )
  }

  // Handle malformed relations
  if (malformed) {
    return (
      <Box sx={item_container_sx}>
        <Box
          component='span'
          sx={malformed_relation_sx}
          title='Malformed relation - check syntax'>
          {raw_string}
        </Box>
      </Box>
    )
  }

  if (!base_uri) return null

  const display_title = get_display_title({ title, base_uri })
  const href = get_entity_link(base_uri)

  return (
    <Box sx={item_container_sx}>
      {relation_type && (
        <Box component='span' sx={relation_type_sx}>
          {relation_type}
        </Box>
      )}
      <a
        href={href}
        style={link_sx}
        data-internal-link='true'
        title={base_uri}
        onMouseEnter={(event) => {
          event.target.style.color = COLORS.info
        }}
        onMouseLeave={(event) => {
          event.target.style.color = COLORS.icon_link
        }}>
        {display_title}
      </a>
    </Box>
  )
}

RelationItem.propTypes = {
  relation_type: PropTypes.string,
  base_uri: PropTypes.string,
  title: PropTypes.string,
  malformed: PropTypes.bool,
  raw_string: PropTypes.string,
  redacted: PropTypes.bool
}

export default RelationItem
