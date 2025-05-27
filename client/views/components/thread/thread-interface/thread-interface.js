import React from 'react'
import PropTypes from 'prop-types'

import MessageHistory from '@components/thread/message-history'
import MessageInput from '@components/thread/message-input'

export default function ThreadInterface({ messages, add_message }) {
  return (
    <div className='thread-interface'>
      <MessageHistory messages={messages} />
      <MessageInput onSend={add_message} />
    </div>
  )
}

ThreadInterface.propTypes = {
  messages: PropTypes.array.isRequired,
  add_message: PropTypes.func.isRequired
}
