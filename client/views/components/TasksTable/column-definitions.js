import React from 'react'
import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import {
  TABLE_DATA_TYPES,
  TABLE_OPERATORS
} from 'react-table/src/constants.mjs'
import { format_shorthand_time } from '@views/utils/date-formatting.js'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'
import { to_snake_slug } from '@core/utils'

const TitleCell = ({ row }) => {
  const navigate = useNavigate()
  const task = row.original

  const handle_click = () => {
    if (task.is_redacted) {
      return
    }

    if (task.base_uri) {
      // Use the proper base URI conversion utility
      // base_uri format is like "user:task/base/my-task.md"
      // convert_base_uri_to_path converts it to proper client path
      const navigation_path = convert_base_uri_to_path(task.base_uri)
      navigate(navigation_path)
    }
  }

  return (
    <div
      className='cell-content'
      onClick={handle_click}
      style={{
        height: 'fit-content',
        justifyContent: 'flex-start',
        width: '100%',
        cursor: 'pointer'
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ fontWeight: '500', lineHeight: '1.2' }}>
          {task.title || 'Untitled'}
        </div>
      </div>
    </div>
  )
}

const StatusCell = ({ row }) => {
  const task = row.original
  const status = task.status || TASK_STATUS.NO_STATUS
  const status_slug = to_snake_slug(status) || 'no_status'

  return (
    <div
      className='cell-content'
      style={{
        height: 'fit-content',
        justifyContent: 'flex-start',
        width: '100%'
      }}>
      <span
        data-status={status_slug}
        className='task-status'
        style={{ fontWeight: 500, fontSize: '0.875rem', lineHeight: '1.2' }}>
        {status}
      </span>
    </div>
  )
}

const PriorityCell = ({ row }) => {
  const task = row.original
  const priority = task.priority || TASK_PRIORITY.NONE
  const priority_slug = to_snake_slug(priority) || 'none'

  return (
    <div
      className='cell-content'
      style={{
        height: 'fit-content',
        justifyContent: 'flex-start',
        width: '100%'
      }}>
      <span
        data-priority={priority_slug}
        className='task-priority'
        style={{ fontWeight: 500, fontSize: '0.875rem', lineHeight: '1.2' }}>
        {priority}
      </span>
    </div>
  )
}

const FinishByCell = ({ row }) => {
  const task = row.original
  const finish_by = task.finish_by

  if (!finish_by) {
    return (
      <div className='cell-content' style={{ height: 'fit-content' }}>
        <span style={{ color: '#999' }}>—</span>
      </div>
    )
  }

  const date = new Date(finish_by)
  const is_overdue = date < new Date() && task.status !== TASK_STATUS.COMPLETED

  return (
    <div
      className='cell-content'
      style={{ height: 'fit-content', minHeight: '32px' }}>
      <span style={{ color: is_overdue ? '#f44336' : 'inherit' }}>
        {format_shorthand_time(date)}
      </span>
    </div>
  )
}

TitleCell.propTypes = {
  row: PropTypes.object.isRequired
}

StatusCell.propTypes = {
  row: PropTypes.object.isRequired
}

PriorityCell.propTypes = {
  row: PropTypes.object.isRequired
}

FinishByCell.propTypes = {
  row: PropTypes.object.isRequired
}

export const task_columns = {
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
    size: 800,
    minSize: 200,
    maxSize: 1000
  },
  status: {
    column_id: 'status',
    header_label: 'Status',
    accessorKey: 'status',
    component: StatusCell,
    data_type: TABLE_DATA_TYPES.SELECT,
    operators: [
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN
    ],
    column_values: Object.values(TASK_STATUS),
    size: 150,
    minSize: 100,
    maxSize: 200
  },
  priority: {
    column_id: 'priority',
    header_label: 'Priority',
    accessorKey: 'priority',
    component: PriorityCell,
    data_type: TABLE_DATA_TYPES.SELECT,
    operators: [
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IN,
      TABLE_OPERATORS.NOT_IN
    ],
    column_values: Object.values(TASK_PRIORITY),
    size: 120,
    minSize: 80,
    maxSize: 150
  },
  finish_by: {
    column_id: 'finish_by',
    header_label: 'Due',
    accessorKey: 'finish_by',
    component: FinishByCell,
    data_type: TABLE_DATA_TYPES.DATE,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IS_NULL,
      TABLE_OPERATORS.IS_NOT_NULL
    ],
    size: 50,
    minSize: 25,
    maxSize: 200
  },
  estimated_total_duration: {
    column_id: 'estimated_total_duration',
    header_label: 'Duration',
    accessorKey: 'estimated_total_duration',
    accessorFn: ({ estimated_total_duration }) => {
      if (!estimated_total_duration) return '—'

      if (estimated_total_duration < 1) {
        return `${Math.round(estimated_total_duration * 60)}m`
      } else if (estimated_total_duration % 1 === 0) {
        return `${estimated_total_duration}h`
      } else {
        return `${Math.floor(estimated_total_duration)}h ${Math.round((estimated_total_duration % 1) * 60)}m`
      }
    },
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
    minSize: 80,
    maxSize: 150
  },
  assigned_to: {
    column_id: 'assigned_to',
    header_label: 'Assigned To',
    accessorKey: 'assigned_to',
    accessorFn: ({ assigned_to }) => {
      if (!assigned_to) return '—'
      return assigned_to
    },
    data_type: TABLE_DATA_TYPES.TEXT,
    operators: [
      TABLE_OPERATORS.LIKE,
      TABLE_OPERATORS.NOT_LIKE,
      TABLE_OPERATORS.EQUAL,
      TABLE_OPERATORS.NOT_EQUAL,
      TABLE_OPERATORS.IS_NULL,
      TABLE_OPERATORS.IS_NOT_NULL
    ],
    size: 150,
    minSize: 100,
    maxSize: 200
  },
  created_at: {
    column_id: 'created_at',
    header_label: 'Created',
    accessorKey: 'created_at',
    accessorFn: ({ created_at }) => {
      if (!created_at) return '—'
      return format_shorthand_time(new Date(created_at))
    },
    data_type: TABLE_DATA_TYPES.DATE,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL
    ],
    size: 60,
    minSize: 25,
    maxSize: 100
  },
  updated_at: {
    column_id: 'updated_at',
    header_label: 'Updated',
    accessorKey: 'updated_at',
    accessorFn: ({ updated_at }) => {
      if (!updated_at) return '—'
      return format_shorthand_time(new Date(updated_at))
    },
    data_type: TABLE_DATA_TYPES.DATE,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL
    ],
    size: 60,
    minSize: 25,
    maxSize: 100
  }
}
