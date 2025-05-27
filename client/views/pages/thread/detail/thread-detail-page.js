import React from 'react'
import { useParams } from 'react-router-dom'

import ThreadChat from '@components/thread/thread-chat'
import '@styles/layout.styl'

import './thread-detail-page.styl'

const ThreadDetailPage = () => {
  const { thread_id } = useParams()

  return (
    <div className='page-container'>
      <div className='header'>
        <h1 className='title'>Thread</h1>
      </div>
      <div className='content-container'>
        <div className='chat-container'>
          <ThreadChat thread_id={thread_id} />
        </div>
      </div>
    </div>
  )
}

export default ThreadDetailPage
