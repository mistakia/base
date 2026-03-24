import React from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { Box, Chip, Tooltip } from '@mui/material'
import ProviderLogo from '@views/components/primitives/ProviderLogo.js'
import {
  TABLE_DATA_TYPES,
  TABLE_OPERATORS
} from 'react-table/src/constants.mjs'
import { COLORS } from '@theme/colors.js'
import { format_cost } from '@core/utils/pricing-calculator'
import {
  format_shorthand_time,
  format_shorthand_number
} from '@views/utils/date-formatting.js'
import { THREAD_STATE } from '#libs-shared/thread-constants.mjs'
import { TagChip, extract_tag_title } from '@views/components/primitives/styled'

// Column group definitions
const COLUMN_GROUPS = {
  messages: {
    column_group_id: 'messages',
    priority: 1,
    label: 'Messages'
  }
}

const get_state_color = (state) => {
  switch (state) {
    case 'active':
      return COLORS.success
    case 'archived':
      return COLORS.text_secondary
    default:
      return COLORS.text_tertiary
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
  const source_provider = thread.source_provider

  if (!source_provider) {
    return (
      <div className='cell-content' style={{ height: 'fit-content' }}>
        <span style={{ color: COLORS.text_tertiary }}>—</span>
      </div>
    )
  }

  return (
    <div className='cell-content' style={{ height: 'fit-content' }}>
      <ProviderLogo
        provider={source_provider}
        size={16}
        title={`Provider: ${source_provider}`}
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
        height: 'fit-content',
        justifyContent: 'flex-start',
        width: '100%'
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
        color: COLORS.primary,
        width: '80%',
        justifyContent: 'flex-start',
        textAlign: 'left'
      }}>
      {thread.working_directory || '—'}
    </div>
  )
}

