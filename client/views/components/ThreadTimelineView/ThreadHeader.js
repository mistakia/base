import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useSelector } from 'react-redux'

import '@styles/chip.styl'
import { format_relative_time } from '@views/utils/date-formatting.js'
import { get_thread_cost_display } from '@core/threads/selectors'
import {
  extract_message_counts,
  extract_tool_call_count,
  extract_total_tokens,
  extract_duration,
  extract_working_directory,
  extract_session_provider,
  extract_thread_state
} from '@views/utils/thread-metadata-extractor.js'

const extract_thread_title = (metadata) => {
  if (!metadata || !metadata.getIn) {
    return ''
  }
  const summaries = metadata.getIn([
    'external_session',
    'provider_metadata',
    'summaries'
  ])
  if (!summaries || !summaries.length) {
    return ''
  }
  return summaries[0]
}

const extract_models = (metadata) => {
  if (!metadata || !metadata.getIn) {
    return []
  }
  return (
    metadata.getIn(['external_session', 'provider_metadata', 'models']) || []
  )
}

const format_token_shorthand = ({ count }) => {
  if (count == null || isNaN(count)) return '0'

  const absolute_count = Math.abs(count)

  const format_with_suffix = (value, suffix) => {
    const fixed = value.toFixed(1)
    const trimmed = fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
    return `${trimmed}${suffix}`
  }

  if (absolute_count >= 1e12) return format_with_suffix(count / 1e12, 'T')
  if (absolute_count >= 1e9) return format_with_suffix(count / 1e9, 'B')
  if (absolute_count >= 1e6) return format_with_suffix(count / 1e6, 'M')
  if (absolute_count >= 1e3) return format_with_suffix(count / 1e3, 'K')
  return `${count}`
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

  return {
    title: extract_thread_title(metadata),
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
    working_directory: working_directory.path
  }
}

// Sub-components for better organization
const ThreadTitle = ({ title }) => {
  if (!title) return null

  return (
    <h5
      style={{
        marginBottom: '16px',
        fontWeight: 'bold',
        fontSize: '20px',
        margin: 0
      }}>
      {title}
    </h5>
  )
}

