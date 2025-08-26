import React from 'react'
import PropTypes from 'prop-types'
import { Box, List, ListItem } from '@mui/material'
import { AssignmentTurnedIn as TodoIcon } from '@mui/icons-material'

import BaseToolComponent from '@components/ThreadTimelineView/ToolComponents/BaseToolComponent'
import { MonospaceText } from '@components/primitives/styled'

import '@styles/checkbox.styl'

const CHECKBOX_STATUS = {
  COMPLETED: 'completed',
  IN_PROGRESS: 'in_progress',
  PENDING: 'pending'
}

const TodoWriteTool = ({ tool_call_event, tool_result_event }) => {
  const get_todo_info = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const todos = params.todos || []

    return { todos }
  }

  // Map task status to checkbox status for visual representation
  const get_checkbox_status = (taskStatus) => {
    if (!taskStatus) return CHECKBOX_STATUS.PENDING

    switch (taskStatus.toLowerCase()) {
      case 'completed':
      case 'done':
        return CHECKBOX_STATUS.COMPLETED
      case 'in progress':
      case 'in_progress':
      case 'started':
      case 'working':
        return CHECKBOX_STATUS.IN_PROGRESS
      default:
        return CHECKBOX_STATUS.PENDING
    }
  }

  const { todos } = get_todo_info()

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      title_override={'Updating Plan'}
      icon={<TodoIcon fontSize='small' />}>
      <Box
        data-component='todos'
        sx={{
          border: '1px solid var(--color-border)',
          borderRadius: 1,
          overflow: 'hidden',
          mb: 2
        }}>
        <List dense sx={{ py: 0 }}>
          {todos.map((todo, idx) => (
            <ListItem
              key={todo.id || idx}
              className='checkbox-item'
              sx={{
                px: 1.5,
                py: 0.5,
                borderBottom:
                  idx < todos.length - 1
                    ? '1px solid var(--color-border-light)'
                    : 'none'
              }}
              data-slot='item'
              data-task-status={get_checkbox_status(todo.status)}>
              <Box
                component='span'
                className='checkbox-box'
                data-checkbox-status={get_checkbox_status(todo.status)}
              />
              <MonospaceText
                variant='xs'
                component='span'
                className='checkbox-text'
                sx={{
                  fontSize: '11px'
                }}>
                {todo.content}
              </MonospaceText>
            </ListItem>
          ))}
        </List>
      </Box>
    </BaseToolComponent>
  )
}

TodoWriteTool.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default TodoWriteTool
