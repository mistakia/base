import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography, Collapse, IconButton } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

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
  EditablePriorityField,
  EditableTagsField
} from '@views/components/InlineSelect'
import { EditableEntityField } from '@views/components/EditableField'
import { entity_field_config } from './field-config.js'
import { entity_field_schema } from './field-schema-config.js'
import { resolve_field_type, dual_field_keys } from './field-type-config.js'
import {
  CopyableValue,
  LinkValue,
  PrimitiveArrayValue,
  ObjectValue,
  ObjectArrayValue,
  TagArrayValue
} from './value-components/index.js'
import { parse_relations_for_display } from '#libs-shared/relation-parser.mjs'

const has_value = (value) =>
  value !== null && value !== undefined && value !== ''

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

  if (config.show_set_by_default && config.schema_fields) {
    // Show all set schema fields by default; on expand show empty schema fields
    const schema_set = new Set(config.schema_fields)
    const always_set = new Set(config.always_visible)
    const expandable_set = new Set(config.expandable)

    // Always-visible fields (dates, etc.)
    for (const key of config.always_visible) {
      if (key in other_fields) {
        always_visible[key] = other_fields[key]
      }
    }

    // Schema fields with values go to always_visible
    for (const key of config.schema_fields) {
      if (key in other_fields && has_value(other_fields[key])) {
        always_visible[key] = other_fields[key]
      }
    }

    // Expandable: system/internal fields that exist + empty schema fields
    for (const key of config.expandable) {
      if (key in other_fields) {
        expandable[key] = other_fields[key]
      }
    }
    for (const key of config.schema_fields) {
      if (!(key in other_fields) || !has_value(other_fields[key])) {
        expandable[key] = other_fields[key] ?? null
      }
    }

    // Remaining uncategorized fields
    Object.entries(other_fields).forEach(([key, value]) => {
      if (
        !schema_set.has(key) &&
        !always_set.has(key) &&
        !expandable_set.has(key)
      ) {
        uncategorized[key] = value
      }
    })
  } else {
    Object.entries(other_fields).forEach(([key, value]) => {
      if (config.always_visible.includes(key)) {
        always_visible[key] = value
      } else if (config.expandable.includes(key)) {
        expandable[key] = value
      } else {
        uncategorized[key] = value
      }
    })
  }

  return { always_visible, expandable, uncategorized }
}

