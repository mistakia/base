import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Box, CircularProgress, Typography, Fade } from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'

import Button from '@components/primitives/Button'
import { threads_actions } from '@core/threads/actions'
import { thread_prompt_actions } from '@core/thread-prompt/index.js'
import { get_can_create_threads } from '@core/app/selectors'
import { get_thread_by_id } from '@core/threads/selectors.js'
import WorkingDirectoryPicker from './WorkingDirectoryPicker'
import FileAutocompleteSuggestions from './FileAutocompleteSuggestions.js'
import useFileAutocomplete from './use-file-autocomplete.js'
import use_draft_persistence from './use-draft-persistence.js'
import use_voice_input from './use-voice-input.js'
import use_prompt_history from './use-prompt-history.js'
import PromptHistoryPanel from './PromptHistoryPanel.js'
import './GlobalThreadInput.styl'

// Constants
const KEYBOARD_HINT = 'Cmd+Enter to send'
const PLACEHOLDER_NEW_THREAD = 'What would you like Trashman Jr to do?'
const PLACEHOLDER_CONTINUE = 'Continue thread...'

// ContentEditable cursor helpers
const get_cursor_offset = (element) => {
  try {
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount) return 0
    const range = selection.getRangeAt(0)
    const pre_range = range.cloneRange()
    pre_range.selectNodeContents(element)
    pre_range.setEnd(range.startContainer, range.startOffset)
    return pre_range.toString().length
  } catch {
    return 0
  }
}

const set_cursor_offset = (element, offset) => {
  try {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    )
    let remaining = offset
    let node = walker.nextNode()
    while (node) {
      const len = node.textContent.length
      if (remaining <= len) {
        const selection = window.getSelection()
        const range = document.createRange()
        range.setStart(node, Math.min(remaining, len))
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        return
      }
      remaining -= len
      node = walker.nextNode()
    }
  } catch {
    // Ignore cursor position errors
  }
}

/**
 * GlobalThreadInput Component
 *
 * Overlay thread input that can be opened via keyboard shortcut (Cmd/Ctrl+K).
 * Supports two modes:
 * - Creating new threads (default)
 * - Resuming existing threads (when thread_id is set or on thread page)
 *
 * Draft state (message, cursor, working_directory_uri, should_resume) is stored in Redux
 * to persist during navigation while the overlay is open.
 */
