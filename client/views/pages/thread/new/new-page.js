import React from 'react'
import { Link } from 'react-router-dom'

import ThreadForm from '@components/thread/thread-form'

import './new-page.styl'

const NewThreadPage = () => {
  return (
    <div className='page-container'>
      <div className='header'>
        <Link to='/threads' className='back-button'>
          <svg
            width='16'
            height='16'
            viewBox='0 0 16 16'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'>
            <path
              d='M10.5 12.5L5.5 8L10.5 3.5'
              stroke='currentColor'
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          Back to threads
        </Link>
        <h1 className='title'>New Thread</h1>
      </div>

      <div className='form-container'>
        <ThreadForm onCancel={() => window.history.back()} />
      </div>
    </div>
  )
}

export default NewThreadPage
