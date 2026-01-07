/**
 * RelatedEntities Component
 *
 * Displays a unified list of entity relations (both forward and reverse).
 * Forward relations come from frontmatter, reverse relations from the API.
 * Uses the /api/entities/relations endpoint for fetching reverse relations.
 */

import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography } from '@mui/material'

import { COLORS } from '@theme/colors.js'
import { api, api_request } from '@core/api/service'
import {
  get_reverse_relation_type,
  get_relation_priority
} from '#libs-shared/entity-relations.mjs'
import RelationItem from './RelationItem.js'

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

const RelatedEntities = ({
  base_uri,
  frontmatter_relations = [],
  exclude_types = [],
  show_header = true,
  header_text = 'Relations',
  is_first = false,
  token
}) => {
  const [api_relations, set_api_relations] = useState([])

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

  // Convert reverse relations to use semantically correct reverse relation types
  const convert_reverse_relations = (reverse_relations) => {
    return reverse_relations.map((relation) => {
      const reverse_type = get_reverse_relation_type({
        relation_type: relation.relation_type
      })
      return {
        ...relation,
        relation_type: reverse_type || relation.relation_type
      }
    })
  }

  // Merge frontmatter and API relations, deduplicate by composite key (relation_type + base_uri)
  const merge_relations = () => {
    const converted_api = convert_reverse_relations(api_relations)

    // Create a map for deduplication using composite key (frontmatter takes precedence)
    const relation_map = new Map()

    // Helper function to create composite key for deduplication
    const create_relation_key = (relation) => {
      if (relation.malformed) {
        // Use unique_key for malformed relations to avoid conflicts
        return relation.unique_key
      }
      // Use relation_type + base_uri as composite key to allow multiple relation types to same entity
      return `${relation.relation_type || 'unknown'}:${relation.base_uri || ''}`
    }

    // Add frontmatter relations first (they take precedence)
    for (const relation of frontmatter_relations) {
      const key = create_relation_key(relation)
      relation_map.set(key, relation)
    }

    // Add API relations (skip if same relation_type + base_uri already exists from frontmatter)
    for (const relation of converted_api) {
      const key = create_relation_key(relation)
      if (!relation_map.has(key)) {
        // Apply exclude_types filter
        if (!exclude_types.includes(relation.type)) {
          relation_map.set(key, relation)
        }
      }
    }

    return Array.from(relation_map.values())
  }

  // Sort relations by priority
  const sort_relations = (relations) => {
    return [...relations].sort(
      (a, b) =>
        get_relation_priority({ relation_type: a.relation_type }) -
        get_relation_priority({ relation_type: b.relation_type })
    )
  }

  const merged_relations = merge_relations()
  const sorted_relations = sort_relations(merged_relations)

  if (sorted_relations.length === 0) {
    return null
  }

  return (
    <Box sx={get_container_sx(is_first)}>
      {show_header && <Typography sx={header_sx}>{header_text}</Typography>}

      <Box sx={relations_list_sx}>
        {sorted_relations.map((relation, idx) => {
          // Generate React key using same logic as deduplication to ensure uniqueness
          const react_key = relation.malformed
            ? relation.unique_key
            : `${relation.relation_type || 'unknown'}:${relation.base_uri || ''}`

          return (
            <RelationItem
              key={react_key || idx}
              relation_type={relation.relation_type}
              base_uri={relation.base_uri}
              title={relation.title}
              malformed={relation.malformed}
              raw_string={relation.raw_string}
            />
          )
        })}
      </Box>
    </Box>
  )
}

RelatedEntities.propTypes = {
  base_uri: PropTypes.string.isRequired,
  frontmatter_relations: PropTypes.arrayOf(
    PropTypes.shape({
      relation_type: PropTypes.string,
      base_uri: PropTypes.string,
      title: PropTypes.string
    })
  ),
  exclude_types: PropTypes.arrayOf(PropTypes.string),
  show_header: PropTypes.bool,
  header_text: PropTypes.string,
  is_first: PropTypes.bool,
  token: PropTypes.string
}

export default RelatedEntities
