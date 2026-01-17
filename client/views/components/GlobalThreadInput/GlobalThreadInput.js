import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'
import {
  Box,
  TextField,
  CircularProgress,
  Typography,
  Fade
} from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'

import Button from '@components/primitives/Button'
import { threads_actions, threads_action_types } from '@core/threads/actions'
import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import {
  get_can_create_threads,
  get_can_resume_thread
} from '@core/app/selectors'
import { get_directory_state } from '@core/directory'
import WorkingDirectoryPicker from './WorkingDirectoryPicker'
import FileAutocompleteSuggestions from './FileAutocompleteSuggestions.js'
import useFileAutocomplete from './use-file-autocomplete.js'
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

  // Auth token for API requests
  const user_token = useSelector((state) => state.getIn(['app', 'user_token']))

  // Directory state for detecting file pages
  const directory_state = useSelector(get_directory_state)
  const path_info = directory_state.get('path_info')

  // Local state
  const [message, set_message] = useState('')
  const [cursor_position, set_cursor_position] = useState(0)
  const [working_directory, set_working_directory] = useState(
    DEFAULT_WORKING_DIRECTORY
  )
  const [should_resume, set_should_resume] = useState(true)

  // Autocomplete selection handler
  const handle_autocomplete_select = useCallback((new_text, new_cursor_pos) => {
    set_message(new_text)
    set_cursor_position(new_cursor_pos)

    // Update cursor position in the input after React re-renders
    requestAnimationFrame(() => {
      const input = input_ref.current
      if (input) {
        input.setSelectionRange(new_cursor_pos, new_cursor_pos)
        input.focus()
      }
    })
  }, [])

  // File autocomplete hook
  const autocomplete = useFileAutocomplete({
    text: message,
    cursor_position,
    working_directory,
    on_select: handle_autocomplete_select,
    token: user_token
  })

  // Determine thread context
  const path_thread_id = parse_thread_from_path(current_path)
  const effective_thread_id = target_thread_id || path_thread_id
  const is_thread_context = !!effective_thread_id
  const is_resume_mode = is_thread_context && should_resume

  // Reset state when overlay opens
  useEffect(() => {
    if (is_open) {
      // Check if we're on a file page (not a thread page and path_info indicates file)
      const is_thread_page = parse_thread_from_path(current_path) !== null
      const is_file_page = !is_thread_page && path_info?.type === 'file'

      if (is_file_page) {
        // Pre-populate with file mention - strip leading slash from path
        const normalized_path = current_path.startsWith('/')
          ? current_path.slice(1)
          : current_path
        const initial_content = `@${normalized_path} `
        set_message(initial_content)
        set_cursor_position(initial_content.length)
      } else {
        set_message('')
        set_cursor_position(0)
      }

      // Default to resume mode on thread pages, otherwise use initial_mode
      set_should_resume(is_thread_page || initial_mode === 'resume')
      // Focus input after a brief delay for animation
      setTimeout(() => {
        input_ref.current?.focus()
      }, 100)
    }
  }, [is_open, initial_mode, current_path, path_info])

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
    // Escape always closes the overlay (and dismisses autocomplete if visible)
    if (e.key === 'Escape') {
      autocomplete.handle_escape()
      handle_close()
      return
    }

    // Delegate to autocomplete for other keys if suggestions are visible
    if (autocomplete.handle_keydown(e)) {
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handle_submit(e)
    }
  }

  // Track cursor position on input changes and selection changes
  const handle_input_change = (e) => {
    set_message(e.target.value)
    set_cursor_position(e.target.selectionStart || 0)
  }

  const handle_input_select = (e) => {
    set_cursor_position(e.target.selectionEnd || 0)
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

  if (!is_open) {
    return null
  }

  return (
    <Fade in={is_open}>
      <Box
        className='global-thread-input-backdrop'
        onClick={handle_backdrop_click}>
        <Box className='global-thread-input'>
          <form onSubmit={handle_submit}>
            <Box className='input-container-with-autocomplete'>
              <FileAutocompleteSuggestions
                suggestions={autocomplete.suggestions}
                selected_index={autocomplete.selected_index}
                is_loading={autocomplete.is_loading}
                is_visible={autocomplete.is_visible}
                on_select={autocomplete.handle_click_select}
                search_term={autocomplete.search_term}
              />
              <TextField
                inputRef={input_ref}
                multiline
                fullWidth
                minRows={2}
                maxRows={10}
                value={message}
                onChange={handle_input_change}
                onSelect={handle_input_select}
                onKeyDown={handle_key_down}
                placeholder={placeholder_text}
                disabled={is_loading}
                variant='standard'
                className='thread-input-field'
                InputProps={{
                  disableUnderline: true
                }}
                autoFocus
              />
            </Box>

            <Box className='input-bottom-row'>
              <Box className='bottom-row-left'>
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

                <Typography
                  variant='caption'
                  color='textSecondary'
                  className='hint-text'>
                  {KEYBOARD_HINT}
                </Typography>
              </Box>

              <Box className='bottom-row-right'>
                <Button
                  type='submit'
                  variant='primary'
                  icon
                  disabled={is_submit_disabled}
                  className='send-button'>
                  {is_loading ? (
                    <CircularProgress size={16} className='loading-spinner' />
                  ) : (
                    <ArrowUpwardIcon className='send-icon' />
                  )}
                </Button>
              </Box>
            </Box>
          </form>
        </Box>
      </Box>
    </Fade>
  )
}
