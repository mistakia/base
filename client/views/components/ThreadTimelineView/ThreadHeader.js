import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useSelector } from 'react-redux'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import CheckIcon from '@mui/icons-material/Check'

import { COLORS } from '@theme/colors.js'
import { use_copy_to_clipboard } from '@views/hooks/use-copy-to-clipboard.js'
import '@styles/chip.styl'
import { get_thread_cost_display } from '@core/threads/selectors'
import { get_app } from '@core/app/selectors'
import { get_active_session_for_thread } from '@core/active-sessions/selectors'
import {
  MetadataContainer,
  MetadataRow,
  TwoCellRow,
  DateDisplay,
  ThreadStateField,
  TokenField,
  ModelsField,
  CollapsibleFileReferences,
  format_token_shorthand
} from '@views/components/MetadataDisplay'
import RelatedEntities from '@views/components/RelatedEntities'
import SessionActivityBar from '@components/SessionActivityBar/SessionActivityBar.js'
import { EditableTagsField } from '@views/components/InlineSelect'
import {
  extract_message_counts,
  extract_tool_call_count,
  extract_total_tokens,
  extract_duration,
  extract_working_directory,
  extract_thread_state,
  extract_thread_title,
  extract_thread_description,
  extract_user_public_key,
  extract_tags
} from '@views/utils/thread-metadata-extractor.js'
import { parse_relations_for_display } from '#libs-shared/relation-parser.mjs'

const SPACING = {
  TITLE_MARGIN: '8px',
  DESCRIPTION_MARGIN: '16px'
}
const HEADER_STYLES = {
  TEXT_LIGHT: COLORS.text_tertiary,
  TEXT_MEDIUM: COLORS.text_secondary,
  TEXT_DARK: COLORS.text,
  BG_HOVER: COLORS.surface_hover,
  BG_ACTIVE: COLORS.border_light
}

const extract_models = (metadata) => {
  if (!metadata || !metadata.getIn) {
    return []
  }
  return (
    metadata.get('models') ||
    metadata.getIn(['source', 'provider_metadata', 'models']) ||
    []
  )
}

const extract_source_info = (metadata) => {
  if (!metadata || !metadata.getIn) {
    return null
  }

  const source = metadata.get('source')
  if (!source) return null

  const session_provider = source.get?.('provider') || source.provider
  const session_id = source.session_id || source.get?.('session_id')
  const provider_metadata =
    source.provider_metadata || source.get?.('provider_metadata')
  const working_directory =
    provider_metadata?.working_directory ||
    provider_metadata?.get?.('working_directory')

  return {
    provider: session_provider,
    session_id,
    working_directory
  }
}

const extract_dates = (metadata) => {
  if (!metadata || !metadata.get) {
    return { created_at: null, updated_at: null }
  }

  const created_at = metadata.get('created_at') || null
  const updated_at = metadata.get('updated_at') || null

  return { created_at, updated_at }
}

const extract_relations = (metadata) => {
  if (!metadata || !metadata.get) {
    return []
  }

  const relations = metadata.get('relations')
  if (!relations) return []

  // Handle Immutable.js List - convert to plain array
  return relations.toJS ? relations.toJS() : relations
}

// Custom hook for metadata processing
const use_thread_metadata = (metadata) => {
  const dates = extract_dates(metadata)
  const message_counts = extract_message_counts(metadata)
  const tool_call_count = extract_tool_call_count(metadata)
  const total_tokens = extract_total_tokens(metadata)
  const duration = extract_duration(metadata)
  const working_directory = extract_working_directory(metadata)
  const thread_state = extract_thread_state(metadata)
  const title = extract_thread_title(metadata)
  const description = extract_thread_description(metadata)
  const thread_user_public_key = extract_user_public_key(metadata)
  const relations = extract_relations(metadata)
  const tags = extract_tags(metadata)

  return {
    title,
    description,
    total_tokens,
    duration,
    models: extract_models(metadata),
    source_info: extract_source_info(metadata),
    thread_state,
    created_at: dates.created_at,
    updated_at: dates.updated_at,
    message_count: message_counts.message_count,
    user_message_count: message_counts.user_message_count,
    assistant_message_count: message_counts.assistant_message_count,
    tool_call_count,
    working_directory: working_directory.path,
    working_directory_formatted: working_directory.formatted,
    thread_user_public_key,
    relations,
    tags
  }
}

