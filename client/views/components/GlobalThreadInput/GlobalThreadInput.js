import React, { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
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
import { get_can_create_threads } from '@core/app/selectors'
import { get_thread_by_id } from '@core/threads/selectors.js'
import WorkingDirectoryPicker from './WorkingDirectoryPicker'
import FileAutocompleteSuggestions from './FileAutocompleteSuggestions.js'
import useFileAutocomplete from './use-file-autocomplete.js'
import use_draft_persistence from './use-draft-persistence.js'
import './GlobalThreadInput.styl'

// Constants
const KEYBOARD_HINT = 'Cmd+Enter to send'
const PLACEHOLDER_NEW_THREAD = 'What would you like Trashman Jr to do?'
const PLACEHOLDER_CONTINUE = 'Continue thread...'

/**
 * GlobalThreadInput Component
 *
 * Overlay thread input that can be opened via keyboard shortcut (Cmd/Ctrl+K).
 * Supports two modes:
 * - Creating new threads (default)
 * - Resuming existing threads (when thread_id is set or on thread page)
 *
 * Draft state (message, cursor, working_directory, should_resume) is stored in Redux
 * to persist during navigation while the overlay is open.
 */
export default function GlobalThreadInput() {
  const dispatch = useDispatch()
  const location = useLocation()
  const input_ref = useRef(null)
  const prev_is_open_ref = useRef(false)
  const draft_restored_ref = useRef(false)

  // Redux state for overlay
  const is_open = useSelector((state) =>
    state.getIn(['thread_prompt', 'is_open'], false)
  )

  // Draft persistence hook - pass is_open to reload draft when overlay opens
  const draft_persistence = use_draft_persistence(location.pathname, is_open)
  // Thread context captured at open time - persists during navigation
  const thread_id = useSelector((state) =>
    state.getIn(['thread_prompt', 'thread_id'], null)
  )
  const thread_user_public_key = useSelector((state) =>
    state.getIn(['thread_prompt', 'thread_user_public_key'], null)
  )
  const captured_path = useSelector((state) =>
    state.getIn(['thread_prompt', 'captured_path'], null)
  )

  // Current user's public key for ownership check
  const current_user_public_key = useSelector((state) =>
    state.getIn(['app', 'user_public_key'], null)
  )

  // Draft state from Redux - persists during navigation
  const message = useSelector((state) =>
    state.getIn(['thread_prompt', 'draft_message'], '')
  )
  const cursor_position = useSelector((state) =>
    state.getIn(['thread_prompt', 'draft_cursor_position'], 0)
  )
  const working_directory = useSelector((state) =>
    state.getIn(['thread_prompt', 'draft_working_directory'], 'user:')
  )
  const should_resume = useSelector((state) =>
    state.getIn(['thread_prompt', 'draft_should_resume'], true)
  )

  // Auth token for API requests
  const user_token = useSelector((state) => state.getIn(['app', 'user_token']))

  // Update draft state helpers
  const set_message = useCallback(
    (value) =>
      dispatch(thread_prompt_actions.update_draft({ draft_message: value })),
    [dispatch]
  )
  const set_cursor_position = useCallback(
    (value) =>
      dispatch(
        thread_prompt_actions.update_draft({ draft_cursor_position: value })
      ),
    [dispatch]
  )
  const set_working_directory = useCallback(
    (value) =>
      dispatch(
        thread_prompt_actions.update_draft({ draft_working_directory: value })
      ),
    [dispatch]
  )
  const set_should_resume = useCallback(
    (value) =>
      dispatch(
        thread_prompt_actions.update_draft({ draft_should_resume: value })
      ),
    [dispatch]
  )

  // Autocomplete selection handler
  const handle_autocomplete_select = useCallback(
    (new_text, new_cursor_pos) => {
      dispatch(
        thread_prompt_actions.update_draft({
          draft_message: new_text,
          draft_cursor_position: new_cursor_pos
        })
      )

      // Update cursor position in the input after React re-renders
      requestAnimationFrame(() => {
        const input = input_ref.current
        if (input) {
          input.setSelectionRange(new_cursor_pos, new_cursor_pos)
          input.focus()
        }
      })
    },
    [dispatch]
  )

  // File autocomplete hook
  const autocomplete = useFileAutocomplete({
    text: message,
    cursor_position,
    working_directory,
    on_select: handle_autocomplete_select,
    token: user_token
  })

  // Derived state
  const is_thread_context = !!thread_id
  const is_resume_mode = is_thread_context && should_resume

  // Focus input when overlay opens
  useEffect(() => {
    if (is_open && !prev_is_open_ref.current) {
      // Focus input after a brief delay for animation
      setTimeout(() => {
        input_ref.current?.focus()
      }, 100)
    }
    prev_is_open_ref.current = is_open
  }, [is_open])

  // Restore draft from localStorage when overlay opens (only if no existing message)
  useEffect(() => {
    if (
      is_open &&
      !draft_restored_ref.current &&
      !draft_persistence.is_loading
    ) {
      draft_restored_ref.current = true

      // Only restore if there's no message already (e.g., from file_path pre-fill)
      if (!message && draft_persistence.draft) {
        const { message: saved_message, cursor_position: saved_cursor } =
          draft_persistence.draft

        if (saved_message) {
          const cursor_pos = saved_cursor ?? saved_message.length

          dispatch(
            thread_prompt_actions.update_draft({
              draft_message: saved_message,
              draft_cursor_position: cursor_pos
            })
          )

          // Set cursor position after React re-renders
          requestAnimationFrame(() => {
            const input = input_ref.current
            if (input) {
              input.setSelectionRange(cursor_pos, cursor_pos)
            }
          })
        }
      }
    }

    // Reset draft_restored_ref when overlay closes
    if (!is_open) {
      draft_restored_ref.current = false
    }
  }, [
    is_open,
    draft_persistence.is_loading,
    draft_persistence.draft,
    message,
    dispatch
  ])

  // Save draft to localStorage on changes (debounced via hook)
  useEffect(() => {
    if (is_open && message) {
      draft_persistence.save_draft({
        message,
        cursor_position,
        working_directory
      })
    }
  }, [
    is_open,
    message,
    cursor_position,
    working_directory,
    draft_persistence.save_draft
  ])

  // Redux selectors
  const is_loading = useSelector((state) => {
    const action_type = is_resume_mode
      ? threads_action_types.RESUME_THREAD_SESSION
      : threads_action_types.CREATE_THREAD_SESSION
    return state.getIn(['threads', 'loading', action_type], false)
  })

  const can_create_threads = useSelector(get_can_create_threads)

  // Look up thread by ID from any available source (threads list, table, or selected_thread_data)
  const selected_thread = useSelector((state) => {
    if (!thread_id) return null
    return get_thread_by_id(state, thread_id)
  })

  // Check resume permission: prefer captured ownership, fallback to loaded thread data
  const can_resume_thread = (() => {
    if (!thread_id || !current_user_public_key) return false
    // Use captured ownership if available (stable during navigation)
    if (thread_user_public_key) {
      return thread_user_public_key === current_user_public_key
    }
    // Fallback to loaded thread data (for cases where data wasn't available at open time)
    if (selected_thread) {
      return selected_thread.user_public_key === current_user_public_key
    }
    return false
  })()

  // Event handlers
  const handle_close = () => {
    if (!is_loading) {
      dispatch(thread_prompt_actions.close())
    }
  }

  const handle_submit = (e) => {
    e.preventDefault()

    if (!message.trim()) {
      return
    }

    if (is_resume_mode && thread_id) {
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

    // Clear draft from localStorage on successful submit
    draft_persistence.clear_draft()

    // Clear input and close overlay - async errors handled via notifications
    set_message('')
    dispatch(thread_prompt_actions.close())
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

  // Show directory picker when creating new thread or not in thread context
  const show_directory_picker = !is_thread_context || !should_resume

  // Disable submit if loading, no message, or user lacks permission
  const is_submit_disabled =
    is_loading ||
    !message.trim() ||
    (is_resume_mode ? !can_resume_thread : !can_create_threads)

  // Show thread context indicator when resuming a thread
  const show_thread_context = is_resume_mode && selected_thread
  const thread_title = selected_thread?.title

  // If not open, don't render
  if (!is_open) {
    return null
  }

  return (
    <Fade in={is_open}>
      <Box
        className='global-thread-input-backdrop'
        onClick={handle_backdrop_click}>
        <Box className='global-thread-input'>
          {show_thread_context && (
            <Box className='thread-context-indicator'>
              <Typography variant='caption' className='thread-context-label'>
                Resuming:
              </Typography>
              <Typography
                variant='caption'
                className='thread-context-title'
                title={thread_title}>
                {thread_title || 'Untitled thread'}
              </Typography>
            </Box>
          )}
          {is_resume_mode && !can_resume_thread && (
            <Box className='thread-context-indicator permission-warning'>
              <Typography variant='caption' className='thread-context-label'>
                Cannot resume this thread. Switch to New to create a new thread.
              </Typography>
            </Box>
          )}
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
                    current_path={captured_path}
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