ThreadTitle.propTypes = {
  title: PropTypes.string
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
  thread_cost_display
}) => {
  const MetadataRow = ({
    label,
    value,
    scrollable = false,
    is_first = false
  }) => (
    <Box
      sx={{
        borderTop: is_first ? 'none' : '1px solid #e0e0e0',
        borderBottom: 'none',
        position: 'relative',
        minHeight: '60px'
      }}>
      <Box
        sx={{
          position: 'absolute',
          top: '8px',
          left: '12px',
          fontSize: '11px',
          color: '#666',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
        {label}
      </Box>
      <Box
        sx={{
          pt: '28px',
          pb: '12px',
          px: '12px',
          fontSize: '14px',
          color: '#333',
          fontWeight: 400,
          ...(scrollable
            ? {
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace'
              }
            : {
                wordBreak: 'break-all'
              })
        }}>
        {value}
      </Box>
    </Box>
  )

  MetadataRow.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.node.isRequired,
    scrollable: PropTypes.bool,
    is_first: PropTypes.bool
  }

  const LabeledCell = ({
    label,
    value,
    scrollable = false,
    add_left_border = false
  }) => (
    <Box
      sx={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        borderLeft: add_left_border ? '1px solid #e0e0e0' : 'none'
      }}>
      <Box
        sx={{
          position: 'absolute',
          top: '8px',
          left: '12px',
          fontSize: '11px',
          color: '#666',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
        {label}
      </Box>
      <Box
        sx={{
          pt: '28px',
          pb: '12px',
          px: '12px',
          fontSize: '14px',
          color: '#333',
          fontWeight: 400,
          ...(scrollable
            ? {
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace'
              }
            : {
                wordBreak: 'break-all'
              })
        }}>
        {value}
      </Box>
    </Box>
  )

  LabeledCell.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.node.isRequired,
    scrollable: PropTypes.bool,
    add_left_border: PropTypes.bool
  }

  const TwoCellRow = ({
    left_label,
    left_value,
    right_label,
    right_value,
    is_first = false
  }) => (
    <Box
      sx={{
        borderTop: is_first ? 'none' : '1px solid #e0e0e0',
        borderBottom: 'none',
        display: 'flex',
        minHeight: '60px'
      }}>
      <LabeledCell label={left_label} value={left_value} />
      <LabeledCell
        label={right_label}
        value={right_value}
        add_left_border={true}
      />
    </Box>
  )

  TwoCellRow.propTypes = {
    left_label: PropTypes.string.isRequired,
    left_value: PropTypes.node.isRequired,
    right_label: PropTypes.string.isRequired,
    right_value: PropTypes.node.isRequired,
    is_first: PropTypes.bool
  }

  const render_models_value = ({ models }) => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        fontSize: '12px'
      }}>
      {models.map((model) => (
        <Box key={model} sx={{ fontFamily: 'monospace' }}>
          {model}
        </Box>
      ))}
    </Box>
  )

  const working_directory = external_session_info?.working_directory

  // Format date as YYYY/MM/DD HH:MM AM/PM
  const format_short_date = (date_string) => {
    if (!date_string) return null

    try {
      const date = new Date(date_string)
      if (isNaN(date.getTime())) return null

      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')

      let hours = date.getHours()
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const ampm = hours >= 12 ? 'PM' : 'AM'
      hours = hours % 12
      hours = hours || 12

      return `${year}/${month}/${day} ${hours}:${minutes} ${ampm}`
    } catch {
      return null
    }
  }

  // Create date display components with relative time and absolute timestamp
  const DateDisplay = ({ date }) => {
    if (!date) return 'Unknown'

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <Box sx={{ fontSize: '14px', color: '#333' }}>
          {format_relative_time(date)}
        </Box>
        <Box sx={{ fontSize: '11px', color: '#999' }}>
          {format_short_date(date)}
        </Box>
      </Box>
    )
  }

  DateDisplay.propTypes = {
    date: PropTypes.string
  }

  // Determine which rows will be rendered to set is_first correctly
  const has_session_provider = external_session_info?.provider
  const has_thread_state = thread_state
  const has_working_directory = working_directory
  const has_dates = created_at || updated_at

  return (
    <Box>
      {has_session_provider && (
        <MetadataRow
          label='Session Provider'
          value={external_session_info.provider}
          is_first={true}
        />
      )}
      {has_thread_state && (
        <MetadataRow
          label='Thread State'
          value={thread_state}
          is_first={!has_session_provider}
        />
      )}
      {has_working_directory && (
        <MetadataRow
          label='Directory'
          value={working_directory}
          scrollable={true}
          is_first={!has_session_provider && !has_thread_state}
        />
      )}
      {has_dates && (
        <TwoCellRow
          left_label='Created'
          left_value={<DateDisplay date={created_at} />}
          right_label='Last Updated'
          right_value={<DateDisplay date={updated_at} />}
          is_first={
            !has_session_provider && !has_thread_state && !has_working_directory
          }
        />
      )}
      {/* Display tokens/duration OR tokens/cost based on what data is available */}
      {duration ? (
        <TwoCellRow
          left_label='Tokens'
          left_value={format_token_shorthand({ count: total_tokens })}
          right_label='Duration'
          right_value={duration}
          is_first={
            !has_session_provider &&
            !has_thread_state &&
            !has_working_directory &&
            !has_dates
          }
        />
      ) : (
        <MetadataRow
          label='Tokens'
          value={format_token_shorthand({ count: total_tokens })}
          is_first={
            !has_session_provider &&
            !has_thread_state &&
            !has_working_directory &&
            !has_dates
          }
        />
      )}
      {/* Message counts - show detailed breakdown if available, otherwise show total */}
      {user_message_count > 0 || assistant_message_count > 0 ? (
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
      {tool_call_count > 0 && thread_cost_display ? (
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
      {models.length > 0 && (
        <MetadataRow label='Models' value={render_models_value({ models })} />
      )}
      {session_id && (
        <MetadataRow
          label='External Session ID'
          value={
            <Box sx={{ fontSize: '12px', color: '#888' }}>{session_id}</Box>
          }
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
  thread_cost_display: PropTypes.string
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

const ThreadHeader = ({ metadata }) => {
  const {
    title,
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
    tool_call_count
  } = use_thread_metadata(metadata)

  // Get cost display from Redux store
  const thread_cost_display = useSelector(get_thread_cost_display)

  return (
    <Box
      sx={{
        backgroundColor: 'white',
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: '16px'
      }}>
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        <ThreadTitle title={title} />
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
      />
    </Box>
  )
}

ThreadHeader.propTypes = {
  metadata: PropTypes.object
}

export default ThreadHeader
