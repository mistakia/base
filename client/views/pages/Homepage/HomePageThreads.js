import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { Link } from 'react-router-dom'

import Thread from '@components/Thread/index.js'

const HomePageThreads = ({ threads, is_loading_threads, load_threads }) => {
  useEffect(() => {
    load_threads()
  }, [load_threads])

  const active_threads = threads.filter(thread => thread.thread_state === 'active')

  if (active_threads.size === 0) {
    return null
  }

  const displayed_threads = active_threads.take(3)

  return (
    <div className='threads-container'>
      <>
        <div className='threads-list'>
          {displayed_threads.map((thread) => (
            <Thread key={thread.id} thread={thread} />
          ))}
        </div>
        {active_threads.size > displayed_threads.size && (
          <Link to='/thread' className='all-threads-link'>
            view all threads
          </Link>
        )}
      </>
    </div>
  )
}

HomePageThreads.propTypes = {
  threads: ImmutablePropTypes.list.isRequired,
  is_loading_threads: PropTypes.bool.isRequired,
  load_threads: PropTypes.func.isRequired
}

export default HomePageThreads
