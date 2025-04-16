import React, { useState } from 'react'
import PropTypes from 'prop-types'
import SendIcon from '@mui/icons-material/Send'

import './message-input.styl'

export default function MessageInput({
  onSendMessage,
  disabled,
  placeholder,
  loading
}) {
  const [message, setMessage] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (message.trim() && !disabled && !loading) {
      onSendMessage(message)
      setMessage('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e)
    }
  }

  return (
    <div className='message-input-container'>
      <form onSubmit={handleSubmit}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Type a message...'}
          disabled={disabled || loading}
          rows={1}
        />
        <button type='submit' disabled={!message.trim() || disabled || loading}>
          <SendIcon />
        </button>
      </form>
      {disabled && (
        <div className='input-info'>This thread has been terminated</div>
      )}
    </div>
  )
}

MessageInput.propTypes = {
  onSendMessage: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  placeholder: PropTypes.string,
  loading: PropTypes.bool
}

MessageInput.defaultProps = {
  disabled: false,
  loading: false
}
