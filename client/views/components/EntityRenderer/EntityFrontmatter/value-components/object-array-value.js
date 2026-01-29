import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'

import { COLORS } from '@theme/colors.js'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import ExpandToggle from '@components/primitives/ExpandToggle'

const TRUNCATE_LENGTH = 150

const header_sx = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  color: COLORS.text_secondary,
  fontWeight: 500
}

const external_link_sx = {
  color: COLORS.icon_link,
  fontSize: '14px',
  verticalAlign: 'middle',
  '&:hover': {
    color: COLORS.info
  }
}

const comment_card_sx = {
  borderLeft: `2px solid ${COLORS.border_light}`,
  paddingLeft: '8px',
  marginTop: '6px',
  fontSize: '12px'
}

const comment_meta_sx = {
  color: COLORS.text_tertiary,
  fontSize: '11px',
  marginBottom: '2px'
}

const comment_markdown_sx = {
  fontSize: '12px',
  lineHeight: 1.5,
  wordBreak: 'break-word',
  '& p': { mb: 1, mt: 0 },
  '& p:last-child': { mb: 0 },
  '& pre': { fontSize: '11px', my: 1 },
  '& code': { fontSize: '11px' },
  '& ul, & ol': { mb: 1, pl: 2 },
  '& h1, & h2, & h3, & h4, & h5, & h6': {
    fontSize: '12px',
    mt: 1,
    mb: 0.5
  }
}

const comment_content_sx = {
  color: COLORS.text_secondary,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
}

const truncate = (text, max_length = TRUNCATE_LENGTH) => {
  if (!text || text.length <= max_length) return text
  return text.substring(0, max_length) + '...'
}

const format_relative_date = (date_string) => {
  if (!date_string) return ''
  const date = new Date(date_string)
  if (isNaN(date.getTime())) return date_string

  const now = new Date()
  const diff_ms = now - date
  const diff_days = Math.floor(diff_ms / (1000 * 60 * 60 * 24))

  if (diff_days === 0) return 'today'
  if (diff_days === 1) return 'yesterday'
  if (diff_days < 30) return `${diff_days}d ago`
  if (diff_days < 365) return `${Math.floor(diff_days / 30)}mo ago`
  return `${Math.floor(diff_days / 365)}y ago`
}

const is_github_comment_shape = (item) => {
  return (
    item && typeof item === 'object' && ('author' in item || 'body' in item)
  )
}

const is_prompt_property_shape = (item) => {
  return (
    item &&
    typeof item === 'object' &&
    'name' in item &&
    ('type' in item || 'description' in item)
  )
}

const CommentCard = ({ comment, condensed = false }) => {
  const author = comment.author || comment.user || 'unknown'
  const date = comment.created_at || comment.date
  const content = comment.body || comment.content || ''

  return (
    <Box sx={comment_card_sx}>
      <Box sx={comment_meta_sx}>
        {author}
        {date && ` - ${format_relative_date(date)}`}
      </Box>
      {condensed ? (
        <Box sx={comment_content_sx}>{truncate(content)}</Box>
      ) : (
        <Box sx={comment_markdown_sx}>
          <MarkdownViewer content={content} />
        </Box>
      )}
    </Box>
  )
}

CommentCard.propTypes = {
  comment: PropTypes.object.isRequired,
  condensed: PropTypes.bool
}

const GithubCommentsDisplay = ({ value, external_url }) => {
  const [show_all, set_show_all] = useState(false)
  const count = value.length
  const latest = value[value.length - 1]

  const on_toggle = useCallback((e) => {
    e.stopPropagation()
    set_show_all((v) => !v)
  }, [])

  return (
    <Box>
      <Box sx={header_sx}>
        <span>
          {count} comment{count !== 1 ? 's' : ''}
        </span>
        {external_url && (
          <Box
            component='a'
            href={external_url}
            target='_blank'
            rel='noopener noreferrer'
            title='View on GitHub'
            sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <OpenInNewIcon sx={external_link_sx} />
          </Box>
        )}
        {count > 1 && (
          <ExpandToggle
            is_expanded={show_all}
            on_toggle={on_toggle}
            expanded_label='Collapse'
            collapsed_label='Expand'
          />
        )}
      </Box>

      {!show_all && latest && <CommentCard comment={latest} condensed />}

      {show_all &&
        value.map((comment, index) => (
          <CommentCard key={index} comment={comment} />
        ))}
    </Box>
  )
}

