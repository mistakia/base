import React from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import ProviderLogo from '@views/components/primitives/ProviderLogo.js'
import { TABLE_DATA_TYPES } from 'react-table/src/constants.mjs'

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
  const session_provider =
    thread.session_provider || thread.external_session?.session_provider

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
    accessorKey: 'working_directory',
    component: WorkingDirectoryCell,
    data_type: TABLE_DATA_TYPES.TEXT,
    size: 300,
    minSize: 200,
    maxSize: 400
  },
  message_count: {
    column_id: 'message_count',
    header_label: 'Messages',
    accessorKey: 'formatted_message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    size: 75
  },
  token_count: {
    column_id: 'token_count',
    header_label: 'Tokens',
    accessorKey: 'formatted_token_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
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
  'token_count'
]

// PropTypes for remaining cell components
StateCell.propTypes = {
  row: PropTypes.object.isRequired
}

WorkingDirectoryCell.propTypes = {
  row: PropTypes.object.isRequired
}
