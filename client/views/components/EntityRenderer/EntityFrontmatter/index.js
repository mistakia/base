import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography, Collapse } from '@mui/material'
import {
  MetadataContainer,
  MetadataRow,
  TwoCellRow,
  DateDisplay
} from '@views/components/MetadataDisplay'
import { parse_relation } from './renderers/relations-field.js'
import { handle_link_click } from '@views/utils/link-processor.js'
import { entity_field_config } from './field-config.js'

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
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
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
              color: '#666',
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

const RelationsSection = ({ relations }) => {
  if (!Array.isArray(relations) || relations.length === 0) return null

  return (
    <MetadataRow
      label='Relations'
      value={
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {relations.map((relation, idx) => {
            const parsed = parse_relation(relation)
            if (!parsed) {
              return (
                <Box key={idx} sx={{ fontSize: '12px', color: '#555' }}>
                  • {relation}
                </Box>
              )
            }

            return (
              <Box key={idx} sx={{ fontSize: '12px', color: '#555' }}>
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
                  onMouseEnter={(event) => {
                    event.target.style.borderBottomColor = '#0366d6'
                  }}
                  onMouseLeave={(event) => {
                    event.target.style.borderBottomColor = 'transparent'
                  }}
                  onClick={handle_link_click}
                  data-internal-link='true'>
                  {parsed.filename}
                </a>
              </Box>
            )
          })}
        </Box>
      }
    />
  )
}

RelationsSection.propTypes = {
  relations: PropTypes.array
}

const ObservationsSection = ({ observations }) => {
  if (!Array.isArray(observations) || observations.length === 0) return null

  return (
    <MetadataRow
      label='Observations'
      value={
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {observations.map((text, idx) => (
            <Box key={idx} sx={{ fontSize: '12px', color: '#555' }}>
              • {text}
            </Box>
          ))}
        </Box>
      }
    />
  )
}

ObservationsSection.propTypes = {
  observations: PropTypes.array
}

const EntityFrontmatter = ({ frontmatter, is_sticky = false, markdown }) => {
  const [expanded, set_expanded] = useState(false)

  if (!frontmatter) return null

  const { title, name, type, description, relations, observations } =
    frontmatter

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
        {relations && <RelationsSection relations={relations} />}
        {observations && <ObservationsSection observations={observations} />}

        {/* Always visible fields */}
        {Object.entries(always_visible).map(([key, value], index) => {
          // Special handling for date fields
          if (key === 'created_at' || key === 'updated_at') {
            return null // Handle dates separately below
          }

          return (
            <MetadataRow
              key={key}
              label={format_field_label(key)}
              value={format_field_value(value)}
              border_style='compact'
              scrollable={typeof value === 'string' && value.length > 50}
              is_first={index === 0 && !relations && !observations}
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
                color: '#0366d6',
                fontSize: '12px',
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'color 0.2s ease',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(event) => {
                event.target.style.color = '#0451a5'
                event.target.style.textDecoration = 'underline'
              }}
              onMouseLeave={(event) => {
                event.target.style.color = '#0366d6'
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
  markdown: PropTypes.string
}

export default EntityFrontmatter
