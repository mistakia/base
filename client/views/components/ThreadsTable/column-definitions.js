import React from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import ProviderLogo from '@views/components/primitives/ProviderLogo.js'
import {
  TABLE_DATA_TYPES,
  TABLE_OPERATORS
} from 'react-table/src/constants.mjs'
import { get_thread_cost_by_id } from '@core/threads/selectors'
import { format_shorthand_time } from '@views/utils/date-formatting.js'

const get_state_color = (state) => {
  switch (state) {
    case 'active':
      return '#4caf50'
    case 'archived':
      return '#757575'
    default:
      return '#9e9e9e'
  }
}

const get_state_icon = (state) => {
  switch (state) {
    case 'active':
      return '●'
    case 'archived':
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

const TitleCell = ({ row }) => {
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
      title={thread.working_directory_path || ''}
      onClick={handle_click}
      style={{
        height: 'fit-content'
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ fontWeight: '500' }}>{thread.title}</div>
      </div>
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
      title={thread.working_directory_path || ''}
      onClick={handle_click}
      style={{
        height: 'fit-content',
        cursor: 'pointer',
        textDecoration: 'underline',
        color: '#1976d2'
      }}>
      {thread.working_directory || '—'}
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

// Formatting cells for server-provided data
const UpdatedAtCell = ({ row }) => {
  const thread = row.original
  const formatted_time = format_shorthand_time(thread.updated_at)

  return (
    <div className='cell-content' style={{ height: 'fit-content' }}>
      <span>{formatted_time}</span>
    </div>
  )
}

const DurationCell = ({ row }) => {
  const thread = row.original
  let formatted_duration = '—'

  if (thread.duration_minutes > 0) {
    if (thread.duration_minutes < 1) {
      formatted_duration = `${Math.round(thread.duration_minutes * 60)}s`
    } else if (thread.duration_minutes < 60) {
      formatted_duration = `${Math.round(thread.duration_minutes)}m`
    } else {
      const hours = Math.floor(thread.duration_minutes / 60)
      const minutes = Math.round(thread.duration_minutes % 60)
      formatted_duration = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
    }
  }

  // Get percentile styling if available
  const percentile_style =
    thread.percentile_data?.duration_minutes_percentile_style || {}

  return (
    <div
      className='cell-content'
      style={{
        height: 'fit-content',
        ...percentile_style
      }}>
      <span>{formatted_duration}</span>
    </div>
  )
}

UpdatedAtCell.propTypes = {
  row: PropTypes.object.isRequired
}

DurationCell.propTypes = {
  row: PropTypes.object.isRequired
}

export const thread_columns = {
  title: {
    column_id: 'title',
    header_label: 'Title',
    accessorKey: 'title',
    component: TitleCell,
    data_type: TABLE_DATA_TYPES.TEXT,
    operators: [
      TABLE_OPERATORS.LIKE,
      TABLE_OPERATORS.NOT_LIKE,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IS_EMPTY,
      TABLE_OPERATORS.IS_NOT_EMPTY
    ],
    size: 350,
    minSize: 250,
    maxSize: 500
  },
  session_provider: {
    column_id: 'session_provider',
    header_label: '',
    accessorKey: 'session_provider',
    component: ProviderCell,
    data_type: TABLE_DATA_TYPES.TEXT,
    operators: [
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN,
      TABLE_OPERATORS.IS_EMPTY,
      TABLE_OPERATORS.IS_NOT_EMPTY
    ],
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
    operators: [
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN
    ],
    size: 50,
    minSize: 40,
    maxSize: 60
  },
  updated_at: {
    column_id: 'updated_at',
    header_label: 'Last Updated',
    accessorKey: 'updated_at',
    component: UpdatedAtCell,
    data_type: TABLE_DATA_TYPES.DATE,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL
    ],
    size: 110,
    minSize: 90,
    maxSize: 130
  },
  duration_minutes: {
    column_id: 'duration_minutes',
    header_label: 'Duration',
    accessorKey: 'duration_minutes',
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 80,
    minSize: 60,
    maxSize: 100
  },
  working_directory: {
    column_id: 'working_directory',
    header_label: 'Working Directory',
    accessorKey: 'working_directory',
    component: WorkingDirectoryCell,
    data_type: TABLE_DATA_TYPES.TEXT,
    operators: [
      TABLE_OPERATORS.LIKE,
      TABLE_OPERATORS.NOT_LIKE,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IS_EMPTY,
      TABLE_OPERATORS.IS_NOT_EMPTY
    ],
    size: 300,
    minSize: 200,
    maxSize: 400
  },
  message_count: {
    column_id: 'message_count',
    header_label: 'Total Messages',
    accessorKey: 'message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 100,
    minSize: 80,
    maxSize: 120
  },
  user_message_count: {
    column_id: 'user_message_count',
    header_label: 'User Messages',
    accessorKey: 'user_message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 100,
    minSize: 80,
    maxSize: 120
  },
  assistant_message_count: {
    column_id: 'assistant_message_count',
    header_label: 'Assistant Messages',
    accessorKey: 'assistant_message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 120,
    minSize: 100,
    maxSize: 140
  },
  tool_call_count: {
    column_id: 'tool_call_count',
    header_label: 'Tool Calls',
    accessorKey: 'tool_call_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 80,
    minSize: 60,
    maxSize: 100
  },
  token_count: {
    column_id: 'token_count',
    header_label: 'Tokens',
    accessorKey: 'token_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
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
    operators: [],
    size: 80,
    minSize: 60,
    maxSize: 100
  }
}

// PropTypes for remaining cell components
TitleCell.propTypes = {
  row: PropTypes.object.isRequired
}

StateCell.propTypes = {
  row: PropTypes.object.isRequired
}

WorkingDirectoryCell.propTypes = {
  row: PropTypes.object.isRequired
}
