import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography, Collapse } from '@mui/material'

import { COLORS } from '@theme/colors.js'
import {
  MetadataContainer,
  MetadataRow,
  TwoCellRow,
  DateDisplay
} from '@views/components/MetadataDisplay'
import RelatedEntities from '@views/components/RelatedEntities'
import {
  EditableStatusField,
  EditablePriorityField
} from '@views/components/InlineSelect'
import { entity_field_config } from './field-config.js'
import { parse_relations_for_display } from '#libs-shared/relation-parser.mjs'

const categorize_fields = (frontmatter) => {
  const entity_type = frontmatter.type || 'default'
  const config = entity_field_config[entity_type] || entity_field_config.default

  const {
    title,
    name,
    type,
    description,
    relations,
    observations,
    ...other_fields
  } = frontmatter

  const always_visible = {}
  const expandable = {}
  const uncategorized = {}

  Object.entries(other_fields).forEach(([key, value]) => {
    if (config.always_visible.includes(key)) {
      always_visible[key] = value
    } else if (config.expandable.includes(key)) {
      expandable[key] = value
    } else {
      uncategorized[key] = value
    }
  })

  return { always_visible, expandable, uncategorized }
}

const format_field_value = (value) => {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value) || typeof value === 'object')
    return JSON.stringify(value, null, 2)
  return String(value)
}

