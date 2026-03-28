import React from 'react'
import PropTypes from 'prop-types'
import {
  TABLE_DATA_TYPES,
  TABLE_OPERATORS
} from 'react-table/src/constants.mjs'
import { format_shorthand_time } from '@views/utils/date-formatting.js'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import { COLORS } from '@theme/colors.js'
import {
  EditableStatusField,
  EditablePriorityField
} from '@views/components/InlineSelect'
import TitleCell from '../primitives/cells/TitleCell.js'
import TagsCell from '../primitives/cells/TagsCell.js'

const StatusCell = ({ row }) => {
  const task = row.original
  return (
    <EditableStatusField
      value={task.status}
      base_uri={task.base_uri}
      context='table'
      editable={task.can_write !== false}
    />
  )
}

const PriorityCell = ({ row }) => {
  const task = row.original
  return (
    <EditablePriorityField
      value={task.priority}
      base_uri={task.base_uri}
      context='table'
      editable={task.can_write !== false}
    />
  )
}

const FinishByCell = ({ row }) => {
  const task = row.original
  const finish_by = task.finish_by

  if (!finish_by) {
    return (
      <div className='cell-content' style={{ height: 'fit-content' }}>
        <span style={{ color: COLORS.text_tertiary }}>—</span>
      </div>
    )
  }

  const date = new Date(finish_by)
  const is_overdue = date < new Date() && task.status !== TASK_STATUS.COMPLETED

  return (
    <div
      className='cell-content'
      style={{ height: 'fit-content', minHeight: '32px' }}>
      <span style={{ color: is_overdue ? COLORS.error : 'inherit' }}>
        {format_shorthand_time(date)}
      </span>
    </div>
  )
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
  },
  snooze_until: {
    column_id: 'snooze_until',
    header_label: 'Snoozed Until',
    accessorKey: 'snooze_until',
    accessorFn: ({ snooze_until }) => {
      if (!snooze_until) return '—'
      return format_shorthand_time(new Date(snooze_until))
    },
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
    size: 60,
    minSize: 25,
    maxSize: 200
  },
  finished_at: {
    column_id: 'finished_at',
    header_label: 'Finished',
    accessorKey: 'finished_at',
    accessorFn: ({ finished_at }) => {
      if (!finished_at) return '—'
      return format_shorthand_time(new Date(finished_at))
    },
    data_type: TABLE_DATA_TYPES.DATE,
    operators: [
      TABLE_OPERATORS.GREATER_THAN,
      TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
      TABLE_OPERATORS.LESS_THAN,
      TABLE_OPERATORS.LESS_THAN_OR_EQUAL,
      TABLE_OPERATORS.IS_NULL,
      TABLE_OPERATORS.IS_NOT_NULL
    ],
    size: 60,
    minSize: 25,
    maxSize: 100
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
    column_values: [], // Populated dynamically from available tags
    size: 320,
    minSize: 150,
    maxSize: 450
  }
}
