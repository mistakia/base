import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'

/**
 * ThreadCreatedNotification
 *
 * Rich notification component for newly created threads
 * Displays thread title and provides a link to view the thread
 */
const ThreadCreatedNotification = ({ thread, on_close }) => {
  const thread_title = thread.title || thread.thread_id
  const thread_link = `/thread/${thread.thread_id}`

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1
      }}>
      <Typography variant='body1' component='div'>
        <strong>Thread Created</strong>
      </Typography>
      <Typography variant='body2' component='div' sx={{ opacity: 0.9 }}>
        {thread_title}
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

ThreadCreatedNotification.propTypes = {
  thread: PropTypes.shape({
    thread_id: PropTypes.string.isRequired,
    title: PropTypes.string
  }).isRequired,
  on_close: PropTypes.func.isRequired
}

export default ThreadCreatedNotification
