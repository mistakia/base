import { useState, useEffect, useCallback, useRef } from 'react'

// Constants
const STORAGE_KEY_PREFIX = 'thread_input_draft'
const DEFAULT_TTL_MS = 2592000000 // 30 days
const DEBOUNCE_DELAY_MS = 250

/**
 * Generate localStorage key for draft storage
 * @param {Object} params
 * @param {string} params.namespace_type - Type of namespace: 'thread' or 'global'
 * @param {string|null} params.namespace_value - Value for the namespace (thread ID, path, or null for global)
 * @returns {string} localStorage key
 */
export function get_draft_storage_key({ namespace_type, namespace_value }) {
  if (namespace_type === 'global') {
    return `${STORAGE_KEY_PREFIX}:global`
  }
  return `${STORAGE_KEY_PREFIX}:${namespace_type}:${namespace_value}`
}

/**
 * Resolve namespace from pathname
 * @param {string} pathname - Current URL pathname
 * @returns {Object} Namespace object with type and value
 */
export function resolve_namespace_from_pathname(pathname) {
  // Thread page: /thread/:id
  const thread_match = pathname.match(/^\/thread\/([^/]+)/)
  if (thread_match) {
    return { namespace_type: 'thread', namespace_value: thread_match[1] }
  }

  // All non-thread pages share a single global draft
  return { namespace_type: 'global', namespace_value: null }
}

/**
 * Load draft from localStorage
 * @param {Object} params
 * @param {string} params.namespace_type - Type of namespace
 * @param {string|null} params.namespace_value - Value for the namespace
 * @returns {Object|null} Draft object or null if not found/expired
 */
export function load_draft({ namespace_type, namespace_value }) {
  try {
    const key = get_draft_storage_key({ namespace_type, namespace_value })
    const stored = localStorage.getItem(key)

    if (!stored) {
      return null
    }

    const draft = JSON.parse(stored)
    const now = Date.now()

    // Check if draft has expired
    if (draft.updated_at && now - draft.updated_at > DEFAULT_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }

    return draft
  } catch {
    return null
  }
}

/**
 * Save draft to localStorage
 * @param {Object} params
 * @param {string} params.namespace_type - Type of namespace
 * @param {string|null} params.namespace_value - Value for the namespace
 * @param {string} params.message - Draft message content
 * @param {number} params.cursor_position - Cursor position in message
 * @param {string} params.working_directory_uri - Working directory setting
 */
export function save_draft({
  namespace_type,
  namespace_value,
  message,
  cursor_position,
  working_directory_uri
}) {
  try {
    const key = get_draft_storage_key({ namespace_type, namespace_value })

    // Don't save empty drafts
    if (!message || !message.trim()) {
      localStorage.removeItem(key)
      return
    }

    const draft = {
      message,
      cursor_position,
      working_directory_uri,
      updated_at: Date.now()
    }

    localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Silently fail on storage errors (quota exceeded, etc.)
  }
}

/**
 * Clear draft from localStorage
 * @param {Object} params
 * @param {string} params.namespace_type - Type of namespace
 * @param {string|null} params.namespace_value - Value for the namespace
 */
export function clear_draft({ namespace_type, namespace_value }) {
  try {
    const key = get_draft_storage_key({ namespace_type, namespace_value })
    localStorage.removeItem(key)
  } catch {
    // Silently fail on storage errors
  }
}

/**
 * Prune all expired drafts from localStorage
 */
export function prune_expired_drafts() {
  try {
    const keys_to_remove = []
    const now = Date.now()

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        try {
          const stored = localStorage.getItem(key)
          if (stored) {
            const draft = JSON.parse(stored)
            if (draft.updated_at && now - draft.updated_at > DEFAULT_TTL_MS) {
              keys_to_remove.push(key)
            }
          }
        } catch {
          // Invalid JSON, mark for removal
          keys_to_remove.push(key)
        }
      }
    }

    keys_to_remove.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Silently fail on storage errors
  }
}

/**
 * Hook for managing draft persistence with localStorage
 * @param {string} pathname - Current URL pathname for namespace resolution
 * @param {boolean} is_active - Whether the input is currently active/open
 * @returns {Object} Draft persistence interface
 */
export default function use_draft_persistence(pathname, is_active = true) {
  const [draft, set_draft] = useState(null)
  const [is_loading, set_is_loading] = useState(true)
  const namespace_ref = useRef(null)
  const debounce_timer_ref = useRef(null)

  // Resolve namespace from pathname
  const namespace = resolve_namespace_from_pathname(pathname)
  namespace_ref.current = namespace

  // Load draft on mount, when pathname changes, or when becoming active
  useEffect(() => {
    if (!is_active) {
      return
    }

    set_is_loading(true)

    // Prune expired drafts on load
    prune_expired_drafts()

    // Load draft for current namespace
    const loaded_draft = load_draft(namespace)
    set_draft(loaded_draft)
    set_is_loading(false)
  }, [namespace.namespace_type, namespace.namespace_value, is_active])

  // Debounced save function
  const save_draft_debounced = useCallback(
    ({ message, cursor_position, working_directory_uri }) => {
      // Clear any pending save
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current)
      }

      debounce_timer_ref.current = setTimeout(() => {
        const current_namespace = namespace_ref.current
        save_draft({
          namespace_type: current_namespace.namespace_type,
          namespace_value: current_namespace.namespace_value,
          message,
          cursor_position,
          working_directory_uri
        })
      }, DEBOUNCE_DELAY_MS)
    },
    []
  )

  // Clear draft function
  const clear_draft_for_namespace = useCallback(() => {
    // Clear any pending save
    if (debounce_timer_ref.current) {
      clearTimeout(debounce_timer_ref.current)
    }

    const current_namespace = namespace_ref.current
    clear_draft({
      namespace_type: current_namespace.namespace_type,
      namespace_value: current_namespace.namespace_value
    })
    set_draft(null)
  }, [])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current)
      }
    }
  }, [])

  return {
    draft,
    save_draft: save_draft_debounced,
    clear_draft: clear_draft_for_namespace,
    is_loading
  }
}
