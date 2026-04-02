import { useState, useCallback, useRef } from 'react'

const STORAGE_KEY = 'thread_input_prompt_history'
const MAX_ENTRIES = 200

function load_history() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save_history(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Silently fail on storage errors (quota exceeded, etc.)
  }
}

function record_prompt(text) {
  if (!text || !text.trim()) return

  const entries = load_history()

  // Deduplicate consecutive: skip if identical to most recent
  if (entries.length > 0 && entries[0].text === text) return

  const entry = { text, timestamp: Date.now() }
  const updated = [entry, ...entries].slice(0, MAX_ENTRIES)
  save_history(updated)
}

function clear_history_storage() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Silently fail
  }
}

export function format_relative_time(timestamp) {
  const diff_ms = Date.now() - timestamp
  const diff_seconds = Math.floor(diff_ms / 1000)
  const diff_minutes = Math.floor(diff_seconds / 60)
  const diff_hours = Math.floor(diff_minutes / 60)
  const diff_days = Math.floor(diff_hours / 24)

  if (diff_seconds < 60) return 'now'
  if (diff_minutes < 60) return `${diff_minutes}m ago`
  if (diff_hours < 24) return `${diff_hours}h ago`
  if (diff_days === 1) return 'yesterday'
  return `${diff_days}d ago`
}

function get_filtered_entries(entries, filter_text) {
  if (!filter_text) return entries

  const lower_filter = filter_text.toLowerCase()
  return entries.filter((entry) =>
    entry.text.toLowerCase().includes(lower_filter)
  )
}

export default function use_prompt_history() {
  const history_index_ref = useRef(-1)
  const saved_draft_ref = useRef('')

  const [is_panel_open, set_is_panel_open] = useState(false)
  const [filter_text, set_filter_text] = useState('')
  const [is_navigating, set_is_navigating] = useState(false)

  // Cached entries -- refreshed on mutation, not on every render
  const [cached_entries, set_cached_entries] = useState(() => load_history())

  const refresh_entries = useCallback(() => {
    set_cached_entries(load_history())
  }, [])

  const navigate_back = useCallback((current_text) => {
    const entries = load_history()
    if (entries.length === 0) return null

    // Save draft when starting navigation
    if (history_index_ref.current === -1) {
      saved_draft_ref.current = current_text
    }

    const next_index = history_index_ref.current + 1
    if (next_index >= entries.length) return null

    history_index_ref.current = next_index
    set_is_navigating(true)
    return entries[next_index].text
  }, [])

  const navigate_forward = useCallback(() => {
    if (history_index_ref.current <= -1) return null

    const next_index = history_index_ref.current - 1
    history_index_ref.current = next_index

    if (next_index === -1) {
      set_is_navigating(false)
      return saved_draft_ref.current
    }

    const entries = load_history()
    return entries[next_index]?.text ?? null
  }, [])

  const reset_navigation = useCallback(() => {
    history_index_ref.current = -1
    saved_draft_ref.current = ''
    set_is_navigating(false)
  }, [])

  const toggle_panel = useCallback(() => {
    set_is_panel_open((prev) => {
      if (prev) set_filter_text('')
      return !prev
    })
  }, [])

  const close_panel = useCallback(() => {
    set_is_panel_open(false)
    set_filter_text('')
  }, [])

  const select_entry = useCallback(
    (index) => {
      const filtered = get_filtered_entries(cached_entries, filter_text)
      if (index < 0 || index >= filtered.length) return null
      close_panel()
      return filtered[index].text
    },
    [cached_entries, filter_text, close_panel]
  )

  const handle_record_prompt = useCallback(
    (text) => {
      record_prompt(text)
      refresh_entries()
    },
    [refresh_entries]
  )

  const clear_history = useCallback(() => {
    clear_history_storage()
    refresh_entries()
    reset_navigation()
    close_panel()
  }, [refresh_entries, reset_navigation, close_panel])

  const filtered_entries = get_filtered_entries(cached_entries, filter_text)

  return {
    is_navigating,
    navigate_back,
    navigate_forward,
    reset_navigation,
    is_panel_open,
    toggle_panel,
    close_panel,
    filter_text,
    set_filter_text,
    filtered_entries,
    select_entry,
    clear_history,
    record_prompt: handle_record_prompt
  }
}
