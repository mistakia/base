import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useLocation } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import MicIcon from '@mui/icons-material/Mic'

import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import { get_can_create_threads } from '@core/app/selectors'

const PLACEHOLDER = 'What would you like to do?'

/**
 * MobileThreadInputTrigger
 *
 * A slim bar anchored to the bottom of the screen on mobile viewports.
 * Tapping it opens the full GlobalThreadInput overlay.
 * Only renders for users with thread creation permission.
 */
export default function MobileThreadInputTrigger() {
  const dispatch = useDispatch()
  const location = useLocation()

  const can_create_threads = useSelector(get_can_create_threads)
  const is_overlay_open = useSelector((state) =>
    state.getIn(['thread_prompt', 'is_open'], false)
  )

  if (!can_create_threads || is_overlay_open) {
    return null
  }

  const handle_tap = () => {
    const current_path = location.pathname

    dispatch(
      thread_prompt_actions.open({
        thread_id: null,
        thread_user_public_key: null,
        file_path: null,
        current_path
      })
    )
  }

  return (
    <Box className='mobile-thread-input-trigger' onClick={handle_tap}>
      <Typography className='trigger-placeholder'>{PLACEHOLDER}</Typography>
      <MicIcon className='trigger-mic-icon' />
    </Box>
  )
}
