import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box, List, ListItem } from '@mui/material'

import { MonospaceText } from '@components/primitives/styled'
import { ensure_string_result } from '../shared/result-utils'

import '@styles/checkbox.styl'

const CHECKBOX_STATUS = {
  COMPLETED: 'completed',
  IN_PROGRESS: 'in_progress',
  PENDING: 'pending'
}

const get_checkbox_status = (status) => {
  if (!status) return CHECKBOX_STATUS.PENDING
  switch (status.toLowerCase()) {
    case 'completed':
    case 'done':
      return CHECKBOX_STATUS.COMPLETED
    case 'in_progress':
    case 'in progress':
    case 'started':
      return CHECKBOX_STATUS.IN_PROGRESS
    default:
      return CHECKBOX_STATUS.PENDING
  }
}

const parse_task_list_result = (text) => {
  const items = []
  if (!text) return items
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^#?(\d+)\.?\s*\[([^\]]+)\]\s*(.+)/)
    if (match) {
      items.push({
        id: match[1],
        status: match[2].trim().replace(/ /g, '_'),
        subject: match[3].trim()
      })
    }
  }
  return items
}

const build_task_subject_map = (timeline) => {
  const map = {}
  if (!timeline) return map
  for (const entry of timeline) {
    if (
      entry.type === 'tool_call' &&
      entry.content?.tool_name === 'TaskCreate' &&
      entry.content?.tool_parameters?.subject
    ) {
      const call_id = entry.content.tool_call_id
      const subject = entry.content.tool_parameters.subject
      // Find matching result to extract the task ID
      const result_entry = timeline.find(
        (e) => e.type === 'tool_result' && e.content?.tool_call_id === call_id
      )
      if (result_entry) {
        const result_text = ensure_string_result(result_entry.content?.result)
        const id_match = result_text.match(/Task #(\d+)/)
        if (id_match) {
          map[id_match[1]] = subject
        }
      }
    }
  }
  return map
}

const CheckboxItem = ({ status, text, is_last }) => (
  <ListItem
    className='checkbox-item'
    sx={{
      px: 1.5,
      py: 0.5,
      borderBottom: is_last ? 'none' : '1px solid var(--color-border-light)'
    }}
    data-slot='item'
    data-task-status={status}>
    <Box
      component='span'
      className='checkbox-box'
      data-checkbox-status={status}
    />
    <MonospaceText
      variant='xs'
      component='span'
      className='checkbox-text'
      sx={{ fontSize: '11px' }}>
      {text}
    </MonospaceText>
  </ListItem>
)

CheckboxItem.propTypes = {
  status: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
  is_last: PropTypes.bool
}

const CheckboxList = ({ children }) => (
  <Box
    data-component='tasks'
    sx={{
      border: '1px solid var(--color-border)',
      borderRadius: 1,
      overflow: 'hidden'
    }}>
    <List dense sx={{ py: 0 }}>
      {children}
    </List>
  </Box>
)

CheckboxList.propTypes = {
  children: PropTypes.node
}

/**
 * Collect checkbox items from a single tool pair.
 * Returns array of { key, status, text } objects.
 */
const get_items_for_tool_pair = (tool_call_event, tool_result_event, task_subject_map) => {
  const tool_name = tool_call_event?.content?.tool_name
  const params = tool_call_event?.content?.tool_parameters || {}
  const result_text = ensure_string_result(tool_result_event?.content?.result)

  const resolve_subject = (task_id) => {
    if (task_id && task_subject_map[task_id]) return task_subject_map[task_id]
    if (result_text) {
      const colon_idx = result_text.indexOf(': ')
      if (colon_idx !== -1) {
        const after = result_text.slice(colon_idx + 2).trim()
        if (after) return after
      }
    }
    if (params.subject) return params.subject
    return task_id ? `Task #${task_id}` : 'Task'
  }

  const call_id = tool_call_event?.content?.tool_call_id || ''

  switch (tool_name) {
    case 'TaskCreate':
      return [
        {
          key: `create-${call_id}`,
          status: CHECKBOX_STATUS.PENDING,
          text: params.subject || 'New task'
        }
      ]

    case 'TaskUpdate':
      return [
        {
          key: `update-${call_id}`,
          status: get_checkbox_status(params.status),
          text: resolve_subject(params.taskId)
        }
      ]

    case 'TaskList': {
      const items = parse_task_list_result(result_text)
      return items.map((item) => ({
        key: `list-${call_id}-${item.id}`,
        status: get_checkbox_status(item.status),
        text: item.subject
      }))
    }

    case 'TaskGet':
      return [
        {
          key: `get-${call_id}`,
          status: CHECKBOX_STATUS.PENDING,
          text: resolve_subject(params.taskId)
        }
      ]

    default:
      return []
  }
}

/**
 * Renders a group of consecutive task tool events as a single checkbox list.
 * Used by TimelineList when rendering task_group entries.
 */
const TaskToolGroup = ({ tool_pairs, timeline }) => {
  const task_subject_map = useMemo(
    () => build_task_subject_map(timeline),
    [timeline]
  )

  const all_items = []
  for (const pair of tool_pairs) {
    const items = get_items_for_tool_pair(
      pair.tool_call_event,
      pair.tool_result_event,
      task_subject_map
    )
    all_items.push(...items)
  }

  if (!all_items.length) return null

  return (
    <Box sx={{ mb: 2 }}>
      <CheckboxList>
        {all_items.map((item, idx) => (
          <CheckboxItem
            key={item.key}
            status={item.status}
            text={item.text}
            is_last={idx === all_items.length - 1}
          />
        ))}
      </CheckboxList>
    </Box>
  )
}

TaskToolGroup.propTypes = {
  tool_pairs: PropTypes.arrayOf(
    PropTypes.shape({
      tool_call_event: PropTypes.object.isRequired,
      tool_result_event: PropTypes.object
    })
  ).isRequired,
  timeline: PropTypes.array
}

export { TaskToolGroup }
export default TaskToolGroup
