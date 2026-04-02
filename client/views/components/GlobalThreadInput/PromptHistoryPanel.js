import React, { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'

import { format_relative_time } from './use-prompt-history.js'

function truncate_first_line(text, max_length = 80) {
  const first_line = text.split('\n')[0]
  if (first_line.length <= max_length) return first_line
  return first_line.slice(0, max_length) + '...'
}

export default function PromptHistoryPanel({
  entries,
  filter_text,
  on_filter_change,
  on_select,
  on_close,
  on_clear
}) {
  const [selected_index, set_selected_index] = useState(0)
  const filter_input_ref = useRef(null)
  const list_ref = useRef(null)

  // Auto-focus filter input on mount
  useEffect(() => {
    filter_input_ref.current?.focus()
  }, [])

  // Reset selection when filter changes
  useEffect(() => {
    set_selected_index(0)
  }, [filter_text])

  // Scroll selected entry into view
  useEffect(() => {
    if (!list_ref.current) return
    const selected_el = list_ref.current.children[selected_index]
    if (selected_el) {
      selected_el.scrollIntoView({ block: 'nearest' })
    }
  }, [selected_index])

  const handle_key_down = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        on_close()
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        set_selected_index((prev) => Math.min(prev + 1, entries.length - 1))
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        set_selected_index((prev) => Math.max(prev - 1, 0))
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (entries.length > 0) {
          on_select(selected_index)
        }
      }
    },
    [entries.length, selected_index, on_select, on_close]
  )

  const handle_filter_change = useCallback(
    (e) => {
      on_filter_change(e.target.value)
    },
    [on_filter_change]
  )

  return (
    <div className='prompt-history-panel' onKeyDown={handle_key_down}>
      <div className='prompt-history-filter'>
        <input
          ref={filter_input_ref}
          type='text'
          value={filter_text}
          onChange={handle_filter_change}
          placeholder='Filter history...'
          className='prompt-history-filter-input'
        />
        <button
          type='button'
          className='prompt-history-clear-btn'
          onClick={on_clear}
          title='Clear history'>
          Clear
        </button>
      </div>
      <div className='prompt-history-list' ref={list_ref}>
        {entries.length === 0 ? (
          <div className='prompt-history-empty'>No matching prompts</div>
        ) : (
          entries.map((entry, index) => (
            <div
              key={`${entry.timestamp}-${index}`}
              className={`prompt-history-entry${index === selected_index ? ' prompt-history-entry--selected' : ''}`}
              onClick={() => on_select(index)}
              onMouseEnter={() => set_selected_index(index)}>
              <span className='prompt-history-entry-text'>
                {truncate_first_line(entry.text)}
              </span>
              <span className='prompt-history-timestamp'>
                {format_relative_time(entry.timestamp)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

PromptHistoryPanel.propTypes = {
  entries: PropTypes.arrayOf(
    PropTypes.shape({
      text: PropTypes.string.isRequired,
      timestamp: PropTypes.number.isRequired
    })
  ).isRequired,
  filter_text: PropTypes.string.isRequired,
  on_filter_change: PropTypes.func.isRequired,
  on_select: PropTypes.func.isRequired,
  on_close: PropTypes.func.isRequired,
  on_clear: PropTypes.func.isRequired
}
