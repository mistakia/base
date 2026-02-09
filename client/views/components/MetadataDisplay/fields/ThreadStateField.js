import React, { useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useDispatch } from 'react-redux'

import { COLORS } from '@theme/colors.js'
import { threads_actions } from '@core/threads/actions.js'
import { use_discard_confirm } from '@views/hooks/use-discard-confirm.js'

import '@views/components/SessionsPanel/HomeSessionsPanel.styl'

const ThreadStateField = ({
  thread_state,
  thread_id,
  user_owns_thread,
  is_first = false
}) => {
  const dispatch = useDispatch()

  // Abandon callback (two-click confirm)
  const abandoned_callback = useCallback(() => {
    dispatch(
      threads_actions.set_thread_archive_state({
        thread_id,
        archive_reason: 'user_abandoned'
      })
    )
  }, [dispatch, thread_id])

  const { is_confirming: is_abandoned_confirming, handle_discard_click } =
    use_discard_confirm({ on_discard: abandoned_callback })

  const handle_abandoned_click = (event) => {
    event.stopPropagation()
    handle_discard_click()
  }

  // Archive (direct action)
  const handle_archive_click = (event) => {
    event.stopPropagation()
    dispatch(
      threads_actions.set_thread_archive_state({
        thread_id,
        archive_reason: 'completed'
      })
    )
  }

  // Unarchive (reactivate)
  const handle_unarchive_click = (event) => {
    event.stopPropagation()
    dispatch(
      threads_actions.set_thread_archive_state({
        thread_id,
        archive_reason: null
      })
    )
  }

  const render_actions = () => {
    if (!user_owns_thread) return null

    if (thread_state === 'archived') {
      return (
        <div className='session-card__actions'>
          <button
            className='session-card__action-button'
            onClick={handle_unarchive_click}>
            unarchive
          </button>
        </div>
      )
    }

    return (
      <div className='session-card__actions'>
        <button
          className={`session-card__action-button session-card__action-button--danger ${
            is_abandoned_confirming
              ? 'session-card__action-button--confirming'
              : ''
          }`}
          onClick={handle_abandoned_click}>
          {is_abandoned_confirming ? 'confirm' : 'abandon'}
        </button>
        <button
          className='session-card__action-button'
          onClick={handle_archive_click}>
          archive
        </button>
      </div>
    )
  }

  return (
    <Box
      sx={{
        borderTop: is_first ? 'none' : `1px solid ${COLORS.border}`,
        borderBottom: 'none',
        position: 'relative',
        minHeight: '60px',
        opacity: user_owns_thread ? 1 : 0.6
      }}
      title={
        !user_owns_thread ? 'You can only modify threads that you own' : ''
      }>
      <Box
        sx={{
          position: 'absolute',
          top: '8px',
          left: '12px',
          fontSize: '11px',
          color: COLORS.text_secondary,
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
          color: COLORS.text,
          fontWeight: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
        <span>{thread_state}</span>
        {render_actions()}
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
