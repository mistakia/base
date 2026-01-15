import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'

import './ThinkingMessage.styl'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import { process_message_content } from './utils/message-processing.js'

const ThinkingMessage = ({ message, working_directory = null }) => {
  const [is_expanded, set_is_expanded] = useState(false)
  const on_toggle = useCallback(() => set_is_expanded((v) => !v), [])

  const { content } = process_message_content({
    content: message.content,
    working_directory
  })

  return (
    <div className='thinking-message'>
      <button className='thinking-message__toggle' onClick={on_toggle}>
        {is_expanded ? 'hide thinking' : 'show thinking'} &gt;
      </button>
      {is_expanded && (
        <div className='thinking-message__content'>
          <div style={{ whiteSpace: 'normal', wordBreak: 'normal' }}>
            <MarkdownViewer content={content} />
          </div>
        </div>
      )}
    </div>
  )
}

ThinkingMessage.propTypes = {
  message: PropTypes.object.isRequired,
  working_directory: PropTypes.string
}

export default ThinkingMessage