const render_field_value = (key, value, frontmatter) => {
  if (value === null || value === undefined) return 'N/A'

  // Special handling for tags field - render as clickable links
  if (key === 'tags' && Array.isArray(value)) {
    return <TagArrayValue value={value} />
  }

  const field_type = resolve_field_type(key, value)

  switch (field_type) {
    case 'id':
      if (dual_field_keys.has(key)) {
        return <LinkValue value={value} show_copy />
      }
      return <CopyableValue value={value} />

    case 'link':
      return <LinkValue value={value} />

    case 'boolean':
      return value ? 'Yes' : 'No'

    case 'primitive_array':
      return <PrimitiveArrayValue value={value} />

    case 'object_array':
      return <ObjectArrayValue value={value} frontmatter={frontmatter} />

    case 'object':
      return <ObjectValue value={value} />

    default:
      return String(value)
  }
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

const observations_expand_toggle_sx = {
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

const observations_expand_button_sx = {
  fontSize: '12px',
  color: COLORS.text_secondary,
  padding: '2px 8px',
  borderRadius: '4px',
  '&:hover': {
    backgroundColor: 'transparent'
  }
}

const DEFAULT_VISIBLE_OBSERVATIONS = 3
const OBSERVATION_CONTENT_CHAR_LIMIT = 200

const observation_item_toggle_sx = {
  marginLeft: '6px',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: COLORS.icon_link,
  fontSize: '11px',
  fontFamily: 'inherit',
  '&:hover': {
    textDecoration: 'underline',
    color: COLORS.info
  }
}

const parse_observation_text = (text) => {
  const match = text.match(bracket_and_content_regex)
  if (match) {
    const [, bracket_text, content] = match
    return { bracket_text, content: content.trim() }
  }
  return { bracket_text: null, content: text }
}

const ObservationItem = ({ text }) => {
  const [is_expanded, set_is_expanded] = useState(false)
  const { bracket_text, content } = parse_observation_text(text)
  const is_truncatable = content.length > OBSERVATION_CONTENT_CHAR_LIMIT
  const displayed_content =
    is_truncatable && !is_expanded
      ? `${content.slice(0, OBSERVATION_CONTENT_CHAR_LIMIT).trimEnd()}…`
      : content

  return (
    <Box sx={observation_line_sx}>
      {bracket_text ? (
        <Box component='span' sx={observation_label_sx}>
          {bracket_text}
        </Box>
      ) : null}
      <Box component='span' sx={observation_content_sx}>
        {displayed_content}
      </Box>
      {is_truncatable && (
        <Box
          component='button'
          type='button'
          onClick={() => set_is_expanded((prev) => !prev)}
          sx={observation_item_toggle_sx}
          aria-label={
            is_expanded ? 'Show less of observation' : 'Show more of observation'
          }>
          {is_expanded ? 'show less' : 'show more'}
        </Box>
      )}
    </Box>
  )
}

ObservationItem.propTypes = {
  text: PropTypes.string.isRequired
}

const ObservationsSection = ({ observations, visible_count }) => {
  if (!Array.isArray(observations) || observations.length === 0) return null
  const [is_expanded, set_is_expanded] = useState(false)
  const effective_visible_count =
    typeof visible_count === 'number'
      ? Math.max(1, visible_count)
      : DEFAULT_VISIBLE_OBSERVATIONS
  const should_collapse = observations.length > effective_visible_count
  const displayed_observations = is_expanded
    ? observations
    : observations.slice(0, effective_visible_count)
  const hidden_count = observations.length - displayed_observations.length

  return (
    <MetadataRow
      label='Observations'
      value={
        <Box>
          <Box sx={observations_container_sx}>
            {displayed_observations.map((text, idx) => (
              <ObservationItem key={idx} text={text} />
            ))}
          </Box>
          {should_collapse && (
            <Box sx={observations_expand_toggle_sx}>
              <IconButton
                sx={observations_expand_button_sx}
                size='small'
                disableRipple
                onClick={() => set_is_expanded((prev) => !prev)}
                aria-label={
                  is_expanded
                    ? 'Show fewer observations'
                    : 'Show more observations'
                }>
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
      }
    />
  )
}

ObservationsSection.propTypes = {
  observations: PropTypes.array,
  visible_count: PropTypes.number
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

/**
 * Render a field value, using EditableEntityField when schema config exists
 */
const render_editable_or_static = (
  key,
  value,
  frontmatter,
  base_uri,
  editable
) => {
  const entity_type = frontmatter.type
  if (
    editable &&
    entity_type &&
    base_uri &&
    entity_field_schema[entity_type]?.[key]
  ) {
    return (
      <EditableEntityField
        field_name={key}
        value={value}
        base_uri={base_uri}
        entity_type={entity_type}
      />
    )
  }
  return render_field_value(key, value, frontmatter)
}

// Grid styles for domain fields - auto-fit packs 3-4 small fields per row
// and stretches the last row to fill the container width.
// Uses borderTop on children (not borderBottom) so the last row has no
// trailing border that would double up with the next section's border.
const field_grid_sx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  // Each child gets borderTop for row separation and borderRight for column
  // separation. The container's overflow:hidden clips the rightmost border
  // so it doesn't double with the container border.
  '& > *': {
    borderRight: `1px solid ${COLORS.border_light}`,
    borderTop: `1px solid ${COLORS.border_light}`
  }
}

// Grid cell with natural flow layout (no absolute positioning)
// so long labels wrap without overlapping the value
const grid_label_sx = {
  fontSize: '10px',
  color: COLORS.text_secondary,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  lineHeight: 1.3
}

const grid_value_sx = {
  fontSize: '13px',
  color: COLORS.text,
  fontWeight: 400,
  wordBreak: 'break-word',
  lineHeight: 1.4
}

const GridCell = ({ label, value }) => (
  <Box sx={{ px: '12px', py: '6px', minHeight: '48px' }}>
    <Box sx={grid_label_sx}>{label}</Box>
    <Box sx={grid_value_sx}>{value}</Box>
  </Box>
)

GridCell.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired
}

const EntityFrontmatter = ({
  frontmatter,
  markdown,
  path,
  layout = 'sidebar',
  can_write = false
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

  const is_full_width = layout === 'full-width'

  // Separate domain fields from date and tag fields for grid layout
  const domain_fields = Object.entries(always_visible).filter(
    ([key]) => key !== 'created_at' && key !== 'updated_at' && key !== 'tags'
  )

  const has_tags = 'tags' in always_visible

  const parsed_forward_relations = parse_relations_for_display({ relations })

  const pinned_relation_types =
    type === 'physical_item' ? ['current_location'] : []

  if (is_full_width) {
    const has_relations = will_related_entities_render(
      base_uri,
      parsed_forward_relations
    )
    const has_observations =
      Array.isArray(observations) && observations.length > 0

    // Separate expandable fields into wide (long values) and compact (grid-friendly)
    const wide_expand_keys = new Set([
      'entity_id',
      'user_public_key',
      'base_uri',
      'permalink'
    ])
    const all_expandable = [
      ...Object.entries(expandable),
      ...Object.entries(uncategorized)
    ]
    const compact_expand_fields = all_expandable.filter(
      ([key]) => !wide_expand_keys.has(key)
    )
    const wide_expand_fields = all_expandable.filter(([key]) =>
      wide_expand_keys.has(key)
    )

    return (
      <MetadataContainer
        background_color='white'
        border_radius={2}
        sx={{ marginTop: '16px' }}>
        <EntityTitle
          title={display_title}
          type={type}
          description={description}
          markdown={markdown}
        />

        {/* Tags + Relations row */}
        {(has_tags || has_relations) &&
          (() => {
            const section_count =
              (has_tags && base_uri ? 1 : 0) + (has_relations ? 1 : 0)
            return (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${section_count}, 1fr)`,
                  borderTop: `1px solid ${COLORS.border_light}`,
                  '& > *': {
                    borderRight: `1px solid ${COLORS.border_light}`
                  }
                }}>
                {has_tags && base_uri && (
                  <Box sx={{ minWidth: 0 }}>
                    <MetadataRow
                      label={format_field_label('tags')}
                      value={
                        <EditableTagsField
                          value={always_visible.tags}
                          base_uri={base_uri}
                          editable={can_write}
                        />
                      }
                      border_style='none'
                    />
                  </Box>
                )}
                {has_relations && (
                  <Box sx={{ minWidth: 0 }}>
                    <RelatedEntities
                      base_uri={base_uri}
                      forward_relations={parsed_forward_relations}
                      exclude_types={['file', 'directory']}
                      show_header={true}
                      header_text='Relations'
                      is_first={true}
                      pinned_relation_types={pinned_relation_types}
                    />
                  </Box>
                )}
              </Box>
            )
          })()}

        {/* Domain fields in auto-fill grid */}
        {domain_fields.length > 0 && (
          <Box sx={field_grid_sx}>
            {domain_fields.map(([key, value]) => {
              // Task status/priority use specialized components
              if (type === 'task' && key === 'status' && base_uri) {
                return (
                  <GridCell
                    key={key}
                    label={format_field_label(key)}
                    value={
                      <EditableStatusField
                        value={value}
                        base_uri={base_uri}
                        context='entity-page'
                        editable={can_write}
                      />
                    }
                  />
                )
              }

              if (type === 'task' && key === 'priority' && base_uri) {
                return (
                  <GridCell
                    key={key}
                    label={format_field_label(key)}
                    value={
                      <EditablePriorityField
                        value={value}
                        base_uri={base_uri}
                        context='entity-page'
                        editable={can_write}
                      />
                    }
                  />
                )
              }

              return (
                <GridCell
                  key={key}
                  label={format_field_label(key)}
                  value={render_editable_or_static(
                    key,
                    value,
                    frontmatter,
                    base_uri,
                    can_write
                  )}
                />
              )
            })}
          </Box>
        )}

        {/* Date fields */}
        {(always_visible.created_at || always_visible.updated_at) && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              borderTop: `1px solid ${COLORS.border_light}`,
              '& > *': {
                borderRight: `1px solid ${COLORS.border_light}`
              }
            }}>
            <GridCell
              label='Created'
              value={<DateDisplay date={always_visible.created_at} />}
            />
            <GridCell
              label='Updated'
              value={<DateDisplay date={always_visible.updated_at} />}
            />
          </Box>
        )}

        {has_observations && (
          <ObservationsSection observations={observations} />
        )}

        {/* Expandable section */}
        <Collapse in={expanded}>
          <Box>
            {/* Compact fields in auto-fill grid */}
            {compact_expand_fields.length > 0 && (
              <Box sx={field_grid_sx}>
                {compact_expand_fields.map(([key, value]) => (
                  <GridCell
                    key={key}
                    label={format_field_label(key)}
                    value={render_field_value(key, value, frontmatter)}
                  />
                ))}
              </Box>
            )}
            {/* Wide fields as full-width rows */}
            {wide_expand_fields.map(([key, value]) => (
              <MetadataRow
                key={key}
                label={format_field_label(key)}
                value={render_field_value(key, value, frontmatter)}
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
      </MetadataContainer>
    )
  }

  // Sidebar layout (original behavior)
  return (
    <MetadataContainer
      background_color='white'
      border_radius={2}
      sx={{ marginTop: '16px' }}>
      <EntityTitle
        title={display_title}
        type={type}
        description={description}
        markdown={markdown}
      />

      {/* Core metadata section */}
      <Box>
        {/* Unified relations - forward from frontmatter + reverse from API */}
        {base_uri && (
          <RelatedEntities
            base_uri={base_uri}
            forward_relations={parsed_forward_relations}
            exclude_types={['file', 'directory']}
            show_header={true}
            header_text='Relations'
            pinned_relation_types={pinned_relation_types}
          />
        )}

        {/* Always visible fields */}
        {Object.entries(always_visible).map(([key, value], index) => {
          // Special handling for date fields
          if (key === 'created_at' || key === 'updated_at') {
            return null // Handle dates separately below
          }

          const has_content_above = will_related_entities_render(
            base_uri,
            parsed_forward_relations
          )

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

          if (key === 'tags' && base_uri) {
            return (
              <MetadataRow
                key={key}
                label={format_field_label(key)}
                value={
                  <EditableTagsField
                    value={value}
                    base_uri={base_uri}
                    editable={can_write}
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
              value={render_editable_or_static(
                key,
                value,
                frontmatter,
                base_uri,
                can_write
              )}
              border_style='compact'
              scrollable={
                resolve_field_type(key, value) === 'default' &&
                typeof value === 'string' &&
                value.length > 50
              }
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

        {observations && <ObservationsSection observations={observations} />}

        {/* Expandable section */}
        <Collapse in={expanded}>
          <Box>
            {Object.entries(expandable).map(([key, value]) => (
              <MetadataRow
                key={key}
                label={format_field_label(key)}
                value={render_field_value(key, value, frontmatter)}
                border_style='compact'
                scrollable={
                  resolve_field_type(key, value) === 'default' &&
                  typeof value === 'string' &&
                  value.length > 50
                }
              />
            ))}
            {Object.entries(uncategorized).map(([key, value]) => (
              <MetadataRow
                key={key}
                label={format_field_label(key)}
                value={render_field_value(key, value, frontmatter)}
                border_style='compact'
                scrollable={
                  resolve_field_type(key, value) === 'default' &&
                  typeof value === 'string' &&
                  value.length > 50
                }
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
  markdown: PropTypes.string,
  path: PropTypes.string,
  layout: PropTypes.oneOf(['sidebar', 'full-width']),
  can_write: PropTypes.bool
}

export default EntityFrontmatter
