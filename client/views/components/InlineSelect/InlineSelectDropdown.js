import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'

import './InlineSelectDropdown.styl'

const InlineSelectDropdown = ({
  options,
  value,
  on_change,
  on_close,
  anchor_el,
  open,
  color_attribute
}) => {
  const dropdown_ref = useRef(null)
  const [position, set_position] = useState({ top: 0, left: 0 })
  const [focused_index, set_focused_index] = useState(-1)

  // Calculate position based on anchor element
  useEffect(() => {
    if (open && anchor_el) {
      const rect = anchor_el.getBoundingClientRect()
      set_position({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      })

      // Set initial focused index to current value
      const current_index = options.findIndex((opt) => opt === value)
      set_focused_index(current_index >= 0 ? current_index : 0)
    }
  }, [open, anchor_el, options, value])

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
            prev < options.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          event.preventDefault()
          set_focused_index((prev) =>
            prev > 0 ? prev - 1 : options.length - 1
          )
          break
        case 'Enter':
          event.preventDefault()
          if (focused_index >= 0 && focused_index < options.length) {
            on_change(options[focused_index])
            on_close()
          }
          break
        default:
          break
      }
    },
    [open, options, focused_index, on_change, on_close]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handle_keydown)
      return () => document.removeEventListener('keydown', handle_keydown)
    }
  }, [open, handle_keydown])

  const handle_option_click = (option) => {
    on_change(option)
    on_close()
  }

  if (!open) return null

  const dropdown_content = (
    <div
      ref={dropdown_ref}
      className='inline-select-dropdown'
      style={{ top: position.top, left: position.left }}>
      {options.map((option, index) => {
        const is_selected = option === value
        const is_focused = index === focused_index
        const option_slug = option.toLowerCase().replace(/\s+/g, '_')

        const data_attr = color_attribute
          ? { [`data-${color_attribute}`]: option_slug }
          : {}

        return (
          <div
            key={option}
            className={`inline-select-option ${is_selected ? 'inline-select-option--selected' : ''} ${is_focused ? 'inline-select-option--focused' : ''}`}
            onClick={() => handle_option_click(option)}
            {...data_attr}>
            {option}
          </div>
        )
      })}
    </div>
  )

  return ReactDOM.createPortal(dropdown_content, document.body)
}

InlineSelectDropdown.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  value: PropTypes.string,
  on_change: PropTypes.func.isRequired,
  on_close: PropTypes.func.isRequired,
  anchor_el: PropTypes.instanceOf(Element),
  open: PropTypes.bool.isRequired,
  color_attribute: PropTypes.string
}

export default InlineSelectDropdown