GithubCommentsDisplay.propTypes = {
  value: PropTypes.array.isRequired,
  external_url: PropTypes.string
}

const prop_row_sx = {
  display: 'flex',
  gap: '6px',
  fontSize: '12px',
  lineHeight: 1.5,
  alignItems: 'baseline'
}

const prop_name_sx = {
  fontFamily: 'monospace',
  fontWeight: 500,
  color: COLORS.text,
  whiteSpace: 'nowrap'
}

const prop_type_sx = {
  color: COLORS.text_tertiary,
  fontSize: '11px',
  whiteSpace: 'nowrap'
}

const prop_desc_sx = {
  color: COLORS.text_secondary,
  fontSize: '11px'
}

const PromptPropertiesDisplay = ({ value }) => {
  const count = value.length

  return (
    <Box>
      <Box sx={header_sx}>
        <span>
          {count} parameter{count !== 1 ? 's' : ''}
        </span>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          mt: '4px'
        }}>
        {value.map((prop, index) => (
          <Box key={index} sx={prop_row_sx}>
            <span style={prop_name_sx}>
              {prop.name}
              {prop.required ? '*' : ''}
            </span>
            {prop.type && <span style={prop_type_sx}>({prop.type})</span>}
            {prop.description && (
              <span style={prop_desc_sx}>- {prop.description}</span>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

PromptPropertiesDisplay.propTypes = {
  value: PropTypes.array.isRequired
}

const GenericObjectArrayDisplay = ({ value }) => {
  const [show_all, set_show_all] = useState(false)
  const count = value.length

  const on_toggle = useCallback((e) => {
    e.stopPropagation()
    set_show_all((v) => !v)
  }, [])

  return (
    <Box>
      <Box sx={header_sx}>
        <span>
          {count} item{count !== 1 ? 's' : ''}
        </span>
        {count > 1 && (
          <ExpandToggle
            is_expanded={show_all}
            on_toggle={on_toggle}
            expanded_label='Collapse'
            collapsed_label='Expand'
          />
        )}
      </Box>

      {!show_all && (
        <Box sx={{ ...comment_card_sx, marginTop: '4px' }}>
          <Box sx={comment_content_sx}>
            {truncate(JSON.stringify(value[value.length - 1], null, 2))}
          </Box>
        </Box>
      )}

      {show_all &&
        value.map((item, index) => (
          <Box key={index} sx={{ ...comment_card_sx, marginTop: '4px' }}>
            <Box sx={comment_content_sx}>{JSON.stringify(item, null, 2)}</Box>
          </Box>
        ))}
    </Box>
  )
}

GenericObjectArrayDisplay.propTypes = {
  value: PropTypes.array.isRequired
}

const ObjectArrayValue = ({ value, frontmatter }) => {
  if (!Array.isArray(value) || value.length === 0) {
    return <span style={{ fontSize: '12px' }}>None</span>
  }

  // Detect github comments shape
  if (is_github_comment_shape(value[0])) {
    return (
      <GithubCommentsDisplay
        value={value}
        external_url={frontmatter?.external_url}
      />
    )
  }

  // Detect prompt_properties shape
  if (is_prompt_property_shape(value[0])) {
    return <PromptPropertiesDisplay value={value} />
  }

  return <GenericObjectArrayDisplay value={value} />
}

ObjectArrayValue.propTypes = {
  value: PropTypes.array.isRequired,
  frontmatter: PropTypes.object
}

export default ObjectArrayValue
