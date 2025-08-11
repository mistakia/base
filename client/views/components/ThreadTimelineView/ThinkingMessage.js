import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'

import './ThinkingMessage.styl'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'

const ThinkingMessage = ({ message }) => {
  const [is_thinking_expanded, set_is_thinking_expanded] = useState(false)
  const on_toggle = useCallback(() => set_is_thinking_expanded((v) => !v), [])

  let content = message.content || ''

  if (typeof content !== 'string') {
    content = JSON.stringify(content, null, 2)
  }

  const should_truncate = content.length > 200
  const display_content =
    should_truncate && !is_thinking_expanded
      ? content.substring(0, 200) + '...'
      : content

  const container_class = `thinking-message${should_truncate ? ' thinking-message--clickable' : ''}`

  return (
    <div
      className={container_class}
      onClick={should_truncate ? on_toggle : undefined}>
      <div className='thinking-message__title'>thinking...</div>
      <div className='thinking-message__content'>
        <div style={{ whiteSpace: 'normal', wordBreak: 'normal' }}>
          <MarkdownViewer content={display_content} />
        </div>
      </div>
    </div>
  )
}

ThinkingMessage.propTypes = {
  message: PropTypes.object.isRequired
}

export default ThinkingMessage
