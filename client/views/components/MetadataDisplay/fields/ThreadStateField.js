import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useDispatch } from 'react-redux'
import { dialog_actions } from '@core/dialog/actions'

const ThreadStateField = ({
  thread_state,
  thread_id,
  user_owns_thread,
  is_first = false
}) => {
  const dispatch = useDispatch()

  const handle_thread_state_click = () => {
    if (!user_owns_thread) return

    dispatch(
      dialog_actions.show({
        id: 'THREAD_STATE_CHANGE',
        title:
          thread_state === 'archived' ? 'Reactivate Thread' : 'Archive Thread',
        data: { thread_id, current_state: thread_state }
      })
    )
  }

  return (
    <Box
      sx={{
        borderTop: is_first ? 'none' : '1px solid #e0e0e0',
        borderBottom: 'none',
        position: 'relative',
        minHeight: '60px',
        cursor: user_owns_thread ? 'pointer' : 'default',
        '&:hover': user_owns_thread
          ? {
              backgroundColor: '#f5f5f5'
            }
          : {},
        opacity: user_owns_thread ? 1 : 0.6
      }}
      onClick={handle_thread_state_click}
      title={
        user_owns_thread
          ? 'Click to change thread state'
          : 'You can only modify threads that you own'
      }>
      <Box
        sx={{
          position: 'absolute',
          top: '8px',
          left: '12px',
          fontSize: '11px',
          color: '#666',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
        Thread State
      </Box>
      <Box
        sx={{
          pt: '28px',
          pb: '12px',
          px: '12px',
          fontSize: '14px',
          color: '#333',
          fontWeight: 400,
          wordBreak: 'break-all'
        }}>
        {thread_state}
      </Box>
    </Box>
  )
}

ThreadStateField.propTypes = {
  thread_state: PropTypes.string.isRequired,
  thread_id: PropTypes.string.isRequired,
  user_owns_thread: PropTypes.bool.isRequired,
  is_first: PropTypes.bool
}

export default ThreadStateField
