import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import HomePageThreads from './HomePageThreads.js'

import './Homepage.styl'

const Homepage = ({ threads, is_loading_threads, load_threads }) => {
  return (
    <PageLayout>
      <div className='homepage-section'>
        <HomePageThreads
          threads={threads}
          is_loading_threads={is_loading_threads}
          load_threads={load_threads}
        />
      </div>

      <div className='homepage-section'>
        <FileSystemBrowser />
      </div>
    </PageLayout>
  )
}

Homepage.propTypes = {
  threads: ImmutablePropTypes.list.isRequired,
  is_loading_threads: PropTypes.bool.isRequired,
  load_threads: PropTypes.func.isRequired
}

export default Homepage
