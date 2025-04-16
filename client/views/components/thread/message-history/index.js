import React from 'react'
import PropTypes from 'prop-types'

const MessageHistory = ({ messages }) => {
  return (
    <div className='message-history'>
      {messages.map((message, index) => (
        <div key={index} className='message'>
          <span className='role'>{message.role}:</span> {message.content}
        </div>
      ))}
    </div>
  )
}

MessageHistory.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      role: PropTypes.string.isRequired,
      content: PropTypes.string.isRequired
    })
  ).isRequired
}

export default MessageHistory
