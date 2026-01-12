import { useState, useCallback, useRef, useEffect } from 'react'

import { api, api_request } from '@core/api/service.js'

// Constants
const DEBOUNCE_MS = 150
const MAX_RESULTS = 50
const MIN_SEARCH_LENGTH = 1

/**
 * Extract the @ search term from text at a given cursor position.
 * Returns null if cursor is not in an @ context.
 *
 * @param {string} text - The full input text
 * @param {number} cursor_position - Current cursor position in the text
 * @returns {{ search_term: string, at_position: number } | null}
 */
const extract_at_search_term = (text, cursor_position) => {
  if (!text || cursor_position < 1) {
    return null
  }

  // Scan backwards from cursor to find @ or whitespace
  let at_position = -1
  for (let i = cursor_position - 1; i >= 0; i--) {
    const char = text[i]

    // Stop at whitespace - no @ in this context
    if (/\s/.test(char)) {
      break
    }

    // Found @
    if (char === '@') {
      at_position = i
      break
    }
  }

  if (at_position === -1) {
    return null
  }

  // Extract the search term between @ and cursor
  const search_term = text.slice(at_position + 1, cursor_position)

  return { search_term, at_position }
}

/**
 * useFileAutocomplete hook
 *
 * Provides file/directory autocomplete functionality triggered by @ character.
 * Handles pattern detection, API calls, keyboard navigation, and suggestion selection.
 *
 * @param {Object} options
 * @param {string} options.text - Current input text
 * @param {number} options.cursor_position - Current cursor position
 * @param {string} options.working_directory - Directory to scope search to
 * @param {Function} options.on_select - Callback when suggestion is selected, receives (new_text, new_cursor_position)
 * @param {string} [options.token] - Optional auth token for API requests
 */
export default function useFileAutocomplete({
  text,
  cursor_position,
  working_directory,
  on_select,
  token
}) {
  // State
  const [suggestions, set_suggestions] = useState([])
  const [selected_index, set_selected_index] = useState(0)
  const [is_loading, set_is_loading] = useState(false)
  const [is_visible, set_is_visible] = useState(false)

  // Refs
  const debounce_timer_ref = useRef(null)
  const abort_controller_ref = useRef(null)
  const last_search_term_ref = useRef('')

  // Extract current @ context
  const at_context = extract_at_search_term(text, cursor_position)
  const search_term = at_context?.search_term ?? ''
  const at_position = at_context?.at_position ?? -1

  // Fetch suggestions from API
  const fetch_suggestions = useCallback(
    async (term) => {
      // Abort any in-flight request
      if (abort_controller_ref.current) {
        abort_controller_ref.current()
      }

      // Empty search shows recent/common files, but we need at least @ to trigger
      if (at_position === -1) {
        set_suggestions([])
        set_is_visible(false)
        return
      }

      set_is_loading(true)

      try {
        const { abort, request } = api_request(
          api.search,
          {
            q: term,
            mode: 'paths',
            directory: working_directory,
            limit: MAX_RESULTS
          },
          token
        )

        abort_controller_ref.current = abort

        const response = await request()
        const results = response?.results || []

        set_suggestions(results)
        set_selected_index(0)
        set_is_visible(results.length > 0 || term.length >= MIN_SEARCH_LENGTH)
        last_search_term_ref.current = term
      } catch (error) {
        // Ignore abort errors
        if (error.name !== 'AbortError') {
          console.error('File autocomplete search error:', error)
          set_suggestions([])
          set_is_visible(false)
        }
      } finally {
        set_is_loading(false)
        abort_controller_ref.current = null
      }
    },
    [at_position, working_directory, token]
  )

  // Debounced search effect
  useEffect(() => {
    // Clear existing timer
    if (debounce_timer_ref.current) {
      clearTimeout(debounce_timer_ref.current)
    }

    // If not in @ context, hide immediately
    if (at_position === -1) {
      set_suggestions([])
      set_is_visible(false)
      return
    }

    // Debounce the API call
    debounce_timer_ref.current = setTimeout(() => {
      fetch_suggestions(search_term)
    }, DEBOUNCE_MS)

    return () => {
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current)
      }
    }
  }, [search_term, at_position, fetch_suggestions])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abort_controller_ref.current) {
        abort_controller_ref.current()
      }
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current)
      }
    }
  }, [])

  // Handle suggestion selection
  const handle_select = useCallback(
    (suggestion) => {
      if (!suggestion || at_position === -1) {
        return
      }

      // Get the path to insert (relative path from suggestion)
      const file_path =
        suggestion.file_path ||
        suggestion.relative_path ||
        suggestion.path ||
        ''

      // Insert as @<path> with trailing space for easy continuation
      const path_to_insert = '@' + file_path + ' '

      // Calculate new text: replace @<partial> with @<full-path>
      const before_at = text.slice(0, at_position)
      const after_cursor = text.slice(cursor_position)
      const new_text = before_at + path_to_insert + after_cursor

      // Calculate new cursor position (after inserted path)
      const new_cursor_position = at_position + path_to_insert.length

      // Call the callback with new text and cursor position
      on_select(new_text, new_cursor_position)

      // Hide suggestions
      set_suggestions([])
      set_is_visible(false)
      set_selected_index(0)
    },
    [text, cursor_position, at_position, on_select]
  )

  // Keyboard navigation handlers
  const handle_arrow_down = useCallback(() => {
    if (!is_visible || suggestions.length === 0) {
      return false
    }

    set_selected_index((prev) =>
      prev >= suggestions.length - 1 ? 0 : prev + 1
    )
    return true
  }, [is_visible, suggestions.length])

  const handle_arrow_up = useCallback(() => {
    if (!is_visible || suggestions.length === 0) {
      return false
    }

    set_selected_index((prev) =>
      prev <= 0 ? suggestions.length - 1 : prev - 1
    )
    return true
  }, [is_visible, suggestions.length])

  const handle_tab = useCallback(() => {
    if (!is_visible || suggestions.length === 0) {
      return false
    }

    handle_select(suggestions[selected_index])
    return true
  }, [is_visible, suggestions, selected_index, handle_select])

  const handle_escape = useCallback(() => {
    if (!is_visible) {
      return false
    }

    set_suggestions([])
    set_is_visible(false)
    set_selected_index(0)
    return true
  }, [is_visible])

  // Combined keyboard handler for integration
  const handle_keydown = useCallback(
    (event) => {
      if (!is_visible) {
        return false
      }

      switch (event.key) {
        case 'ArrowDown':
          if (handle_arrow_down()) {
            event.preventDefault()
            return true
          }
          break
        case 'ArrowUp':
          if (handle_arrow_up()) {
            event.preventDefault()
            return true
          }
          break
        case 'Tab':
          if (handle_tab()) {
            event.preventDefault()
            return true
          }
          break
        case 'Escape':
          if (handle_escape()) {
            event.preventDefault()
            return true
          }
          break
        default:
          break
      }

      return false
    },
    [is_visible, handle_arrow_down, handle_arrow_up, handle_tab, handle_escape]
  )

  // Handle click selection
  const handle_click_select = useCallback(
    (index) => {
      if (index >= 0 && index < suggestions.length) {
        handle_select(suggestions[index])
      }
    },
    [suggestions, handle_select]
  )

  return {
    // State
    suggestions,
    selected_index,
    is_loading,
    is_visible,
    search_term,

    // Handlers
    handle_keydown,
    handle_click_select,
    handle_select,

    // Individual keyboard handlers (for testing)
    handle_arrow_down,
    handle_arrow_up,
    handle_tab,
    handle_escape
  }
}

// Export helper for testing
export { extract_at_search_term }
