import React, { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'

import { COLORS } from '@theme/colors.js'

const display_style = {
  cursor: 'pointer',
  fontSize: '14px',
  color: COLORS.text,
  padding: '2px 4px',
  borderRadius: '3px',
  minHeight: '20px',
  lineHeight: '1.4',
  wordBreak: 'break-word'
}

const display_hover_style = {
  backgroundColor: COLORS.background_hover
}

const input_style = {
  fontSize: '14px',
  color: COLORS.text,
  padding: '2px 4px',
  border: `1px solid ${COLORS.border}`,
  borderRadius: '3px',
  outline: 'none',
  width: '100%',
  fontFamily: 'inherit',
  lineHeight: '1.4',
  boxSizing: 'border-box'
}

const textarea_style = {
  ...input_style,
  minHeight: '60px',
  resize: 'vertical'
}

const InlineTextInput = ({ value, on_change, type = 'string' }) => {
  const [is_editing, set_is_editing] = useState(false)
  const [local_value, set_local_value] = useState(value ?? '')
  const [is_hovered, set_is_hovered] = useState(false)
  const input_ref = useRef(null)

  useEffect(() => {
    set_local_value(value ?? '')
  }, [value])

  useEffect(() => {
    if (is_editing && input_ref.current) {
      input_ref.current.focus()
      input_ref.current.select()
    }
  }, [is_editing])

  const save = useCallback(() => {
    set_is_editing(false)
    const trimmed = local_value.toString().trim()

    if (type === 'number') {
      if (trimmed === '') {
        if (value !== null && value !== undefined && value !== '') {
          on_change(null)
        }
        return
      }
      const num = parseFloat(trimmed)
      if (isNaN(num)) {
        set_local_value(value ?? '')
        return
      }
      if (num !== value) {
        on_change(num)
      }
      return
    }

    if (trimmed !== (value ?? '').toString()) {
      on_change(trimmed || null)
    }
  }, [local_value, value, on_change, type])

  const handle_keydown = useCallback(
    (event) => {
      if (event.key === 'Enter' && type !== 'text') {
        event.preventDefault()
        save()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        set_local_value(value ?? '')
        set_is_editing(false)
      }
    },
    [save, value, type]
  )

  const handle_click = () => {
    set_is_editing(true)
  }

  const display_value =
    value !== null && value !== undefined && value !== ''
      ? String(value)
      : 'N/A'

  if (!is_editing) {
    return (
      <span
        style={{
          ...display_style,
          ...(is_hovered ? display_hover_style : {}),
          color:
            value === null || value === undefined || value === ''
              ? COLORS.text_secondary
              : COLORS.text
        }}
        onClick={handle_click}
        onMouseEnter={() => set_is_hovered(true)}
        onMouseLeave={() => set_is_hovered(false)}>
        {display_value}
      </span>
    )
  }

  if (type === 'text') {
    return (
      <textarea
        ref={input_ref}
        value={local_value}
        onChange={(e) => set_local_value(e.target.value)}
        onBlur={save}
        onKeyDown={handle_keydown}
        style={textarea_style}
      />
    )
  }

  return (
    <input
      ref={input_ref}
      type={type === 'number' ? 'number' : 'text'}
      value={local_value}
      onChange={(e) => set_local_value(e.target.value)}
      onBlur={save}
      onKeyDown={handle_keydown}
      style={input_style}
    />
  )
}

InlineTextInput.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  on_change: PropTypes.func.isRequired,
  type: PropTypes.oneOf(['string', 'number', 'text', 'date'])
}

export default InlineTextInput
