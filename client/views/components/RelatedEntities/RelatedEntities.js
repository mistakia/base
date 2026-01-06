/**
 * RelatedEntities Component
 *
 * Displays related entities grouped by type with expansion support.
 * Uses the /api/entities/relations endpoint for fetching relations.
 */

import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography, CircularProgress } from '@mui/material'

import { COLORS } from '@theme/colors.js'
import { api, api_request } from '@core/api/service'
import RelatedEntitiesGroup from './RelatedEntitiesGroup.js'

const container_sx = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
}

// Priority order for relation types (lower number = higher priority)
const RELATION_TYPE_PRIORITY = {
  creates: 1,
  modifies: 2,
  implements: 3,
  follows: 4,
  subtask_of: 5,
  has_subtask: 6,
  blocked_by: 7,
  blocks: 8,
  precedes: 9,
  succeeds: 10,
  assigned_to: 11,
  calls: 12,
  relates: 20,
  relates_to: 20,
  accesses: 30
}

const get_relation_priority = (relation_type) => {
  if (!relation_type) return 100
  return RELATION_TYPE_PRIORITY[relation_type] || 50
}

const get_header_sx = (is_first) => ({
  fontSize: '11px',
  fontWeight: 500,
  color: COLORS.text_secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  padding: '8px 12px',
  borderTop: is_first ? 'none' : `1px solid ${COLORS.border}`
})

const loading_sx = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '16px',
  color: COLORS.text_secondary,
  fontSize: '12px'
}

const error_sx = {
  padding: '16px',
  color: COLORS.error,
  fontSize: '12px'
}

const RelatedEntities = ({
  base_uri,
  direction = 'both',
  filter_types = [],
  exclude_types = [],
  limit_per_group = 10,
  show_header = true,
  header_text = 'Related Entities',
  is_first = false,
  token
}) => {
  const [loading, set_loading] = useState(true)
  const [error, set_error] = useState(null)
  const [relations, set_relations] = useState({ forward: [], reverse: [] })

  const fetch_relations = useCallback(async () => {
    if (!base_uri) {
      set_loading(false)
      return
    }

    set_loading(true)
    set_error(null)

    try {
      const { request } = api_request(
        api.get_entity_relations,
        { base_uri, direction, limit: 100 },
        token
      )
      const data = await request()
      set_relations(data)
    } catch (err) {
      console.error('Error fetching entity relations:', err)
      set_error(err.message || 'Failed to load relations')
    } finally {
      set_loading(false)
    }
  }, [base_uri, direction, token])

  useEffect(() => {
    fetch_relations()
  }, [fetch_relations])

  // Group entities by type and sort by relation type priority
  const group_by_type = (entities) => {
    const groups = {}
    for (const entity of entities) {
      const type = entity.type || 'unknown'

      // Apply filters
      if (filter_types.length > 0 && !filter_types.includes(type)) continue
      if (exclude_types.includes(type)) continue

      if (!groups[type]) {
        groups[type] = []
      }
      groups[type].push(entity)
    }

    // Sort entities within each group by relation type priority
    for (const type of Object.keys(groups)) {
      groups[type].sort(
        (a, b) =>
          get_relation_priority(a.relation_type) -
          get_relation_priority(b.relation_type)
      )
    }

    return groups
  }

  const forward_groups = group_by_type(relations.forward || [])
  const reverse_groups = group_by_type(relations.reverse || [])

  const has_forward = Object.keys(forward_groups).length > 0
  const has_reverse = Object.keys(reverse_groups).length > 0
  const has_any = has_forward || has_reverse

  if (loading) {
    return (
      <Box sx={loading_sx}>
        <CircularProgress size={14} />
        <span>Loading relations...</span>
      </Box>
    )
  }

  if (error) {
    return <Box sx={error_sx}>Error: {error}</Box>
  }

  if (!has_any) {
    return null // Don't render anything if no relations
  }

  return (
    <Box sx={container_sx}>
      {show_header && (
        <Typography sx={get_header_sx(is_first)}>{header_text}</Typography>
      )}

      {/* Forward relations (this entity -> targets) */}
      {has_forward && (
        <Box>
          {direction === 'both' && (
            <Typography
              sx={{
                fontSize: '11px',
                color: COLORS.text_secondary,
                px: 2,
                py: 0.5,
                fontWeight: 500
              }}>
              References
            </Typography>
          )}
          {Object.entries(forward_groups).map(([type, entities]) => (
            <RelatedEntitiesGroup
              key={`forward-${type}`}
              group_type={type}
              entities={entities}
              limit={limit_per_group}
              show_relation_type={true}
            />
          ))}
        </Box>
      )}

      {/* Reverse relations (sources -> this entity) */}
      {has_reverse && (
        <Box>
          {direction === 'both' && (
            <Typography
              sx={{
                fontSize: '11px',
                color: COLORS.text_secondary,
                px: 2,
                py: 0.5,
                fontWeight: 500
              }}>
              Referenced By
            </Typography>
          )}
          {Object.entries(reverse_groups).map(([type, entities]) => (
            <RelatedEntitiesGroup
              key={`reverse-${type}`}
              group_type={type}
              entities={entities}
              limit={limit_per_group}
              show_relation_type={true}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

RelatedEntities.propTypes = {
  base_uri: PropTypes.string.isRequired,
  direction: PropTypes.oneOf(['forward', 'reverse', 'both']),
  filter_types: PropTypes.arrayOf(PropTypes.string),
  exclude_types: PropTypes.arrayOf(PropTypes.string),
  limit_per_group: PropTypes.number,
  show_header: PropTypes.bool,
  header_text: PropTypes.string,
  is_first: PropTypes.bool,
  token: PropTypes.string
}

export default RelatedEntities
