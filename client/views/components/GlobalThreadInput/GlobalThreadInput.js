import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'
import {
  Box,
  TextField,
  Button,
  CircularProgress,
  Typography,
  Collapse,
  ClickAwayListener
} from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import { threads_actions, threads_action_types } from '@core/threads/actions'
import {
  get_can_create_threads,
  get_can_resume_thread
} from '@core/app/selectors'
import WorkingDirectoryPicker from './WorkingDirectoryPicker'
import './GlobalThreadInput.styl'

// Constants
const DEFAULT_WORKING_DIRECTORY = '/Users/trashman/user-base'
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

const should_show_working_directory_picker = (
  is_thread_page,
  should_resume
) => {
  return !is_thread_page || !should_resume
}

/**
 * GlobalThreadInput Component
 *
 * Fixed thread input that appears below breadcrumbs across all pages.
 * Supports two modes:
 * - Creating new threads (default)
 * - Resuming existing threads (when on a thread page)
 *
 * Expands to show options (working directory, mode toggle) when focused.
 */
export default function GlobalThreadInput() {
  const dispatch = useDispatch()
  const location = useLocation()
  const current_path = location.pathname

  // State
  const [message, set_message] = useState('')
  const [is_focused, set_is_focused] = useState(false)
  const [working_directory, set_working_directory] = useState(
    DEFAULT_WORKING_DIRECTORY
  )
  const [should_resume, set_should_resume] = useState(true)

  // Derived state
  const thread_id = parse_thread_from_path(current_path)
  const is_thread_page = !!thread_id
  const is_resume_mode = is_thread_page && should_resume

  // Redux selectors
  const is_loading = useSelector((state) => {
    const action_type = is_resume_mode
      ? threads_action_types.RESUME_THREAD_SESSION
      : threads_action_types.CREATE_THREAD_SESSION
    return state.getIn(['threads', 'loading', action_type], false)
  })

  const can_create_threads = useSelector(get_can_create_threads)

  const selected_thread = useSelector((state) => {
    if (!is_thread_page) return null
    return state.getIn(['threads', 'selected_thread_data'])?.toJS()
  })

  const can_resume_thread = useSelector((state) =>
    get_can_resume_thread(state, selected_thread)
  )

  // Event handlers
  const handle_submit = async (e) => {
    e.preventDefault()

    if (!message.trim()) {
      return
    }

    try {
      if (is_resume_mode) {
        dispatch(
          threads_actions.resume_thread_session({
            thread_id,
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

      // Clear input and collapse options on success
      set_message('')
      set_is_focused(false)
    } catch (error) {
      console.error('Error submitting thread message:', error)
    }
  }

  const handle_key_press = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handle_submit(e)
    }
  }

  const handle_toggle_mode = () => {
    set_should_resume(!should_resume)
  }

  const handle_click_away = () => {
    if (is_focused && !is_loading) {
      set_is_focused(false)
    }
  }

  // Computed values
  const placeholder_text = is_resume_mode
    ? PLACEHOLDER_CONTINUE
    : PLACEHOLDER_NEW_THREAD

  const show_directory_picker = should_show_working_directory_picker(
    is_thread_page,
    should_resume
  )

  const is_submit_disabled = is_loading || !message.trim()
  const show_options = is_focused || is_loading

  // Determine if the input should be shown based on permissions
  const should_show_input =
    (is_resume_mode && can_resume_thread) || (!is_resume_mode && can_create_threads)

  // Don't render the component if user lacks permission
  if (!should_show_input) {
    return null
  }

  return (
    <ClickAwayListener onClickAway={handle_click_away}>
      <Box className='global-thread-input'>
        <Box className='thread-input-container'>
          <form onSubmit={handle_submit}>
            <Box className='two-column-layout'>
              {/* Text Input */}
              <Box className='input-column'>
                <TextField
                  multiline
                  fullWidth
                  minRows={1}
                  maxRows={8}
                  value={message}
                  onChange={(e) => set_message(e.target.value)}
                  onFocus={() => set_is_focused(true)}
                  onKeyDown={handle_key_press}
                  placeholder={placeholder_text}
                  disabled={is_loading}
                  variant='outlined'
                  className='thread-input-field'
                  size='small'
                />
              </Box>

              {/* Options Panel */}
              <Box className='options-column'>
                <Collapse in={show_options} timeout={0}>
                  <Box className='expanded-options'>
                    {/* Left side: hints */}
                    <Box className='options-left'>
                      <Typography
                        variant='caption'
                        color='textSecondary'
                        className='hint-text'>
                        {KEYBOARD_HINT}
                      </Typography>
                    </Box>

                    {/* Right side: controls */}
                    <Box className='options-right'>
                      {show_directory_picker && (
                        <WorkingDirectoryPicker
                          value={working_directory}
                          onChange={set_working_directory}
                          current_path={current_path}
                        />
                      )}

                      {is_thread_page && (
                        <Box
                          className='mode-toggle'
                          onClick={handle_toggle_mode}>
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
                        variant='contained'
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
                </Collapse>
              </Box>
            </Box>
          </form>
        </Box>
      </Box>
    </ClickAwayListener>
  )
}