const CostCell = ({ row }) => {
  const thread = row.original

  // Use server-provided cost directly
  const cost_display = format_cost(thread.total_cost, thread.currency)

  if (!cost_display) {
    return (
      <div className='cell-content' style={{ height: 'fit-content' }}>
        <span style={{ color: COLORS.text_tertiary }}>—</span>
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

  return (
    <div
      className='cell-content'
      style={{
        height: 'fit-content'
      }}>
      <span>{formatted_duration}</span>
    </div>
  )
}

DurationCell.propTypes = {
  row: PropTypes.object.isRequired
}

const MAX_VISIBLE_TAGS = 3

const TagsCell = ({ row, column }) => {
  const thread = row.original
  const tags = thread.tags || []
  const available_tags = column?.columnDef?.column_values || []

  if (tags.length === 0) {
    return (
      <div
        className='cell-content'
        style={{
          height: 'fit-content',
          display: 'flex',
          justifyContent: 'flex-start'
        }}>
        <span style={{ color: COLORS.text_tertiary }}>—</span>
      </div>
    )
  }

  const tag_lookup = {}
  for (const tag of available_tags) {
    if (tag.value) {
      tag_lookup[tag.value] = tag
    }
  }

  const visible_tags = tags.slice(0, MAX_VISIBLE_TAGS)
  const remaining_count = tags.length - MAX_VISIBLE_TAGS
  const remaining_tags = tags.slice(MAX_VISIBLE_TAGS)

  return (
    <div
      className='cell-content'
      style={{
        height: 'fit-content',
        display: 'flex',
        justifyContent: 'flex-start',
        width: '100%'
      }}>
      <Box
        sx={{
          display: 'flex',
          gap: 0.5,
          flexWrap: 'nowrap',
          alignItems: 'center',
          overflow: 'hidden'
        }}>
        {visible_tags.map((tag_uri) => {
          const tag_data = tag_lookup[tag_uri]
          return (
            <TagChip
              key={tag_uri}
              tag={
                tag_data
                  ? {
                      base_uri: tag_uri,
                      title: tag_data.label,
                      color: tag_data.color
                    }
                  : tag_uri
              }
              max_width='90px'
            />
          )
        })}
        {remaining_count > 0 && (
          <Tooltip
            title={remaining_tags.map(extract_tag_title).join(', ')}
            arrow
            placement='top'>
            <Chip
              label={`+${remaining_count}`}
              size='small'
              variant='outlined'
              sx={{
                fontSize: '10px',
                height: '20px',
                minWidth: '32px',
                '& .MuiChip-label': {
                  padding: '0 4px'
                }
              }}
            />
          </Tooltip>
        )}
      </Box>
    </div>
  )
}

TagsCell.propTypes = {
  row: PropTypes.object.isRequired,
  column: PropTypes.object
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
    size: 650,
    minSize: 250,
    maxSize: 800
  },
  source_provider: {
    column_id: 'source_provider',
    header_label: '',
    accessorKey: 'source_provider',
    component: ProviderCell,
    data_type: TABLE_DATA_TYPES.SELECT,
    operators: [
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN,
      TABLE_OPERATORS.IS_EMPTY,
      TABLE_OPERATORS.IS_NOT_EMPTY
    ],
    column_values: ['base', 'claude', 'cursor', 'chatgpt', 'pi'],
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
    column_values: Object.values(THREAD_STATE),
    size: 50,
    minSize: 40,
    maxSize: 60
  },
  created_at: {
    column_id: 'created_at',
    header_label: 'Created',
    accessorKey: 'created_at',
    accessorFn: ({ created_at }) => format_shorthand_time(created_at),
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
  updated_at: {
    column_id: 'updated_at',
    header_label: 'Updated',
    accessorKey: 'updated_at',
    accessorFn: ({ updated_at }) => format_shorthand_time(updated_at),
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
    header_label: 'Directory',
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
    size: 150,
    minSize: 80,
    maxSize: 500
  },
  tags: {
    column_id: 'tags',
    header_label: 'Tags',
    accessorKey: 'tags',
    component: TagsCell,
    data_type: TABLE_DATA_TYPES.SELECT,
    operators: [
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN,
      TABLE_OPERATORS.IS_EMPTY,
      TABLE_OPERATORS.IS_NOT_EMPTY
    ],
    column_values: [],
    size: 250,
    minSize: 150,
    maxSize: 400
  },
  message_count: {
    column_id: 'message_count',
    header_label: 'Total',
    accessorKey: 'message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    column_groups: [COLUMN_GROUPS.messages],
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 50,
    minSize: 30,
    maxSize: 120
  },
  user_message_count: {
    column_id: 'user_message_count',
    header_label: 'Human',
    accessorKey: 'user_message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    column_groups: [COLUMN_GROUPS.messages],
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 50,
    minSize: 30,
    maxSize: 120
  },
  assistant_message_count: {
    column_id: 'assistant_message_count',
    header_label: 'Assistant',
    accessorKey: 'assistant_message_count',
    data_type: TABLE_DATA_TYPES.NUMBER,
    column_groups: [COLUMN_GROUPS.messages],
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL
    ],
    size: 50,
    minSize: 30,
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
  total_tokens: {
    column_id: 'total_tokens',
    header_label: 'Tokens',
    accessorKey: 'total_tokens',
    accessorFn: ({ total_tokens }) => format_shorthand_number(total_tokens),
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
  },
  external_session_id: {
    column_id: 'external_session_id',
    header_label: 'Session ID',
    accessorKey: 'external_session_id',
    data_type: TABLE_DATA_TYPES.TEXT,
    operators: [
      TABLE_OPERATORS.LIKE,
      TABLE_OPERATORS.NOT_LIKE,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IS_EMPTY,
      TABLE_OPERATORS.IS_NOT_EMPTY
    ],
    size: 150,
    minSize: 80,
    maxSize: 300
  },
  user_public_key: {
    column_id: 'user_public_key',
    header_label: 'Owner',
    accessorKey: 'user_public_key',
    data_type: TABLE_DATA_TYPES.TEXT,
    operators: [
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IS_EMPTY,
      TABLE_OPERATORS.IS_NOT_EMPTY
    ],
    size: 120,
    minSize: 80,
    maxSize: 200
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
