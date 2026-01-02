import React, { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'
import {
  Box,
  TextField,
  CircularProgress,
  Typography,
  Modal,
  Fade
} from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CloseIcon from '@mui/icons-material/Close'

import Button from '@components/primitives/Button'
import { threads_actions, threads_action_types } from '@core/threads/actions'
import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import {
  get_can_create_threads,
  get_can_resume_thread
} from '@core/app/selectors'
import WorkingDirectoryPicker from './WorkingDirectoryPicker'
import { BASE_DIRECTORIES } from '@views/utils/base-uri-constants'
import './GlobalThreadInput.styl'

// Constants
const DEFAULT_WORKING_DIRECTORY = BASE_DIRECTORIES.user
const KEYBOARD_HINT = 'Cmd+Enter to send'
const PLACEHOLDER_NEW_THREAD = 'What would you like Trashman Jr to do?'
const PLACEHOLDER_CONTINUE = 'Continue thread...'

// Helper functions
const parse_thread_from_path = (path) => {
  if (!path.startsWith('/thread/')) {
    return null
  }

  const parts = path.split('/')
  const thread_id = parts[2]

  // Verify we're exactly on the thread page (not a subpath)
  const is_exact_thread_page =
    parts.length === 3 || (parts.length === 4 && parts[3] === '')

  return is_exact_thread_page ? thread_id : null
}

const should_show_working_directory_picker = (is_thread_page, should_resume) =>
  !is_thread_page || !should_resume

/**
 * GlobalThreadInput Component
 *
 * Overlay thread input that can be opened via keyboard shortcut (Cmd/Ctrl+K).
 * Supports two modes:
 * - Creating new threads (default)
 * - Resuming existing threads (when target_thread_id is set or on thread page)
 */
export default function GlobalThreadInput() {
  const dispatch = useDispatch()
  const location = useLocation()
  const current_path = location.pathname
  const input_ref = useRef(null)

  // Redux state for overlay
  const is_open = useSelector((state) =>
    state.getIn(['thread_prompt', 'is_open'], false)
  )
  const target_thread_id = useSelector((state) =>
    state.getIn(['thread_prompt', 'target_thread_id'], null)
  )
  const initial_mode = useSelector((state) =>
    state.getIn(['thread_prompt', 'initial_mode'], 'new')
  )

  // Local state
  const [message, set_message] = useState('')
  const [working_directory, set_working_directory] = useState(
    DEFAULT_WORKING_DIRECTORY
  )
  const [should_resume, set_should_resume] = useState(true)

  // Determine thread context
  const path_thread_id = parse_thread_from_path(current_path)
  const effective_thread_id = target_thread_id || path_thread_id
  const is_thread_context = !!effective_thread_id
  const is_resume_mode = is_thread_context && should_resume

  // Reset state when overlay opens
  useEffect(() => {
    if (is_open) {
      set_message('')
      set_should_resume(initial_mode === 'resume')
      // Focus input after a brief delay for animation
      setTimeout(() => {
        input_ref.current?.focus()
      }, 100)
    }
  }, [is_open, initial_mode])

  // Redux selectors
  const is_loading = useSelector((state) => {
    const action_type = is_resume_mode
      ? threads_action_types.RESUME_THREAD_SESSION
      : threads_action_types.CREATE_THREAD_SESSION
    return state.getIn(['threads', 'loading', action_type], false)
  })

  const can_create_threads = useSelector(get_can_create_threads)

  const selected_thread = useSelector((state) => {
    if (!is_thread_context) return null
    return state.getIn(['threads', 'selected_thread_data'])?.toJS()
  })

  const can_resume_thread = useSelector((state) =>
    get_can_resume_thread(state, selected_thread)
  )

  // Event handlers
  const handle_close = () => {
    if (!is_loading) {
      dispatch(thread_prompt_actions.close())
    }
  }

  const handle_submit = async (e) => {
    e.preventDefault()

    if (!message.trim()) {
      return
    }

    try {
      if (is_resume_mode && effective_thread_id) {
        dispatch(
          threads_actions.resume_thread_session({
            thread_id: effective_thread_id,
            prompt: message,
            working_directory
          })
        )
      } else {
        dispatch(
          threads_actions.create_thread_session({
            prompt: message,
            working_directory
          })
        )
      }

      // Clear input and close overlay on success
      set_message('')
      dispatch(thread_prompt_actions.close())
    } catch (error) {
      console.error('Error submitting thread message:', error)
    }
  }

  const handle_key_down = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handle_submit(e)
    }
    if (e.key === 'Escape') {
      handle_close()
    }
  }

  const handle_toggle_mode = () => {
    set_should_resume(!should_resume)
  }

  const handle_backdrop_click = (e) => {
    if (e.target === e.currentTarget) {
      handle_close()
    }
  }

  // Computed values
  const placeholder_text = is_resume_mode
    ? PLACEHOLDER_CONTINUE
    : PLACEHOLDER_NEW_THREAD

  const show_directory_picker = should_show_working_directory_picker(
    is_thread_context,
    should_resume
  )

  const is_submit_disabled = is_loading || !message.trim()

  // Determine if the input should be shown based on permissions
  const should_show_input =
    (is_resume_mode && can_resume_thread) ||
    (!is_resume_mode && can_create_threads)

  // Don't render if user lacks permission
  if (!should_show_input) {
    return null
  }

  return (
    <Modal
      open={is_open}
      onClose={handle_close}
      closeAfterTransition
      slotProps={{
        backdrop: {
          timeout: 200
        }
      }}>
      <Fade in={is_open}>
        <Box
          className='global-thread-input-backdrop'
          onClick={handle_backdrop_click}>
          <Box className='global-thread-input global-thread-input--overlay'>
            <Box className='thread-input-header'>
              <Typography variant='caption' className='header-label'>
                {is_resume_mode ? 'Continue Thread' : 'New Thread'}
              </Typography>
              <Button
                variant='ghost'
                size='small'
                icon
                className='close-button'
                onClick={handle_close}
                aria-label='Close'>
                <CloseIcon fontSize='small' />
              </Button>
            </Box>
            <Box className='thread-input-container'>
              <form onSubmit={handle_submit}>
                <Box className='input-wrapper'>
                  <TextField
                    inputRef={input_ref}
                    multiline
                    fullWidth
                    minRows={3}
                    maxRows={12}
                    value={message}
                    onChange={(e) => set_message(e.target.value)}
                    onKeyDown={handle_key_down}
                    placeholder={placeholder_text}
                    disabled={is_loading}
                    variant='outlined'
                    className='thread-input-field'
                    size='small'
                    autoFocus
                  />
                </Box>

                <Box className='options-row'>
                  <Box className='options-left'>
                    <Typography
                      variant='caption'
                      color='textSecondary'
                      className='hint-text'>
                      {KEYBOARD_HINT}
                    </Typography>
                  </Box>

                  <Box className='options-right'>
                    {show_directory_picker && (
                      <WorkingDirectoryPicker
                        value={working_directory}
                        onChange={set_working_directory}
                        current_path={current_path}
                      />
                    )}

                    {is_thread_context && (
                      <Box className='mode-toggle' onClick={handle_toggle_mode}>
                        <Box
                          className={`toggle-option ${should_resume ? 'active' : ''}`}>
                          Resume
                        </Box>
                        <Box
                          className={`toggle-option ${!should_resume ? 'active' : ''}`}>
                          New
                        </Box>
                      </Box>
                    )}

                    <Button
                      type='submit'
                      variant='primary'
                      icon
                      disabled={is_submit_disabled}
                      className='send-button'>
                      {is_loading ? (
                        <CircularProgress
                          size={16}
                          className='loading-spinner'
                        />
                      ) : (
                        <ArrowUpwardIcon className='send-icon' />
                      )}
                    </Button>
                  </Box>
                </Box>
              </form>
            </Box>
          </Box>
        </Box>
      </Fade>
    </Modal>
  )
}
