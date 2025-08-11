import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'

import './AssistantMessage.styl'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'

const AssistantMessage = ({
  message,
  disable_truncation,
  is_last_assistant_message
}) => {
  const [is_assistant_message_expanded, set_is_assistant_message_expanded] =
    useState(false)
  const on_toggle = useCallback(
    () => set_is_assistant_message_expanded((v) => !v),
    []
  )
  let content = message.content || ''

  // Handle string content
  if (typeof content !== 'string') {
    content = JSON.stringify(content, null, 2)
  }

  const should_truncate = !disable_truncation && content.length > 200
  const display_content =
    should_truncate && !is_assistant_message_expanded
      ? content.substring(0, 200) + '...'
      : content

  // Check for "stop_reasoning" in content
  const is_stop_reasoning = content.includes('stop_reasoning')

  const container_class = `assistant-message${should_truncate ? ' assistant-message--clickable' : ''}${is_last_assistant_message ? ' assistant-message--latest' : ''}`

  return (
    <div
      className={container_class}
      onClick={should_truncate ? on_toggle : undefined}>
      <div
        className={`assistant-message__content${is_stop_reasoning ? ' assistant-message__content--reasoning' : ''}`}>
        <div style={{ whiteSpace: 'normal', wordBreak: 'normal' }}>
          <MarkdownViewer content={display_content} />
        </div>
      </div>
    </div>
  )
}

AssistantMessage.propTypes = {
  message: PropTypes.object.isRequired,
  disable_truncation: PropTypes.bool,
  is_last_assistant_message: PropTypes.bool
}

export default AssistantMessage
