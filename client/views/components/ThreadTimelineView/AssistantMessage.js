import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'

import './AssistantMessage.styl'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import { process_message_content } from './utils/message-processing.js'

const AssistantMessage = ({
  message,
  working_directory = null,
  disable_truncation
}) => {
  const [is_assistant_message_expanded, set_is_assistant_message_expanded] =
    useState(false)
  const on_toggle = useCallback(
    () => set_is_assistant_message_expanded((v) => !v),
    []
  )
  const { content } = process_message_content({
    content: message.content,
    working_directory
  })

  const should_truncate = !disable_truncation && content.length > 200
  const display_content =
    should_truncate && !is_assistant_message_expanded
      ? content.substring(0, 200) + '...'
      : content

  // Check for "stop_reasoning" in content
  const is_stop_reasoning = content.includes('stop_reasoning')

  const container_class = `assistant-message${should_truncate ? ' assistant-message--clickable' : ''}`

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
  working_directory: PropTypes.string,
  disable_truncation: PropTypes.bool
}

export default AssistantMessage
