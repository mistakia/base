import React from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import ProviderLogo from '@views/components/primitives/ProviderLogo.js'
import { TABLE_DATA_TYPES } from 'react-table/src/constants.mjs'
import { get_thread_cost_by_id } from '@core/threads/selectors'

const get_state_color = (state) => {
  switch (state) {
    case 'active':
      return '#4caf50'
    case 'paused':
      return '#ff9800'
    case 'terminated':
      return '#f44336'
    default:
      return '#9e9e9e'
  }
}

const get_state_icon = (state) => {
  switch (state) {
    case 'active':
      return '●'
    case 'paused':
      return '⏸'
    case 'terminated':
      return '■'
    default:
      return '●'
  }
}

const ProviderCell = ({ row }) => {
  const thread = row.original
  const session_provider = thread.session_provider

  if (!session_provider) {
    return (
      <div className='cell-content' style={{ height: 'fit-content' }}>
        <span style={{ color: '#999' }}>—</span>
      </div>
    )
  }

  return (
    <div className='cell-content' style={{ height: 'fit-content' }}>
      <ProviderLogo
        provider={session_provider}
        size={16}
        title={`Provider: ${session_provider}`}
        decorative={false}
      />
    </div>
  )
}

ProviderCell.propTypes = {
  row: PropTypes.object.isRequired
}

const StateCell = ({ row }) => {
  const thread = row.original
  const state = thread.thread_state

  return (
    <div className='cell-content' style={{ height: 'fit-content' }}>
      <span
        style={{
          color: get_state_color(state),
          fontSize: '14px',
          lineHeight: '1',
          display: 'flex',
          justifyContent: 'center'
        }}
        title={`Status: ${state}`}>
        {get_state_icon(state)}
      </span>
    </div>
  )
}

const WorkingDirectoryCell = ({ row }) => {
  const thread = row.original
  const navigate = useNavigate()

  const handle_click = (event) => {
    const thread_id = thread.thread_id || thread.id
    if (!thread_id) return

    if (event.metaKey || event.ctrlKey) {
      window.open(`/thread/${thread_id}`, '_blank')
    } else {
      navigate(`/thread/${thread_id}`)
    }
  }

  return (
    <div
      className='cell-content'
      title={thread.formatted_directory_full_path || ''}
      onClick={handle_click}
      style={{
        cursor: 'pointer',
        textDecoration: 'underline',
        color: '#1976d2'
      }}>
      {thread.formatted_directory}
    </div>
  )
}

const CostCell = ({ row }) => {
  const thread = row.original
  const thread_id = thread.thread_id || thread.id

  // Get cost from Redux store using the thread ID
  const cost_display = useSelector((state) =>
    thread_id ? get_thread_cost_by_id(state, thread_id) : null
  )

  if (!cost_display) {
    return (
      <div className='cell-content' style={{ height: 'fit-content' }}>
        <span style={{ color: '#999' }}>—</span>
      </div>
    )
  }

  return (
    <div className='cell-content' style={{ height: 'fit-content' }}>
      <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
        {cost_display}
      </span>
    </div>
  )
}

CostCell.propTypes = {
  row: PropTypes.object.isRequired
}

export const thread_columns = {
  session_provider: {
    column_id: 'session_provider',
    header_label: '',
    accessorKey: 'session_provider',
    component: ProviderCell,
    data_type: TABLE_DATA_TYPES.TEXT,
    size: 40,
    minSize: 40,
    maxSize: 80
  },
  thread_state: {
    column_id: 'thread_state',
    header_label: '',
    accessorKey: 'thread_state',
    component: StateCell,
    data_type: TABLE_DATA_TYPES.SELECT,
    size: 50,
    minSize: 40,
    maxSize: 60
  },
  updated_at: {
    column_id: 'updated_at',
    header_label: 'Last Updated',
    accessorKey: 'formatted_updated_at',
    data_type: TABLE_DATA_TYPES.DATE,
    size: 110,
    minSize: 90,
    maxSize: 130
  },
  duration: {
    column_id: 'duration',
    header_label: 'Duration',
    accessorKey: 'formatted_duration',
    data_type: TABLE_DATA_TYPES.TEXT,
    size: 80,
    minSize: 60,
    maxSize: 100
  },
  working_directory: {
    column_id: 'working_directory',
    header_label: 'Working Directory',
    accessorKey: 'formatted_directory',
    component: WorkingDirectoryCell,
    data_type: TABLE_DATA_TYPES.TEXT,
    size: 300,
    minSize: 200,
    maxSize: 400
  },
  message_count: {
    column_id: 'message_count',
    header_label: 'Total Messages',
    accessorKey: 'formatted_message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    size: 100,
    minSize: 80,
    maxSize: 120
  },
  user_message_count: {
    column_id: 'user_message_count',
    header_label: 'User Messages',
    accessorKey: 'formatted_user_message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    size: 100,
    minSize: 80,
    maxSize: 120
  },
  assistant_message_count: {
    column_id: 'assistant_message_count',
    header_label: 'Assistant Messages',
    accessorKey: 'formatted_assistant_message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    size: 120,
    minSize: 100,
    maxSize: 140
  },
  tool_call_count: {
    column_id: 'tool_call_count',
    header_label: 'Tool Calls',
    accessorKey: 'formatted_tool_call_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    size: 80,
    minSize: 60,
    maxSize: 100
  },
  token_count: {
    column_id: 'token_count',
    header_label: 'Tokens',
    accessorKey: 'formatted_token_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    size: 80,
    minSize: 60,
    maxSize: 100
  },
  cost: {
    column_id: 'cost',
    header_label: 'Cost',
    accessorKey: 'thread_id',
    component: CostCell,
    data_type: TABLE_DATA_TYPES.TEXT,
    size: 80,
    minSize: 60,
    maxSize: 100
  }
}

export const default_visible_columns = [
  'thread_state',
  'session_provider',
  'working_directory',
  'updated_at',
  'duration',
  'message_count',
  'user_message_count',
  'assistant_message_count',
  'tool_call_count',
  'token_count',
  'cost'
]

// PropTypes for remaining cell components
StateCell.propTypes = {
  row: PropTypes.object.isRequired
}

WorkingDirectoryCell.propTypes = {
  row: PropTypes.object.isRequired
}