export default function GlobalThreadInput() {
  const dispatch = useDispatch()
  const location = useLocation()
  const input_ref = useRef(null)
  const prev_is_open_ref = useRef(false)
  const draft_restored_ref = useRef(false)
  const internal_update_ref = useRef(false)

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
  const working_directory_uri = useSelector((state) =>
    state.getIn(['thread_prompt', 'draft_working_directory_uri'], 'user:')
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
  const set_working_directory_uri = useCallback(
    (value) =>
      dispatch(
        thread_prompt_actions.update_draft({ draft_working_directory_uri: value })
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

      // Update contentEditable DOM and cursor position
      requestAnimationFrame(() => {
        const el = input_ref.current
        if (el) {
          el.textContent = new_text
          set_cursor_offset(el, new_cursor_pos)
          el.focus()
        }
      })
    },
    [dispatch]
  )

  // File autocomplete hook
  const autocomplete = useFileAutocomplete({
    text: message,
    cursor_position,
    working_directory_uri,
    on_select: handle_autocomplete_select,
    token: user_token
  })

  // Voice input hook
  const handle_voice_transcript = useCallback(
    (text) => {
      const trimmed = text.trim()
      if (!trimmed) return
      // Append transcription to existing message with space separator
      const current = message
      const separator = current && !current.endsWith(' ') ? ' ' : ''
      const new_message = current + separator + trimmed
      dispatch(
        thread_prompt_actions.update_draft({
          draft_message: new_message,
          draft_cursor_position: new_message.length
        })
      )
    },
    [message, dispatch]
  )

  const voice = use_voice_input({ on_transcript: handle_voice_transcript })
  const prompt_history = use_prompt_history()

  const handle_voice_toggle = useCallback(() => {
    if (voice.is_recording) {
      voice.stop_recording()
    } else {
      voice.start_recording()
    }
  }, [voice])

  // Derived state
  const is_thread_context = !!thread_id
  const is_resume_mode = is_thread_context && should_resume

  // Focus input when overlay opens
  useEffect(() => {
    if (is_open && !prev_is_open_ref.current) {
      const focus_input = () => input_ref.current?.focus()
      const timer = setTimeout(focus_input, 100)

      // iOS fallback: focus on first touch if programmatic focus was blocked
      const handle_touch = () => focus_input()
      document.addEventListener('touchstart', handle_touch, { once: true })

      return () => {
        clearTimeout(timer)
        document.removeEventListener('touchstart', handle_touch)
      }
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

          // Sync to contentEditable DOM after React re-renders
          requestAnimationFrame(() => {
            const el = input_ref.current
            if (el) {
              el.textContent = saved_message
              set_cursor_offset(el, cursor_pos)
            }
          })
        }
      }
    }

    // Reset draft_restored_ref and submitting state when overlay closes
    if (!is_open) {
      draft_restored_ref.current = false
      set_is_submitting(false)
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
        working_directory_uri
      })
    }
  }, [
    is_open,
    message,
    cursor_position,
    working_directory_uri,
    draft_persistence.save_draft
  ])

  // Local submitting state - set on dispatch, cleared when overlay closes
  const [is_submitting, set_is_submitting] = useState(false)
  const is_loading = is_submitting

  const can_create_threads = useSelector(get_can_create_threads)

  // Look up thread by ID from any available source (thread_cache, threads list, or table)
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
      prompt_history.close_panel()
      prompt_history.reset_navigation()
      dispatch(thread_prompt_actions.close())
    }
  }

  const handle_submit = (e) => {
    e.preventDefault()

    if (!message.trim()) {
      return
    }

    prompt_history.record_prompt(message)

    if (is_resume_mode && thread_id) {
      dispatch(
        threads_actions.resume_thread_session({
          thread_id,
          prompt: message,
          working_directory: working_directory_uri
        })
      )
    } else {
      dispatch(
        threads_actions.create_thread_session({
          prompt: message,
          working_directory: working_directory_uri
        })
      )
    }

    set_is_submitting(true)

    // Clear draft from localStorage on successful submit
    draft_persistence.clear_draft()

    // Clear input and close overlay - async errors handled via notifications
    set_message('')
    dispatch(thread_prompt_actions.close())
  }

  // Sync external message changes (voice, autocomplete) to contentEditable DOM
  useEffect(() => {
    if (internal_update_ref.current) {
      internal_update_ref.current = false
      return
    }
    const el = input_ref.current
    if (!el) return
    const current_text = el.textContent || ''
    if (current_text !== message) {
      internal_update_ref.current = true
      el.textContent = message
      if (message) {
        requestAnimationFrame(() => {
          set_cursor_offset(el, cursor_position)
        })
      }
    }
  }, [message, cursor_position])

  const handle_history_close = useCallback(() => {
    prompt_history.close_panel()
    input_ref.current?.focus()
  }, [prompt_history.close_panel])

  const handle_history_select = useCallback(
    (index) => {
      const text = prompt_history.select_entry(index)
      if (text !== null) {
        set_message(text)
        requestAnimationFrame(() => {
          const el = input_ref.current
          if (el) {
            el.textContent = text
            set_cursor_offset(el, text.length)
            el.focus()
          }
        })
      }
    },
    [prompt_history.select_entry, set_message]
  )

  const handle_key_down = (e) => {
    // Escape: close autocomplete, then history panel, then overlay
    if (e.key === 'Escape') {
      if (autocomplete.is_visible) {
        autocomplete.handle_escape()
        return
      }
      if (prompt_history.is_panel_open) {
        handle_history_close()
        return
      }
      handle_close()
      return
    }

    // Delegate to autocomplete for other keys if suggestions are visible
    if (autocomplete.handle_keydown(e)) {
      return
    }

    // Toggle history panel with Cmd/Ctrl+H
    if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
      e.preventDefault()
      prompt_history.toggle_panel()
      return
    }

    // If history panel is open, let it handle navigation keys
    if (prompt_history.is_panel_open) {
      return
    }

    // Inline history navigation: ArrowUp at cursor position 0
    if (e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey) {
      const el = input_ref.current
      if (el && get_cursor_offset(el) === 0) {
        const text = prompt_history.navigate_back(message)
        if (text !== null) {
          e.preventDefault()
          set_message(text)
          requestAnimationFrame(() => {
            el.textContent = text
            set_cursor_offset(el, 0)
          })
          return
        }
      }
    }

    // Inline history navigation: ArrowDown at cursor end
    if (
      e.key === 'ArrowDown' &&
      !e.metaKey &&
      !e.ctrlKey &&
      prompt_history.is_navigating
    ) {
      const el = input_ref.current
      const text_length = (el?.textContent || '').length
      if (el && get_cursor_offset(el) === text_length) {
        const text = prompt_history.navigate_forward()
        if (text !== null) {
          e.preventDefault()
          set_message(text)
          requestAnimationFrame(() => {
            el.textContent = text
            set_cursor_offset(el, text.length)
          })
          return
        }
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handle_submit(e)
      return
    }

    // Consistent newline handling in contentEditable
    // Browsers do not visually render a trailing \n in text nodes with
    // white-space:pre-wrap. When the newline is at the end of the element,
    // we insert \n\n (sentinel) so the visible newline is never trailing.
    if (e.key === 'Enter') {
      e.preventDefault()
      const selection = window.getSelection()
      if (selection.rangeCount) {
        const range = selection.getRangeAt(0)
        selection.deleteFromDocument()

        // Check if cursor is at the end: after insertNode splits the text
        // node, the inserted node's nextSibling is either null or an empty
        // text node remainder from the split.
        const text_node = document.createTextNode('\n')
        range.insertNode(text_node)

        const next = text_node.nextSibling
        const at_end =
          !next || (next.nodeType === Node.TEXT_NODE && !next.textContent)

        if (at_end) {
          text_node.textContent = '\n\n'
        }

        // Position cursor after the first \n (before sentinel if present)
        const cursor = document.createRange()
        cursor.setStart(text_node, 1)
        cursor.collapse(true)
        selection.removeAllRanges()
        selection.addRange(cursor)
      }
    }
  }

  // Track text and cursor from contentEditable input events
  const handle_input_change = () => {
    const el = input_ref.current
    if (!el) return
    internal_update_ref.current = true
    let text = el.textContent || ''

    // Normalize empty state for CSS :empty placeholder
    if (!text || !text.trim()) {
      text = ''
      el.innerHTML = ''
    }

    // Reset history navigation when user types
    if (prompt_history.is_navigating) {
      prompt_history.reset_navigation()
    }

    set_message(text)
    if (text) {
      set_cursor_position(get_cursor_offset(el))
    } else {
      set_cursor_position(0)
    }
  }

  const handle_input_select = () => {
    const el = input_ref.current
    if (!el) return
    set_cursor_position(get_cursor_offset(el))
  }

  const handle_paste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    const selection = window.getSelection()
    if (selection.rangeCount) {
      selection.deleteFromDocument()
      const text_node = document.createTextNode(text)
      selection.getRangeAt(0).insertNode(text_node)
      selection.collapseToEnd()
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

  // Track input container height via CSS custom property for other components
  const container_ref = useRef(null)
  useEffect(() => {
    if (!is_open) {
      document.documentElement.style.setProperty(
        '--global-thread-input-height',
        '0px'
      )
      return
    }

    const el = container_ref.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = Math.round(
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
        )
        document.documentElement.style.setProperty(
          '--global-thread-input-height',
          `${height}px`
        )
      }
    })

    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.setProperty(
        '--global-thread-input-height',
        '0px'
      )
    }
  }, [is_open])

  // If not open, don't render
  if (!is_open) {
    return null
  }

  return (
    <Fade in={is_open}>
      <Box
        className='global-thread-input-backdrop'
        onClick={handle_backdrop_click}>
        <Box ref={container_ref} className='global-thread-input'>
          <Box
            className='input-collapse-button'
            onClick={handle_close}
            role='button'
            aria-label='Collapse input'>
            <KeyboardArrowDownIcon className='collapse-icon' />
          </Box>
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
          {prompt_history.is_panel_open && (
            <PromptHistoryPanel
              entries={prompt_history.filtered_entries}
              filter_text={prompt_history.filter_text}
              on_filter_change={prompt_history.set_filter_text}
              on_select={handle_history_select}
              on_close={handle_history_close}
              on_clear={prompt_history.clear_history}
            />
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
              <div
                ref={input_ref}
                contentEditable={!is_loading}
                role='textbox'
                aria-multiline='true'
                aria-placeholder={placeholder_text}
                className='thread-input-editable'
                enterKeyHint='return'
                onInput={handle_input_change}
                onKeyDown={handle_key_down}
                onClick={handle_input_select}
                onPaste={handle_paste}
                data-placeholder={placeholder_text}
                tabIndex={0}
                suppressContentEditableWarning
              />
            </Box>

            <Box className='input-bottom-row'>
              <Box className='bottom-row-left'>
                {show_directory_picker && (
                  <WorkingDirectoryPicker
                    value={working_directory_uri}
                    onChange={set_working_directory_uri}
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
                {voice.is_supported && (
                  <Button
                    type='button'
                    variant={voice.is_recording ? 'primary' : 'default'}
                    icon
                    disabled={is_loading || voice.is_transcribing}
                    className={`mic-button ${voice.is_recording ? 'recording' : ''} ${voice.is_transcribing ? 'transcribing' : ''}`}
                    onClick={handle_voice_toggle}>
                    {voice.is_transcribing ? (
                      <CircularProgress size={16} className='loading-spinner' />
                    ) : voice.is_recording ? (
                      <StopIcon className='mic-icon' />
                    ) : (
                      <MicIcon className='mic-icon' />
                    )}
                  </Button>
                )}
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
