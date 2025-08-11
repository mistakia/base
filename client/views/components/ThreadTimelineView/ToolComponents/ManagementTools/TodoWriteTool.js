import React from 'react'
import PropTypes from 'prop-types'
import { Box, List, ListItem } from '@mui/material'
import { AssignmentTurnedIn as TodoIcon } from '@mui/icons-material'
import BaseToolComponent from '../BaseToolComponent'
import { MonospaceText } from '@views/components/primitives/styled'

const TodoWriteTool = ({ tool_call_event, tool_result_event }) => {
  const getTodoInfo = () => {
    const params = tool_call_event?.content?.tool_parameters || {}
    const todos = params.todos || []

    return { todos }
  }

  const { todos } = getTodoInfo()

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
              sx={{
                px: 1.5,
                py: 0.5,
                borderBottom:
                  idx < todos.length - 1
                    ? '1px solid var(--color-border-light)'
                    : 'none'
              }}
              data-slot='item'
              data-status={todo.status}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  width: '100%'
                }}>
                <Box
                  component='span'
                  sx={{
                    position: 'relative',
                    display: 'inline-block',
                    boxSizing: 'border-box',
                    width: '14px',
                    height: '14px',
                    minWidth: '14px',
                    minHeight: '14px',
                    maxWidth: '14px',
                    maxHeight: '14px',
                    flex: '0 0 14px',
                    flexShrink: 0,
                    borderRadius: '2px',
                    border: '1px solid',
                    borderColor:
                      todo.status === 'completed'
                        ? 'success.main'
                        : todo.status === 'in_progress'
                          ? 'var(--sl-color-orange)'
                          : 'grey.400',
                    bgcolor:
                      todo.status === 'completed'
                        ? 'success.main'
                        : 'transparent',
                    '&::before':
                      todo.status === 'in_progress'
                        ? {
                            content: '""',
                            position: 'absolute',
                            top: '2px',
                            left: '2px',
                            width: '8px',
                            height: '8px',
                            boxShadow:
                              'inset 1rem 1rem var(--sl-color-orange-low)'
                          }
                        : {}
                  }}
                />
                <MonospaceText
                  variant='xs'
                  component='span'
                  sx={{
                    fontSize: '11px',
                    textDecoration:
                      todo.status === 'completed' ? 'line-through' : 'none',
                    color: todo.status === 'completed' ? '#666' : 'inherit'
                  }}>
                  {todo.content}
                </MonospaceText>
              </Box>
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
