import React, { useEffect } from 'react'
import PropTypes from 'prop-types'

import ThreadList from '@components/thread/thread-list'

import './threads-page.styl'

const ThreadsListPage = ({ load_threads }) => {
  useEffect(() => {
    load_threads()
  }, [load_threads])

  return (
    <div className='page-container'>
      <div className='header'>
        <h1 className='title'>Threads</h1>
      </div>
      <div className='content-container'>
        <div className='list-container'>
          <ThreadList />
        </div>
      </div>
    </div>
  )
}

ThreadsListPage.propTypes = {
  load_threads: PropTypes.func.isRequired
}

export default ThreadsListPage
