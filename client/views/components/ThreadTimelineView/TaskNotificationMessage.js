import React, { useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'

import './TaskNotificationMessage.styl'

// Pre-compiled regex patterns for field extraction
const FIELD_PATTERNS = {
  'task-id': /<task-id>([\s\S]*?)<\/task-id>/,
  status: /<status>([\s\S]*?)<\/status>/,
  summary: /<summary>([\s\S]*?)<\/summary>/,
  'output-file': /<output-file>([\s\S]*?)<\/output-file>/
}
const TRAILING_CONTENT_PATTERN = /<\/task-notification>([\s\S]*)/

/**
 * Parse task notification fields from XML content.
 * Extracts task-id, status, summary, and output-file from <task-notification> blocks.
 */
const parse_task_notification = (content) => {
  const str = typeof content === 'string' ? content : ''

  const get_field = (field_name) => {
    const pattern = FIELD_PATTERNS[field_name]
    if (!pattern) return null
    const match = str.match(pattern)
    return match ? match[1].trim() : null
  }

  const task_id = get_field('task-id')
  const status = get_field('status')
  const summary = get_field('summary')
  const output_file = get_field('output-file')

  // Trailing content after the closing </task-notification> tag
  const after_match = str.match(TRAILING_CONTENT_PATTERN)
  const trailing_content = after_match ? after_match[1].trim() : ''

  return { task_id, status, summary, output_file, trailing_content }
}

const TaskNotificationMessage = ({ message }) => {
  const [is_expanded, set_is_expanded] = useState(false)

  const content =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content || '')

  const { task_id, status, summary, output_file, trailing_content } = useMemo(
    () => parse_task_notification(content),
    [content]
  )

  const is_failed = status === 'failed' || status === 'error'
  const status_class = is_failed ? 'failed' : 'completed'

  const on_click = useCallback(() => {
    set_is_expanded((v) => !v)
  }, [])

  const has_details = output_file || trailing_content

  if (!summary && !task_id && !has_details) {
    return null
  }

  return (
    <div
      className={`task-notification task-notification--${status_class}${has_details ? ' task-notification--clickable' : ''}`}
      onClick={has_details ? on_click : undefined}>
      <span
        className={`task-notification__dot task-notification__dot--${status_class}`}
      />
      <span className='task-notification__summary'>
        {summary || 'Task notification'}
      </span>
      {task_id && <span className='task-notification__id'>{task_id}</span>}
      {is_expanded && has_details && (
        <div className='task-notification__details'>
          {output_file && (
            <span className='task-notification__path'>{output_file}</span>
          )}
          {trailing_content && (
            <span className='task-notification__trailing'>
              {trailing_content}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

TaskNotificationMessage.propTypes = {
  message: PropTypes.shape({
    content: PropTypes.oneOfType([PropTypes.string, PropTypes.object])
      .isRequired
  }).isRequired
}

export { parse_task_notification }
export default TaskNotificationMessage
