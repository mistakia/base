import React, { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import { notification_actions } from '@core/notification/actions'
import ThreadEventNotification from './ThreadEventNotification'

/**
 * TEMPORARY: Demo panel for testing different thread notification types
 *
 * Enable via URL parameter: ?demo=true
 * Or set localStorage: localStorage.setItem('notificationDemo', 'true')
 *
 * This is a temporary tool for iterating on notification design.
 * Remove when no longer needed.
 */

// Mock data generators for different event types
const create_mock_entry = (type, overrides = {}) => {
  const base_entry = {
    id: `demo-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    ...overrides
  }

  switch (type) {
    case 'message_user':
      return {
        ...base_entry,
        type: 'message',
        role: 'user',
        content:
          'This is a user message example for testing the notification design.'
      }
    case 'message_assistant':
      return {
        ...base_entry,
        type: 'message',
        role: 'assistant',
        content:
          'This is an assistant message response. It can contain longer text to test how notifications handle different content lengths.'
      }
    case 'message_hook':
      return {
        ...base_entry,
        type: 'message',
        role: 'user',
        content: '<task-hook>This is a hook message example</task-hook>'
      }
    case 'tool_call':
      return {
        ...base_entry,
        type: 'tool_call',
        content: {
          tool_name: 'read_file',
          tool_parameters: {
            file_path: '/path/to/example/file.js'
          },
          tool_call_id: `call-${Date.now()}`
        }
      }
    case 'tool_call_browser':
      return {
        ...base_entry,
        type: 'tool_call',
        content: {
          tool_name: 'mcp__playwright__browser_navigate',
          tool_parameters: {
            url: 'https://example.com'
          },
          tool_call_id: `call-${Date.now()}`
        }
      }
    case 'tool_call_websearch':
      return {
        ...base_entry,
        type: 'tool_call',
        content: {
          tool_name: 'WebSearch',
          tool_parameters: {
            query: 'example search query'
          },
          tool_call_id: `call-${Date.now()}`
        }
      }
    case 'tool_result':
      return {
        ...base_entry,
        type: 'tool_result',
        content: {
          result: 'Tool execution completed successfully',
          tool_call_id: `call-${Date.now()}`
        }
      }
    case 'tool_result_error':
      return {
        ...base_entry,
        type: 'tool_result',
        content: {
          error: 'Tool execution failed: File not found',
          tool_call_id: `call-${Date.now()}`
        }
      }
    case 'thinking':
      return {
        ...base_entry,
        type: 'thinking',
        content:
          'This is a thinking message that shows internal reasoning steps.'
      }
    case 'system':
      return {
        ...base_entry,
        type: 'system',
        content:
          'System message: Thread state changed or configuration updated.'
      }
    case 'error':
      return {
        ...base_entry,
        type: 'error',
        error_type: 'execution_error',
        message: 'An error occurred during thread execution',
        content: {
          details: 'Additional error context and stack trace information'
        }
      }
    case 'completion':
      return {
        ...base_entry,
        type: 'completion',
        content: 'Thread execution completed successfully'
      }
    default:
      return base_entry
  }
}

const NotificationDemoPanel = () => {
  const dispatch = useDispatch()
  const [is_visible, set_is_visible] = useState(false)

  // Check URL parameter or localStorage for demo mode
  useEffect(() => {
    const url_params = new URLSearchParams(window.location.search)
    const url_demo = url_params.get('demo') === 'true'
    const storage_demo = localStorage.getItem('notificationDemo') === 'true'

    set_is_visible(url_demo || storage_demo)
  }, [])

  const trigger_notification = (entry_type) => {
    const mock_entry = create_mock_entry(entry_type)
    const mock_thread_id = 'demo-thread-' + Date.now()
    const mock_thread_title = `Demo Thread: ${entry_type.replace(/_/g, ' ')}`

    dispatch(
      notification_actions.show_notification({
        severity: 'info',
        duration: 6000,
        component: ThreadEventNotification,
        component_props: {
          thread_id: mock_thread_id,
          thread_title: mock_thread_title,
          entry: mock_entry,
          on_close: () => {},
          working_directory: '/demo/path'
        }
      })
    )
  }

  if (!is_visible) return null

  const event_types = [
    { key: 'message_user', label: 'User Message' },
    { key: 'message_assistant', label: 'Assistant Message' },
    { key: 'message_hook', label: 'Hook Message' },
    { key: 'tool_call', label: 'Tool Call (Generic)' },
    { key: 'tool_call_browser', label: 'Tool Call (Browser)' },
    { key: 'tool_call_websearch', label: 'Tool Call (WebSearch)' },
    { key: 'tool_result', label: 'Tool Result' },
    { key: 'tool_result_error', label: 'Tool Result (Error)' },
    { key: 'thinking', label: 'Thinking' },
    { key: 'system', label: 'System' },
    { key: 'error', label: 'Error' },
    { key: 'completion', label: 'Completion' }
  ]

  return (
    <Paper
      sx={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        p: 2,
        maxWidth: 300,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2
        }}>
        <Typography
          variant='subtitle2'
          sx={{ fontWeight: 'bold', color: 'white' }}>
          Notification Demo
        </Typography>
        <IconButton
          size='small'
          onClick={() => {
            set_is_visible(false)
            localStorage.removeItem('notificationDemo')
          }}
          sx={{ color: 'white' }}>
          <CloseIcon fontSize='small' />
        </IconButton>
      </Box>
      <Typography
        variant='caption'
        sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 2, display: 'block' }}>
        Click to test notification types
      </Typography>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
        {event_types.map(({ key, label }) => (
          <Button
            key={key}
            variant='outlined'
            size='small'
            onClick={() => trigger_notification(key)}
            sx={{
              color: 'white',
              borderColor: 'rgba(255, 255, 255, 0.3)',
              fontSize: '0.75rem',
              textTransform: 'none',
              '&:hover': {
                borderColor: 'rgba(255, 255, 255, 0.6)',
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
              }
            }}>
            {label}
          </Button>
        ))}
      </Box>
    </Paper>
  )
}

export default NotificationDemoPanel
