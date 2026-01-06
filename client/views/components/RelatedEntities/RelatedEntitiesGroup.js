/**
 * RelatedEntitiesGroup Component
 *
 * Displays a group of related entities with expand/collapse functionality.
 */

import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Collapse } from '@mui/material'

import { COLORS } from '@theme/colors.js'
import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'

const group_container_sx = {
  px: 2,
  py: 0.5
}

const type_label_sx = {
  fontSize: '11px',
  fontWeight: 600,
  color: COLORS.text_secondary,
  textTransform: 'capitalize',
  marginBottom: '4px'
}

const entity_list_sx = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
}

const entity_item_sx = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  lineHeight: '1.4',
  minHeight: '20px',
  color: COLORS.text_secondary
}

const link_sx = {
  color: COLORS.icon_link,
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'color 0.2s ease',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '300px',
  lineHeight: 'inherit',
  '&:hover': {
    color: COLORS.info
  }
}

const relation_type_sx = {
  fontSize: '10px',
  color: COLORS.text_secondary,
  fontStyle: 'italic',
  flexShrink: 0
}

const expand_button_sx = {
  all: 'unset',
  fontSize: '11px',
  color: COLORS.icon_link,
  cursor: 'pointer',
  padding: '2px 4px',
  marginTop: '4px',
  '&:hover': {
    textDecoration: 'underline'
  }
}

const get_entity_link = (base_uri) => {
  try {
    return convert_base_uri_to_path(base_uri)
  } catch (error) {
    // Fallback for file references
    if (base_uri.startsWith('file:')) {
      return `/files?path=${encodeURIComponent(base_uri.replace('file:', ''))}`
    }
    return '#'
  }
}

const get_display_title = (entity) => {
  if (entity.title) return entity.title

  // Extract filename from base_uri
  const base_uri = entity.base_uri || ''
  const parts = base_uri.split('/')
  const filename = parts[parts.length - 1] || base_uri
  return filename.replace('.md', '')
}

const RelatedEntitiesGroup = ({
  group_type,
  entities,
  limit = 10,
  show_relation_type = false
}) => {
  const [expanded, set_expanded] = useState(false)

  if (!entities || entities.length === 0) return null

  const visible_entities = expanded ? entities : entities.slice(0, limit)
  const has_more = entities.length > limit
  const remaining_count = entities.length - limit

  return (
    <Box sx={group_container_sx}>
      <Box sx={type_label_sx}>{group_type}s</Box>
      <Box sx={entity_list_sx}>
        {visible_entities.map((entity, idx) => (
          <Box key={entity.base_uri || idx} sx={entity_item_sx}>
            {show_relation_type && entity.relation_type && (
              <Box component='span' sx={relation_type_sx}>
                {entity.relation_type}
              </Box>
            )}
            <a
              href={get_entity_link(entity.base_uri)}
              style={link_sx}
              data-internal-link='true'
              title={entity.base_uri}>
              {get_display_title(entity)}
            </a>
          </Box>
        ))}

        {has_more && (
          <Collapse in={!expanded}>
            <button onClick={() => set_expanded(true)} style={expand_button_sx}>
              Show {remaining_count} more...
            </button>
          </Collapse>
        )}

        {expanded && has_more && (
          <button onClick={() => set_expanded(false)} style={expand_button_sx}>
            Show less
          </button>
        )}
      </Box>
    </Box>
  )
}

RelatedEntitiesGroup.propTypes = {
  group_type: PropTypes.string.isRequired,
  entities: PropTypes.arrayOf(
    PropTypes.shape({
      base_uri: PropTypes.string,
      title: PropTypes.string,
      type: PropTypes.string,
      relation_type: PropTypes.string
    })
  ).isRequired,
  limit: PropTypes.number,
  show_relation_type: PropTypes.bool
}

export default RelatedEntitiesGroup
