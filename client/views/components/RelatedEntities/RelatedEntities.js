/**
 * RelatedEntities Component
 *
 * Displays a unified list of entity relations (both forward and reverse).
 * Forward relations come from the parent component (parsed from frontmatter or metadata).
 * Reverse relations are fetched from the API.
 * Uses the /api/entities/relations endpoint for fetching reverse relations.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography, IconButton } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import { COLORS } from '@theme/colors.js'
import { api, api_request } from '@core/api/service'
import {
  get_reverse_relation_type,
  sort_relations_by_weighted_score
} from '#libs-shared/entity-relations.mjs'
import RelationItem from './RelationItem.js'

const DEFAULT_VISIBLE_COUNT = 5

const get_container_sx = (is_first) => ({
  position: 'relative',
  minHeight: '60px',
  borderTop: is_first ? 'none' : `1px solid ${COLORS.border}`
})

const header_sx = {
  position: 'absolute',
  top: '8px',
  left: '12px',
  fontSize: '11px',
  fontWeight: 500,
  color: COLORS.text_secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
}

const relations_list_sx = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  pt: '28px',
  pb: '12px',
  px: '12px'
}

const expand_toggle_sx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  py: '4px',
  px: '12px',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: COLORS.background_hover
  }
}

const expand_button_sx = {
  fontSize: '12px',
  color: COLORS.text_secondary,
  padding: '2px 8px',
  borderRadius: '4px',
  '&:hover': {
    backgroundColor: 'transparent'
  }
}

const RelatedEntities = ({
  base_uri,
  forward_relations = [],
  exclude_types = [],
  show_header = true,
  header_text = 'Relations',
  is_first = false,
  token,
  default_collapsed = true,
  visible_count = DEFAULT_VISIBLE_COUNT
}) => {
  const [api_relations, set_api_relations] = useState([])
  const [is_expanded, set_is_expanded] = useState(!default_collapsed)

  const fetch_relations = useCallback(async () => {
    if (!base_uri) {
      return
    }

    try {
      const { request } = api_request(
        api.get_entity_relations,
        { base_uri, direction: 'reverse', limit: 100 },
        token
      )
      const data = await request()
      set_api_relations(data.reverse || [])
    } catch (err) {
      console.error('Error fetching entity relations:', err)
    }
  }, [base_uri, token])

  useEffect(() => {
    fetch_relations()
  }, [fetch_relations])

  // Helper function to create composite key for deduplication and React keys
  const create_relation_key = (relation) => {
    if (relation.malformed || relation.redacted) {
      // Use unique_key for malformed/redacted relations to avoid conflicts
      return relation.unique_key
    }
    // Use relation_type + base_uri as composite key to allow multiple relation types to same entity
    return `${relation.relation_type || 'unknown'}:${relation.base_uri || ''}`
  }

  // Merge, sort, and filter relations - memoized with proper dependencies
  const sorted_relations = useMemo(() => {
    // Convert reverse relations to use semantically correct reverse relation types
    const converted_api = api_relations.map((relation) => {
      if (relation.redacted) {
        return relation
      }
      const reverse_type = get_reverse_relation_type({
        relation_type: relation.relation_type
      })
      return {
        ...relation,
        relation_type: reverse_type || relation.relation_type
      }
    })

    // Deduplicate by composite key (frontmatter takes precedence)
    const relation_map = new Map()

    // Add forward relations first (they take precedence)
    for (const relation of forward_relations) {
      const key = create_relation_key(relation)
      relation_map.set(key, relation)
    }

    // Add API relations (skip if same relation_type + base_uri already exists from frontmatter)
    for (const relation of converted_api) {
      const key = create_relation_key(relation)
      if (!relation_map.has(key)) {
        // Apply exclude_types filter (skip for redacted relations which have no type)
        if (relation.redacted || !exclude_types.includes(relation.type)) {
          relation_map.set(key, relation)
        }
      }
    }

    const merged = Array.from(relation_map.values())
    return sort_relations_by_weighted_score({ relations: merged })
  }, [api_relations, forward_relations, exclude_types])

  // Filter invalid relations (they have the invalid flag set by relation-parser)
  const valid_relations = useMemo(
    () => sorted_relations.filter((r) => !r.invalid),
    [sorted_relations]
  )

  // Determine which relations to display based on collapse state
  const should_collapse = valid_relations.length > visible_count
  const displayed_relations = is_expanded
    ? valid_relations
    : valid_relations.slice(0, visible_count)
  const hidden_count = valid_relations.length - displayed_relations.length

  const handle_toggle_expand = useCallback(() => {
    set_is_expanded((prev) => !prev)
  }, [])

  if (valid_relations.length === 0) {
    return null
  }

  return (
    <Box sx={get_container_sx(is_first)}>
      {show_header && <Typography sx={header_sx}>{header_text}</Typography>}

      <Box sx={relations_list_sx}>
        {displayed_relations.map((relation, idx) => {
          const react_key = create_relation_key(relation)
          return (
            <RelationItem
              key={react_key || idx}
              relation_type={relation.relation_type}
              base_uri={relation.base_uri}
              title={relation.title}
              malformed={relation.malformed}
              raw_string={relation.raw_string}
              redacted={relation.redacted}
            />
          )
        })}
      </Box>

      {should_collapse && (
        <Box sx={expand_toggle_sx} onClick={handle_toggle_expand}>
          <IconButton sx={expand_button_sx} size='small' disableRipple>
            {is_expanded ? (
              <>
                <ExpandLessIcon sx={{ fontSize: 16, mr: 0.5 }} />
                <Typography variant='caption'>Show less</Typography>
              </>
            ) : (
              <>
                <ExpandMoreIcon sx={{ fontSize: 16, mr: 0.5 }} />
                <Typography variant='caption'>
                  Show {hidden_count} more
                </Typography>
              </>
            )}
          </IconButton>
        </Box>
      )}
    </Box>
  )
}

RelatedEntities.propTypes = {
  base_uri: PropTypes.string.isRequired,
  forward_relations: PropTypes.arrayOf(
    PropTypes.shape({
      relation_type: PropTypes.string,
      base_uri: PropTypes.string,
      title: PropTypes.string,
      malformed: PropTypes.bool,
      raw_string: PropTypes.string,
      redacted: PropTypes.bool,
      invalid: PropTypes.bool,
      unique_key: PropTypes.string,
      updated_at: PropTypes.string
    })
  ),
  exclude_types: PropTypes.arrayOf(PropTypes.string),
  show_header: PropTypes.bool,
  header_text: PropTypes.string,
  is_first: PropTypes.bool,
  token: PropTypes.string,
  default_collapsed: PropTypes.bool,
  visible_count: PropTypes.number
}

export default RelatedEntities