// Sub-components for better organization
const ThreadTitle = ({ title, description, working_directory_formatted }) => {
  if (!title) return null

  const has_content_below = description || working_directory_formatted
  const title_margin_bottom = has_content_below
    ? SPACING.TITLE_MARGIN
    : SPACING.DESCRIPTION_MARGIN

  const description_margin_bottom = working_directory_formatted
    ? SPACING.TITLE_MARGIN
    : SPACING.DESCRIPTION_MARGIN

  return (
    <div>
      <h5
        style={{
          marginBottom: title_margin_bottom,
          fontWeight: 'bold',
          fontSize: '20px',
          margin: 0,
          lineHeight: '1.2'
        }}>
        {title}
      </h5>
      {description && (
        <p
          style={{
            margin: `0 0 ${description_margin_bottom} 0`,
            fontSize: '14px',
            color: HEADER_STYLES.TEXT_MEDIUM,
            lineHeight: '1.4'
          }}>
          {description}
        </p>
      )}
      {working_directory_formatted && working_directory_formatted !== title && (
        <p
          style={{
            margin: `0 0 ${SPACING.DESCRIPTION_MARGIN} 0`,
            fontSize: '12px',
            color: HEADER_STYLES.TEXT_LIGHT,
            fontFamily: 'monospace',
            backgroundColor: HEADER_STYLES.BG_HOVER,
            padding: '4px 8px',
            borderRadius: '4px',
            display: 'inline-block'
          }}>
          {working_directory_formatted}
        </p>
      )}
    </div>
  )
}

ThreadTitle.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  working_directory_formatted: PropTypes.string
}

// Styles for ExternalSessionIdDisplay
const SESSION_ID_STYLES = {
  container: {
    fontSize: '12px',
    color: HEADER_STYLES.TEXT_LIGHT,
    fontFamily: 'monospace',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '4px',
    position: 'relative',
    transition: 'all 0.2s ease',
    '&:hover': {
      backgroundColor: HEADER_STYLES.BG_HOVER,
      color: HEADER_STYLES.TEXT_DARK
    },
    '&:active': {
      backgroundColor: HEADER_STYLES.BG_ACTIVE
    }
  },
  icon_wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '14px',
    height: '14px',
    fontSize: '10px',
    opacity: 0.6,
    transition: 'opacity 0.2s ease',
    '&:hover': {
      opacity: 1
    }
  }
}

const ExternalSessionIdDisplay = ({ session_id }) => {
  const { copied_value, copy_to_clipboard } = use_copy_to_clipboard()
  const is_copied = copied_value === session_id

  return (
    <Box
      onClick={() => copy_to_clipboard(session_id)}
      sx={SESSION_ID_STYLES.container}>
      <span>{session_id}</span>
      <Box sx={SESSION_ID_STYLES.icon_wrapper}>
        {is_copied ? (
          <CheckIcon sx={{ fontSize: '12px' }} />
        ) : (
          <ContentCopyOutlinedIcon sx={{ fontSize: '10px' }} />
        )}
      </Box>
    </Box>
  )
}

ExternalSessionIdDisplay.propTypes = {
  session_id: PropTypes.string.isRequired
}

// Helper to determine if a metadata row should be marked as first
const use_first_row_tracker = () => {
  let has_rendered_row = false

  return () => {
    if (has_rendered_row) {
      return false
    }
    has_rendered_row = true
    return true
  }
}

