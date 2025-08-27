import React, { useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'

import './SystemMessage.styl'
import { ansi_to_html } from '@views/utils/ansi-to-html.js'

const SystemMessage = ({ message }) => {
  const [is_expanded, set_is_expanded] = useState(false)

  const on_toggle = useCallback(() => {
    set_is_expanded((v) => !v)
  }, [])

  let content = message.content || ''
  if (typeof content !== 'string') {
    content = JSON.stringify(content, null, 2)
  }

  const system_type = message.system_type || 'unknown'
  const level = message.metadata?.level || 'info'

  const should_truncate = content.length > 80
  const display_content = useMemo(() => {
    const text_to_render =
      should_truncate && !is_expanded
        ? content.substring(0, 80) + '...'
        : content

    return ansi_to_html(text_to_render)
  }, [content, should_truncate, is_expanded])

  const container_class = `system-message system-message--${system_type} system-message--${level}${
    should_truncate ? ' system-message--clickable' : ''
  }`

  const render_ansi_content = () => {
    return display_content.map((element, index) => {
      if (typeof element === 'string') {
        return element
      } else if (element && element.type === 'span') {
        return (
          <span key={element.key || index} style={element.props.style}>
            {element.props.children}
          </span>
        )
      }
      return null
    })
  }

  return (
    <div
      className={container_class}
      onClick={should_truncate ? on_toggle : undefined}>
      <div
        className={`system-message__content${should_truncate ? ' system-message__content--truncated' : ''}`}>
        <div className='system-message__text'>{render_ansi_content()}</div>
      </div>
    </div>
  )
}

SystemMessage.propTypes = {
  message: PropTypes.shape({
    content: PropTypes.oneOfType([PropTypes.string, PropTypes.object])
      .isRequired,
    system_type: PropTypes.string,
    metadata: PropTypes.shape({
      level: PropTypes.string
    })
  }).isRequired
}

export default SystemMessage
