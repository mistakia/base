import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PropTypes from 'prop-types'

import ThreadList from '@components/thread/thread-list'

import './threads-list-page.styl'

const ThreadsListPage = ({ load_threads }) => {
  useEffect(() => {
    load_threads()
  }, [load_threads])

  return (
    <div className='page-container'>
      <div className='header'>
        <h1 className='title'>Threads</h1>
        <Link to='/threads/new' className='new-button'>
          New Thread
          <svg
            width='16'
            height='16'
            viewBox='0 0 16 16'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'>
            <path
              d='M8 3.5V12.5M12.5 8H3.5'
              stroke='currentColor'
              strokeWidth='1.5'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
        </Link>
      </div>

      <div className='list-container'>
        <ThreadList />
      </div>
    </div>
  )
}

ThreadsListPage.propTypes = {
  load_threads: PropTypes.func.isRequired
}

export default ThreadsListPage
