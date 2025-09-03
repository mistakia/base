import React, { useState, useMemo, useCallback } from 'react'
import PropTypes from 'prop-types'

import '@styles/chip.styl'
import './UserMessage.styl'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import {
  clean_trailing_backslashes,
  process_message_content
} from './utils/message-processing.js'

const parse_command_from_content = ({ content_string }) => {
  if (!content_string) return null

  let input = content_string
  if (typeof input !== 'string') {
    try {
      if (Array.isArray(input)) {
        const parts = input.map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            if (typeof item.text === 'string') return item.text
            if (typeof item.content === 'string') return item.content
          }
          return ''
        })
        input = parts.join('\n')
      } else if (typeof input === 'object') {
        input = input.text || input.content || JSON.stringify(input)
      } else {
        input = String(input)
      }
    } catch (e) {
      input = String(content_string)
    }
  }

  // Clean up trailing backslashes before processing
  input = clean_trailing_backslashes({ content_string: input })

  // Handle HTML-escaped tags, if present
  input = input
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')

  const extract_between = ({ start_tag, end_tag }) => {
    const pattern = `${start_tag}([\\s\\S]*?)${end_tag}`
    const regex = new RegExp(pattern, 'i')
    const match = input.match(regex)
    return match ? match[1].trim() : null
  }

  const command_name = extract_between({
    start_tag: '<command-name>',
    end_tag: '</command-name>'
  })
  const command_args = extract_between({
    start_tag: '<command-args>',
    end_tag: '</command-args>'
  })
  const command_message = extract_between({
    start_tag: '<command-message>',
    end_tag: '</command-message>'
  })

  if (command_name || command_args || command_message) {
    return { command_name, command_args, command_message }
  }

  return null
}

const UserMessage = ({ message, working_directory = null }) => {
  const [is_user_message_expanded, set_is_user_message_expanded] =
    useState(false)
  const on_toggle = useCallback(
    () => set_is_user_message_expanded((v) => !v),
    []
  )

  const { content: content_processed } = process_message_content({
    content: message.content,
    working_directory
  })
  const content = content_processed

  const command_data = useMemo(
    () => parse_command_from_content({ content_string: content }),
    [content]
  )
  const is_command = !!(
    command_data &&
    (command_data.command_name ||
      command_data.command_args ||
      command_data.command_message)
  )
  const should_truncate = !is_command && content.length > 400
  const display_content =
    should_truncate && !is_user_message_expanded
      ? content.substring(0, 400) + '...'
      : content

  return (
    <div
      className={`user-message${should_truncate ? ' user-message--clickable' : ''}`}
      onClick={should_truncate ? on_toggle : undefined}>
      <span className='chip user-message__chip'>user</span>
      <div
        className={`user-message__content${should_truncate ? ' user-message__content--truncated' : ''}`}>
        {is_command ? (
          <div>
            <div className='user-message__command'>
              <span className='user-message__command-prompt'>&gt;</span>
              <span className='user-message__command-name'>
                {command_data.command_name}
              </span>
              {command_data.command_args ? (
                <span className='user-message__command-args'>
                  {' '}
                  {command_data.command_args}
                </span>
              ) : null}
            </div>
            {command_data.command_message ? (
              <div className='user-message__command-message'>
                <span className='user-message__command-prefix'>⎿</span>
                <span className='user-message__command-message-text'>
                  {command_data.command_message}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ whiteSpace: 'normal', wordBreak: 'normal' }}>
            <MarkdownViewer content={display_content} />
          </div>
        )}
      </div>
      {should_truncate && (
        <span className='user-message__toggle'>
          {is_user_message_expanded ? 'Show less' : 'Show more'}
        </span>
      )}
    </div>
  )
}

UserMessage.propTypes = {
  message: PropTypes.object.isRequired,
  working_directory: PropTypes.string
}

export default UserMessage