const ThreadStats = ({
  total_tokens,
  session_id,
  duration,
  models,
  source_info,
  created_at,
  updated_at,
  message_count,
  user_message_count,
  assistant_message_count,
  tool_call_count,
  thread_cost_display,
  thread_id,
  relations,
  tags
}) => {
  const working_directory = source_info?.working_directory
  const session_provider = source_info?.provider
  const has_dates = created_at || updated_at
  const has_message_breakdown =
    user_message_count > 0 || assistant_message_count > 0
  const has_both_tool_calls_and_cost =
    tool_call_count > 0 && thread_cost_display

  // Track which row is rendered first
  const get_is_first = use_first_row_tracker()

  return (
    <Box>
      {session_provider && (
        <MetadataRow
          label='Session Provider'
          value={session_provider}
          is_first={get_is_first()}
        />
      )}

      {thread_id && (
        <MetadataRow
          label='Tags'
          value={
            <EditableTagsField
              value={tags}
              base_uri={`user:thread/${thread_id}`}
            />
          }
          is_first={get_is_first()}
        />
      )}

      {/* Related resources - forward relations from thread metadata + reverse from API.
          Note: RelatedEntities does not participate in is_first tracking because
          it loads asynchronously and may return null after loading completes,
          which would incorrectly consume the is_first flag. It always shows a
          top border when it has content to display. */}
      {thread_id && (
        <RelatedEntities
          base_uri={`user:thread/${thread_id}`}
          forward_relations={parse_relations_for_display({ relations })}
          exclude_types={['file', 'directory']}
          show_header={true}
          header_text='Relations'
        />
      )}

      {/* File and directory references - displayed collapsed with count */}
      {thread_id && (
        <CollapsibleFileReferences base_uri={`user:thread/${thread_id}`} />
      )}

      {has_dates && (
        <TwoCellRow
          left_label='Created'
          left_value={<DateDisplay date={created_at} />}
          right_label='Last Updated'
          right_value={<DateDisplay date={updated_at} />}
          is_first={get_is_first()}
        />
      )}

      {/* Display tokens with duration if available */}
      {duration ? (
        <TwoCellRow
          left_label='Tokens'
          left_value={format_token_shorthand({ count: total_tokens })}
          right_label='Duration'
          right_value={duration}
          is_first={get_is_first()}
        />
      ) : (
        <TokenField value={total_tokens} is_first={get_is_first()} />
      )}

      {/* Message counts - show detailed breakdown if available, otherwise show total */}
      {has_message_breakdown ? (
        <TwoCellRow
          left_label='User Messages'
          left_value={user_message_count.toLocaleString()}
          right_label='Assistant Messages'
          right_value={assistant_message_count.toLocaleString()}
        />
      ) : (
        message_count > 0 && (
          <MetadataRow
            label='Messages'
            value={message_count.toLocaleString()}
          />
        )
      )}

      {/* Tool calls and cost - use TwoCellRow if both exist, otherwise show individually */}
      {has_both_tool_calls_and_cost ? (
        <TwoCellRow
          left_label='Tool Calls'
          left_value={tool_call_count.toLocaleString()}
          right_label='Cost'
          right_value={thread_cost_display}
        />
      ) : (
        <>
          {tool_call_count > 0 && (
            <MetadataRow
              label='Tool Calls'
              value={tool_call_count.toLocaleString()}
            />
          )}
          {thread_cost_display && (
            <MetadataRow label='Cost' value={thread_cost_display} />
          )}
        </>
      )}

      <ModelsField models={models} />

      {session_id && (
        <MetadataRow
          label='External Session ID'
          value={<ExternalSessionIdDisplay session_id={session_id} />}
        />
      )}

      {working_directory && (
        <MetadataRow
          label='Directory'
          value={working_directory}
          scrollable={true}
          is_first={get_is_first()}
        />
      )}
    </Box>
  )
}

ThreadStats.propTypes = {
  total_tokens: PropTypes.number.isRequired,
  session_id: PropTypes.string,
  duration: PropTypes.string,
  models: PropTypes.arrayOf(PropTypes.string).isRequired,
  source_info: PropTypes.shape({
    provider: PropTypes.string,
    session_id: PropTypes.string,
    working_directory: PropTypes.string
  }),
  created_at: PropTypes.string,
  updated_at: PropTypes.string,
  message_count: PropTypes.number,
  user_message_count: PropTypes.number,
  assistant_message_count: PropTypes.number,
  tool_call_count: PropTypes.number,
  thread_cost_display: PropTypes.string,
  thread_id: PropTypes.string,
  relations: PropTypes.array,
  tags: PropTypes.array
}

const SourceChips = ({ source_info, thread_state }) => {
  if (!source_info && !thread_state) return null

  return (
    <Box
      sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      {source_info && (
        <>
          <span className='chip'>{source_info.provider}</span>
          {source_info.working_directory && (
            <span className='chip'>{source_info.working_directory}</span>
          )}
        </>
      )}
      {thread_state && <span className='chip'>{thread_state}</span>}
    </Box>
  )
}

SourceChips.propTypes = {
  source_info: PropTypes.shape({
    provider: PropTypes.string,
    session_id: PropTypes.string,
    working_directory: PropTypes.string
  }),
  thread_state: PropTypes.string
}

