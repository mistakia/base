import React from 'react'

import ThreadForm from '@components/thread/thread-form'

import './new-thread-page.styl'

const NewThreadPage = () => {
  return (
    <div className='page-container'>
      <div className='header'>
        <h1 className='title'>New Thread</h1>
      </div>
      <div className='content-container'>
        <div className='form-container'>
          <ThreadForm onCancel={() => window.history.back()} />
        </div>
      </div>
    </div>
  )
}

export default NewThreadPage
