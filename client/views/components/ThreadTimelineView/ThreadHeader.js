import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useSelector, useDispatch } from 'react-redux'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import CheckIcon from '@mui/icons-material/Check'

import '@styles/chip.styl'
import { get_thread_cost_display } from '@core/threads/selectors'
import { get_app } from '@core/app/selectors'
import {
  MetadataContainer,
  MetadataRow,
  TwoCellRow,
  DateDisplay,
  ThreadStateField,
  TokenField,
  ModelsField,
  format_token_shorthand
} from '@views/components/MetadataDisplay'
import {
  extract_message_counts,
  extract_tool_call_count,
  extract_total_tokens,
  extract_duration,
  extract_working_directory,
  extract_thread_state,
  extract_thread_title,
  extract_thread_description,
  extract_user_public_key
} from '@views/utils/thread-metadata-extractor.js'

// Constants
const COPY_SUCCESS_TIMEOUT_MS = 2000
const SPACING = {
  TITLE_MARGIN: '8px',
  DESCRIPTION_MARGIN: '16px'
}
const COLORS = {
  TEXT_LIGHT: '#888',
  TEXT_MEDIUM: '#666',
  TEXT_DARK: '#333',
  BG_HOVER: '#f5f5f5',
  BG_ACTIVE: '#e0e0e0'
}

const extract_models = (metadata) => {
  if (!metadata || !metadata.getIn) {
    return []
  }
  return (
    metadata.getIn(['external_session', 'provider_metadata', 'models']) || []
  )
}

const extract_external_session_info = (metadata) => {
  if (!metadata || !metadata.getIn) {
    return null
  }

  const external_session = metadata.get('external_session')
  if (!external_session) return null

  const session_provider =
    external_session.session_provider ||
    external_session.get?.('session_provider')
  const session_id =
    external_session.session_id || external_session.get?.('session_id')
  const provider_metadata =
    external_session.provider_metadata ||
    external_session.get?.('provider_metadata')
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

  return {
    title,
    description,
    total_tokens,
    duration,
    models: extract_models(metadata),
    external_session_info: extract_external_session_info(metadata),
    thread_state,
    created_at: dates.created_at,
    updated_at: dates.updated_at,
    message_count: message_counts.message_count,
    user_message_count: message_counts.user_message_count,
    assistant_message_count: message_counts.assistant_message_count,
    tool_call_count,
    working_directory: working_directory.path,
    working_directory_formatted: working_directory.formatted,
    thread_user_public_key
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
            color: COLORS.TEXT_MEDIUM,
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
            color: COLORS.TEXT_LIGHT,
            fontFamily: 'monospace',
            backgroundColor: COLORS.BG_HOVER,
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
    color: COLORS.TEXT_LIGHT,
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
      backgroundColor: COLORS.BG_HOVER,
      color: COLORS.TEXT_DARK
    },
    '&:active': {
      backgroundColor: COLORS.BG_ACTIVE
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
  const [copy_success, set_copy_success] = useState(false)

  const copy_to_clipboard = () => {
    navigator.clipboard
      .writeText(session_id)
      .then(() => {
        set_copy_success(true)
        setTimeout(() => set_copy_success(false), COPY_SUCCESS_TIMEOUT_MS)
      })
      .catch((err) => console.error('Failed to copy session ID: ', err))
  }

  return (
    <Box onClick={copy_to_clipboard} sx={SESSION_ID_STYLES.container}>
      <span>{session_id}</span>
      <Box sx={SESSION_ID_STYLES.icon_wrapper}>
        {copy_success ? (
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
  external_session_info,
  thread_state,
  created_at,
  updated_at,
  message_count,
  user_message_count,
  assistant_message_count,
  tool_call_count,
  thread_cost_display,
  thread_id,
  dispatch,
  user_owns_thread
}) => {
  const working_directory = external_session_info?.working_directory
  const session_provider = external_session_info?.provider
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

      {thread_state && thread_id && (
        <ThreadStateField
          thread_state={thread_state}
          thread_id={thread_id}
          user_owns_thread={user_owns_thread}
          is_first={get_is_first()}
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
    </Box>
  )
}

ThreadStats.propTypes = {
  total_tokens: PropTypes.number.isRequired,
  session_id: PropTypes.string,
  duration: PropTypes.string,
  models: PropTypes.arrayOf(PropTypes.string).isRequired,
  external_session_info: PropTypes.shape({
    provider: PropTypes.string,
    session_id: PropTypes.string,
    working_directory: PropTypes.string
  }),
  thread_state: PropTypes.string,
  created_at: PropTypes.string,
  updated_at: PropTypes.string,
  message_count: PropTypes.number,
  user_message_count: PropTypes.number,
  assistant_message_count: PropTypes.number,
  tool_call_count: PropTypes.number,
  thread_cost_display: PropTypes.string,
  thread_id: PropTypes.string,
  dispatch: PropTypes.func,
  user_owns_thread: PropTypes.bool.isRequired
}

const ExternalSessionChips = ({ external_session_info, thread_state }) => {
  if (!external_session_info && !thread_state) return null

  return (
    <Box
      sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      {external_session_info && (
        <>
          <span className='chip'>{external_session_info.provider}</span>
          {external_session_info.working_directory && (
            <span className='chip'>
              {external_session_info.working_directory}
            </span>
          )}
        </>
      )}
      {thread_state && <span className='chip'>{thread_state}</span>}
    </Box>
  )
}

ExternalSessionChips.propTypes = {
  external_session_info: PropTypes.shape({
    provider: PropTypes.string,
    session_id: PropTypes.string,
    working_directory: PropTypes.string
  }),
  thread_state: PropTypes.string
}

const ThreadHeader = ({ metadata, thread_id }) => {
  const dispatch = useDispatch()
  const {
    title,
    description,
    total_tokens,
    duration,
    models,
    external_session_info,
    thread_state,
    created_at,
    updated_at,
    message_count,
    user_message_count,
    assistant_message_count,
    tool_call_count,
    working_directory_formatted,
    thread_user_public_key
  } = use_thread_metadata(metadata)

  // Get current user's public key and cost display from Redux store
  const app_state = useSelector(get_app)
  const current_user_public_key = app_state.get('user_public_key')
  const thread_cost_display = useSelector(get_thread_cost_display)

  // Check if current user owns this thread
  const user_owns_thread =
    current_user_public_key &&
    thread_user_public_key &&
    current_user_public_key === thread_user_public_key

  return (
    <MetadataContainer
      background_color='white'
      border_radius={2}
      sx={{ marginTop: '16px' }}>
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        <ThreadTitle
          title={title}
          description={description}
          working_directory_formatted={working_directory_formatted}
        />
      </Box>
      <ThreadStats
        total_tokens={total_tokens}
        session_id={external_session_info?.session_id}
        duration={duration}
        models={models}
        external_session_info={external_session_info}
        thread_state={thread_state}
        created_at={created_at}
        updated_at={updated_at}
        message_count={message_count}
        user_message_count={user_message_count}
        assistant_message_count={assistant_message_count}
        tool_call_count={tool_call_count}
        thread_cost_display={thread_cost_display}
        thread_id={thread_id}
        dispatch={dispatch}
        user_owns_thread={user_owns_thread}
      />
    </MetadataContainer>
  )
}

ThreadHeader.propTypes = {
  metadata: PropTypes.object,
  thread_id: PropTypes.string
}

export default ThreadHeader
