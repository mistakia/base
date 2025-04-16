import React from 'react'
import { format } from 'date-fns'
import PropTypes from 'prop-types'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import 'highlight.js/styles/github-dark.css'

import './message-bubble.styl'

// Initialize markdown-it with highlight.js
const md = new MarkdownIt().use(markdownItHighlightjs, {
  hljs,
  auto: true,
  code: true,
  inline: true,
  ignoreIllegals: true
})

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

  const rendered_content = md.render(content)

  return (
    <div className={`bubble-container ${role}`}>
      <div
        className={`message-content ${role}`}
        dangerouslySetInnerHTML={{ __html: rendered_content }}
      />
      <div className={`message-metadata ${role}`}>{format_date(timestamp)}</div>
    </div>
  )
}

MessageBubble.propTypes = {
  message: PropTypes.object
}

export default MessageBubble