const format_field_label = (key) => {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const EntityTitle = ({ title, type, description, markdown }) => {
  // Normalize content for comparison by removing extra whitespace and newlines
  const normalize_content = (content) => {
    if (!content) return ''
    return content.replace(/\s+/g, ' ').trim()
  }

  const should_hide_description =
    description &&
    markdown &&
    normalize_content(description) === normalize_content(markdown)

  return (
    <Box sx={{ px: 3, pt: 3, pb: 2 }}>
      <Box sx={{ position: 'relative' }}>
        {type && (
          <Box sx={{ position: 'absolute', top: 0, right: 0 }}>
            <span
              className='chip'
              style={{
                textTransform: 'capitalize',
                fontSize: '11px',
                padding: '4px 8px'
              }}>
              {type}
            </span>
          </Box>
        )}

        <Typography
          variant='h6'
          sx={{
            fontSize: '20px',
            fontWeight: 'bold',
            lineHeight: '1.2',
            margin: 0,
            marginBottom: description ? '8px' : '16px',
            pr: type ? 10 : 0,
            wordBreak: 'break-word'
          }}>
          {title || 'Untitled'}
        </Typography>

        {description && !should_hide_description && (
          <Typography
            variant='body2'
            sx={{
              fontSize: '14px',
              color: COLORS.text_secondary,
              lineHeight: '1.4',
              margin: '0 0 16px 0',
              wordBreak: 'break-word'
            }}>
            {description}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

EntityTitle.propTypes = {
  title: PropTypes.string,
  type: PropTypes.string,
  description: PropTypes.string,
  markdown: PropTypes.string
}

/**
 * Determine if RelatedEntities will render content
 * @param {string} base_uri - Entity base URI
 * @param {Array} forward_relations - Parsed forward relations
 * @returns {boolean} True if RelatedEntities will render content
 */
const will_related_entities_render = (base_uri, forward_relations) => {
  // RelatedEntities won't render if no base_uri
  if (!base_uri) return false

  // If there are forward relations, it will render
  if (forward_relations && forward_relations.length > 0) return true

  // If there are no forward relations, we can't know for sure without
  // fetching API data, but we should assume it might render to be safe
  // with border styling (better to have an extra border than missing one)
  return true
}

// observations rendering styles
const observations_container_sx = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
}
const observation_line_sx = {
  fontSize: '12px',
  color: COLORS.text_secondary,
  lineHeight: 1.6,
  whiteSpace: 'normal',
  wordBreak: 'break-word'
}
const observation_label_sx = {
  fontWeight: 'bold',
  color: COLORS.text,
  mr: '6px'
}
const observation_content_sx = { color: COLORS.text_secondary }

// bracket label followed by content
const bracket_and_content_regex = /(\[[^\]]+\])\s*(.*)/

const ObservationsSection = ({ observations }) => {
  if (!Array.isArray(observations) || observations.length === 0) return null

  const parse_observation_text = (text) => {
    // Match text in brackets followed by content
    const match = text.match(bracket_and_content_regex)

    if (match) {
      const [, bracket_text, content] = match
      return { bracket_text, content: content.trim() }
    }

    // If no brackets found, return the whole text as content
    return { bracket_text: null, content: text }
  }

  return (
    <MetadataRow
      label='Observations'
      value={
        <Box sx={observations_container_sx}>
          {observations.map((text, idx) => {
            const { bracket_text, content } = parse_observation_text(text)

            return (
              <Box key={idx} sx={observation_line_sx}>
                {bracket_text ? (
                  <Box component='span' sx={observation_label_sx}>
                    {bracket_text}
                  </Box>
                ) : null}
                <Box component='span' sx={observation_content_sx}>
                  {content}
                </Box>
              </Box>
            )
          })}
        </Box>
      }
    />
  )
}

ObservationsSection.propTypes = {
  observations: PropTypes.array
}

/**
 * Compute base_uri from file path
 * @param {string} path - File path like "task/my-task.md" or "/task/my-task.md"
 * @returns {string|null} Base URI like "user:task/my-task.md" or "sys:system/schema/task.md"
 */
const compute_base_uri_from_path = (path) => {
  if (!path) return null

  // Strip leading slashes
  const normalized_path = path.replace(/^\/+/, '')

  // System entities use sys: prefix
  if (normalized_path.startsWith('system/')) {
    return `sys:${normalized_path}`
  }

  // User entities use user: prefix
  return `user:${normalized_path}`
}

const EntityFrontmatter = ({
  frontmatter,
  is_sticky = false,
  markdown,
  path
}) => {
  const [expanded, set_expanded] = useState(false)

  if (!frontmatter) return null

  const { title, name, type, description, relations, observations } =
    frontmatter

  // Use base_uri from frontmatter if available, otherwise compute from path
  const base_uri = frontmatter.base_uri || compute_base_uri_from_path(path)

  // Categorize fields based on entity type configuration
  const { always_visible, expandable, uncategorized } =
    categorize_fields(frontmatter)

  const display_title = title || name
  const has_expandable_content =
    Object.keys(expandable).length > 0 || Object.keys(uncategorized).length > 0

  return (
    <MetadataContainer
      background_color='white'
      border_radius={2}
      sx={{
        marginTop: '16px',
        ...(is_sticky && { position: 'sticky', top: 16 })
      }}>
      <EntityTitle
        title={display_title}
        type={type}
        description={description}
        markdown={markdown}
      />

      {/* Core metadata section */}
      <Box>
        {observations && <ObservationsSection observations={observations} />}

        {/* Unified relations - forward from frontmatter + reverse from API */}
        {base_uri && (
          <RelatedEntities
            base_uri={base_uri}
            forward_relations={parse_relations_for_display({ relations })}
            exclude_types={['file', 'directory']}
            show_header={true}
            header_text='Relations'
          />
        )}

        {/* Always visible fields */}
        {Object.entries(always_visible).map(([key, value], index) => {
          // Special handling for date fields
          if (key === 'created_at' || key === 'updated_at') {
            return null // Handle dates separately below
          }

          const parsed_forward_relations = parse_relations_for_display({
            relations
          })
          const has_content_above =
            observations ||
            will_related_entities_render(base_uri, parsed_forward_relations)

          // Render editable fields for task status and priority
          if (type === 'task' && key === 'status' && base_uri) {
            return (
              <MetadataRow
                key={key}
                label={format_field_label(key)}
                value={
                  <EditableStatusField
                    value={value}
                    base_uri={base_uri}
                    context='entity-page'
                  />
                }
                border_style='compact'
                is_first={index === 0 && !has_content_above}
              />
            )
          }

          if (type === 'task' && key === 'priority' && base_uri) {
            return (
              <MetadataRow
                key={key}
                label={format_field_label(key)}
                value={
                  <EditablePriorityField
                    value={value}
                    base_uri={base_uri}
                    context='entity-page'
                  />
                }
                border_style='compact'
                is_first={index === 0 && !has_content_above}
              />
            )
          }

          return (
            <MetadataRow
              key={key}
              label={format_field_label(key)}
              value={format_field_value(value)}
              border_style='compact'
              scrollable={typeof value === 'string' && value.length > 50}
              is_first={index === 0 && !has_content_above}
            />
          )
        })}

        {/* Date fields - show as two-column if both exist */}
        {(always_visible.created_at || always_visible.updated_at) && (
          <TwoCellRow
            left_label='Created'
            left_value={<DateDisplay date={always_visible.created_at} />}
            right_label='Updated'
            right_value={<DateDisplay date={always_visible.updated_at} />}
            compact={true}
            border_style='compact'
          />
        )}

        {/* Expandable section */}
        <Collapse in={expanded}>
          <Box>
            {Object.entries(expandable).map(([key, value]) => (
              <MetadataRow
                key={key}
                label={format_field_label(key)}
                value={format_field_value(value)}
                border_style='compact'
                scrollable={typeof value === 'string' && value.length > 50}
              />
            ))}
            {Object.entries(uncategorized).map(([key, value]) => (
              <MetadataRow
                key={key}
                label={format_field_label(key)}
                value={format_field_value(value)}
                border_style='compact'
                scrollable={typeof value === 'string' && value.length > 50}
              />
            ))}
          </Box>
        </Collapse>

        {has_expandable_content && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
            <button
              onClick={() => set_expanded(!expanded)}
              style={{
                all: 'unset',
                background: 'none',
                border: 'none',
                color: COLORS.icon_link,
                fontSize: '12px',
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'color 0.2s ease',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(event) => {
                event.target.style.color = COLORS.info
                event.target.style.textDecoration = 'underline'
              }}
              onMouseLeave={(event) => {
                event.target.style.color = COLORS.icon_link
                event.target.style.textDecoration = 'none'
              }}>
              {expanded ? 'show less' : 'show more'}
            </button>
          </Box>
        )}
      </Box>
    </MetadataContainer>
  )
}

EntityFrontmatter.propTypes = {
  frontmatter: PropTypes.object,
  is_sticky: PropTypes.bool,
  markdown: PropTypes.string,
  path: PropTypes.string
}

export default EntityFrontmatter
