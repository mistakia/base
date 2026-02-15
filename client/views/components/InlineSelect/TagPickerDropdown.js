import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'

import './TagPickerDropdown.styl'

const TagPickerDropdown = ({
  available_tags,
  selected_tags,
  on_toggle,
  on_close,
  anchor_el,
  open
}) => {
  const dropdown_ref = useRef(null)
  const search_ref = useRef(null)
  const [position, set_position] = useState({ top: 0, left: 0 })
  const [focused_index, set_focused_index] = useState(0)
  const [search_query, set_search_query] = useState('')

  const selected_set = new Set(selected_tags || [])

  const filtered_tags = available_tags.filter((tag) => {
    const display = (tag.title || tag.base_uri || '').toLowerCase()
    return display.includes(search_query.toLowerCase())
  })

  // Calculate position based on anchor element
  useEffect(() => {
    if (open && anchor_el) {
      const rect = anchor_el.getBoundingClientRect()
      set_position({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      })
      set_focused_index(0)
      set_search_query('')
    }
  }, [open, anchor_el])

  // Focus search input when opened
  useEffect(() => {
    if (open && search_ref.current) {
      search_ref.current.focus()
    }
  }, [open])

  // Handle click outside
  useEffect(() => {
    if (!open) return

    const handle_click_outside = (event) => {
      if (
        dropdown_ref.current &&
        !dropdown_ref.current.contains(event.target) &&
        anchor_el &&
        !anchor_el.contains(event.target)
      ) {
        on_close()
      }
    }

    document.addEventListener('mousedown', handle_click_outside)
    return () => document.removeEventListener('mousedown', handle_click_outside)
  }, [open, on_close, anchor_el])

  // Handle keyboard navigation
  const handle_keydown = useCallback(
    (event) => {
      if (!open) return

      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          on_close()
          break
        case 'ArrowDown':
          event.preventDefault()
          set_focused_index((prev) =>
            prev < filtered_tags.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          event.preventDefault()
          set_focused_index((prev) =>
            prev > 0 ? prev - 1 : filtered_tags.length - 1
          )
          break
        case 'Enter':
          event.preventDefault()
          if (focused_index >= 0 && focused_index < filtered_tags.length) {
            on_toggle(filtered_tags[focused_index].base_uri)
          }
          break
        default:
          break
      }
    },
    [open, filtered_tags, focused_index, on_toggle, on_close]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handle_keydown)
      return () => document.removeEventListener('keydown', handle_keydown)
    }
  }, [open, handle_keydown])

  // Reset focused index when search changes
  useEffect(() => {
    set_focused_index(0)
  }, [search_query])

  if (!open) return null

  const get_tag_display = (tag) => {
    if (tag.title) return tag.title
    return (tag.base_uri || '')
      .replace(/^(user|sys):tag\//, '')
      .replace(/\.md$/, '')
  }

  const dropdown_content = (
    <div
      ref={dropdown_ref}
      className='tag-picker-dropdown'
      style={{ top: position.top, left: position.left }}>
      <div className='tag-picker-search'>
        <input
          ref={search_ref}
          type='text'
          placeholder='Search tags...'
          value={search_query}
          onChange={(e) => set_search_query(e.target.value)}
          className='tag-picker-search-input'
        />
      </div>
      <div className='tag-picker-list'>
        {filtered_tags.length === 0 && (
          <div className='tag-picker-empty'>No tags found</div>
        )}
        {filtered_tags.map((tag, index) => {
          const is_selected = selected_set.has(tag.base_uri)
          const is_focused = index === focused_index

          return (
            <div
              key={tag.base_uri}
              className={`tag-picker-option ${is_focused ? 'tag-picker-option--focused' : ''}`}
              onClick={() => on_toggle(tag.base_uri)}>
              <span className='tag-picker-check'>
                {is_selected ? '\u2713' : ''}
              </span>
              <span className='tag-picker-label'>{get_tag_display(tag)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )

  return ReactDOM.createPortal(dropdown_content, document.body)
}

TagPickerDropdown.propTypes = {
  available_tags: PropTypes.array.isRequired,
  selected_tags: PropTypes.array,
  on_toggle: PropTypes.func.isRequired,
  on_close: PropTypes.func.isRequired,
  anchor_el: PropTypes.instanceOf(Element),
  open: PropTypes.bool.isRequired
}

export default TagPickerDropdown