const ThreadHeader = ({
  metadata,
  thread_id,
  collapsible = false,
  default_collapsed = false,
  actions = null,
  title_href = null,
  sx: container_sx = {}
}) => {
  const [is_collapsed, set_is_collapsed] = useState(default_collapsed)

  useEffect(() => {
    set_is_collapsed(default_collapsed)
  }, [default_collapsed])

  const {
    title,
    description,
    total_tokens,
    duration,
    models,
    source_info,
    thread_state,
    created_at,
    updated_at,
    message_count,
    user_message_count,
    assistant_message_count,
    tool_call_count,
    working_directory_formatted,
    thread_user_public_key,
    relations,
    tags
  } = use_thread_metadata(metadata)

  // Get current user's public key and cost display from Redux store
  const app_state = useSelector(get_app)
  const current_user_public_key = app_state.get('user_public_key')
  const thread_cost_display = useSelector(get_thread_cost_display)

  // Get active session for this thread
  const active_session = useSelector((state) =>
    get_active_session_for_thread(state, thread_id)
  )

  // Check if current user owns this thread
  const user_owns_thread =
    current_user_public_key &&
    thread_user_public_key &&
    current_user_public_key === thread_user_public_key

  const toggle_collapse = () => set_is_collapsed((prev) => !prev)

  const title_element = title_href ? (
    <a
      href={title_href}
      style={{
        textDecoration: 'none',
        color: 'inherit'
      }}>
      <h5
        style={{
          fontWeight: 'bold',
          fontSize: '20px',
          margin: 0,
          lineHeight: '1.2'
        }}>
        {title || 'Thread'}
      </h5>
    </a>
  ) : null

  return (
    <MetadataContainer
      background_color='white'
      border_radius={2}
      sx={{ marginTop: '16px', ...container_sx }}>
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        {/* Title row with optional actions (e.g. close button) */}
        {(title_element || actions) ? (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: title ? 1 : 0 }}>
            {title_element || (
              <ThreadTitle
                title={title}
                description={null}
                working_directory_formatted={null}
              />
            )}
            {actions && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                {actions}
              </Box>
            )}
          </Box>
        ) : null}
        {/* Description and working directory below the title/actions row */}
        {title_element && (description || working_directory_formatted) && (
          <Box>
            {description && (
              <p
                style={{
                  margin: `0 0 ${working_directory_formatted ? SPACING.TITLE_MARGIN : SPACING.DESCRIPTION_MARGIN} 0`,
                  fontSize: '14px',
                  color: HEADER_STYLES.TEXT_MEDIUM,
                  lineHeight: '1.4'
                }}>
                {description}
              </p>
            )}
            {working_directory_formatted && working_directory_formatted !== title && (
              <p
                style={{
                  margin: `0 0 ${SPACING.DESCRIPTION_MARGIN} 0`,
                  fontSize: '12px',
                  color: HEADER_STYLES.TEXT_LIGHT,
                  fontFamily: 'monospace',
                  backgroundColor: HEADER_STYLES.BG_HOVER,
                  padding: '4px 8px',
                  borderRadius: '4px',
                  display: 'inline-block'
                }}>
                {working_directory_formatted}
              </p>
            )}
          </Box>
        )}
        {/* When not using title_element, render the original ThreadTitle */}
        {!title_element && !actions && (
          <ThreadTitle
            title={title}
            description={description}
            working_directory_formatted={working_directory_formatted}
          />
        )}
      </Box>

      {/* Always-visible: Live Session + Thread State */}
      {(active_session || thread_state) && (
        <Box>
          {active_session && (
            <MetadataRow
              label='Live Session'
              value={
                <SessionActivityBar
                  active_session={active_session}
                  compact
                />
              }
              is_first
            />
          )}
          {thread_state && thread_id && (
            <ThreadStateField
              thread_state={thread_state}
              thread_id={thread_id}
              user_owns_thread={user_owns_thread}
              is_first={!active_session}
            />
          )}
        </Box>
      )}

      {/* Collapse toggle - after live session and thread state */}
      {collapsible && (
        <Box
          onClick={toggle_collapse}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: '11px',
            color: HEADER_STYLES.TEXT_LIGHT,
            px: 3,
            py: 1,
            borderTop: `1px solid ${COLORS.border_light}`,
            '&:hover': { color: HEADER_STYLES.TEXT_MEDIUM }
          }}>
          <svg
            width='10'
            height='10'
            viewBox='0 0 10 10'
            fill='none'
            style={{
              transform: is_collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease'
            }}>
            <path
              d='M2.5 4l2.5 2.5L7.5 4'
              stroke='currentColor'
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          {is_collapsed ? 'show details' : 'hide details'}
        </Box>
      )}

      {/* Collapsible detail stats */}
      {(!collapsible || !is_collapsed) && (
        <ThreadStats
          total_tokens={total_tokens}
          session_id={source_info?.session_id}
          duration={duration}
          models={models}
          source_info={source_info}
          created_at={created_at}
          updated_at={updated_at}
          message_count={message_count}
          user_message_count={user_message_count}
          assistant_message_count={assistant_message_count}
          tool_call_count={tool_call_count}
          thread_cost_display={thread_cost_display}
          thread_id={thread_id}
          relations={relations}
          tags={tags}
        />
      )}
    </MetadataContainer>
  )
}

ThreadHeader.propTypes = {
  metadata: PropTypes.object,
  thread_id: PropTypes.string,
  collapsible: PropTypes.bool,
  default_collapsed: PropTypes.bool,
  actions: PropTypes.node,
  title_href: PropTypes.string,
  sx: PropTypes.object
}

export default ThreadHeader
