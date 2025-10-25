import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import CodeIcon from '@mui/icons-material/Code'
import BuildIcon from '@mui/icons-material/Build'
import MessageIcon from '@mui/icons-material/Message'
import ErrorIcon from '@mui/icons-material/Error'
import NotificationsIcon from '@mui/icons-material/Notifications'

/**
 * Get user-friendly message and icon for timeline entry type
 */
const get_entry_display_info = (entry) => {
  const entry_type = entry.type

  switch (entry_type) {
    case 'tool_call':
      return {
        icon: <BuildIcon fontSize='small' />,
        message: `Tool Call: ${entry.content?.tool_name || 'unknown'}`,
        color: '#3498db'
      }
    case 'tool_result':
      return {
        icon: <CodeIcon fontSize='small' />,
        message: 'Tool Result',
        color: '#2ecc71'
      }
    case 'assistant_response':
      return {
        icon: <MessageIcon fontSize='small' />,
        message: 'Assistant Response',
        color: '#9b59b6'
      }
    case 'message':
      return {
        icon: <MessageIcon fontSize='small' />,
        message: `Message from ${entry.role || 'unknown'}`,
        color: '#95a5a6'
      }
    case 'error':
      return {
        icon: <ErrorIcon fontSize='small' />,
        message: `Error: ${entry.error_type || 'unknown'}`,
        color: '#e74c3c'
      }
    case 'thread_main_request':
      return {
        icon: <MessageIcon fontSize='small' />,
        message: 'New Thread Request',
        color: '#3498db'
      }
    case 'human_request':
      return {
        icon: <MessageIcon fontSize='small' />,
        message: 'Human Request',
        color: '#f39c12'
      }
    case 'notification':
      return {
        icon: <NotificationsIcon fontSize='small' />,
        message: entry.content?.message || 'Notification',
        color: '#1abc9c'
      }
    case 'state_change':
      return {
        icon: <NotificationsIcon fontSize='small' />,
        message: 'State Changed',
        color: '#34495e'
      }
    default:
      return {
        icon: <NotificationsIcon fontSize='small' />,
        message: `New Event: ${entry_type}`,
        color: '#95a5a6'
      }
  }
}

/**
 * ThreadEventNotification
 *
 * Rich notification component for thread timeline events
 * Displays thread title, event type, and provides a link to view the thread
 */
const ThreadEventNotification = ({
  thread_id,
  thread_title,
  entry,
  on_close
}) => {
  const display_title = thread_title || thread_id
  const thread_link = `/thread/${thread_id}`

  const display_info = get_entry_display_info(entry)

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            color: display_info.color,
            display: 'flex',
            alignItems: 'center'
          }}>
          {display_info.icon}
        </Box>
        <Typography variant='body1' component='div' sx={{ fontWeight: 500 }}>
          {display_info.message}
        </Typography>
      </Box>
      <Typography variant='body2' component='div' sx={{ opacity: 0.9, ml: 3 }}>
        {display_title}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
        <Button
          component={Link}
          to={thread_link}
          size='small'
          variant='outlined'
          endIcon={<OpenInNewIcon />}
          onClick={on_close}
          sx={{
            color: 'inherit',
            borderColor: 'rgba(255, 255, 255, 0.5)',
            '&:hover': {
              borderColor: 'rgba(255, 255, 255, 0.8)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}>
          View Thread
        </Button>
      </Box>
    </Box>
  )
}

ThreadEventNotification.propTypes = {
  thread_id: PropTypes.string.isRequired,
  thread_title: PropTypes.string,
  entry: PropTypes.shape({
    type: PropTypes.string.isRequired,
    content: PropTypes.object,
    role: PropTypes.string,
    error_type: PropTypes.string
  }).isRequired,
  on_close: PropTypes.func.isRequired
}

export default ThreadEventNotification
