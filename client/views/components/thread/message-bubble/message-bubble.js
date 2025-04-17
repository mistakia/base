import React from 'react'
import { format } from 'date-fns'
import PropTypes from 'prop-types'
import MarkdownContent from '@components/markdown-content'
import 'highlight.js/styles/github-dark.css'

import './message-bubble.styl'

// Format the timestamp
const format_date = (timestamp) => {
  if (!timestamp) return ''
  return format(new Date(timestamp), 'MMM d, h:mm a')
}

const MessageBubble = ({ message }) => {
  if (!message) return null

  const role = message.get('role')
  const content = message.get('content', '')
  const timestamp = message.get('timestamp')

  return (
    <div className={`bubble-container ${role}`}>
      <div className={`message-content ${role}`}>
        <MarkdownContent content={content} />
      </div>
      <div className={`message-metadata ${role}`}>{format_date(timestamp)}</div>
    </div>
  )
}

MessageBubble.propTypes = {
  message: PropTypes.object
}

export default MessageBubble
