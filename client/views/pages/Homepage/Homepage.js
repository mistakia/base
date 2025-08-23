import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import DirectoryMarkdown from '@views/components/DirectoryMarkdown/index.js'
import HomePageThreads from './HomePageThreads.js'
import HomePageTasks from './HomePageTasks.js'

import '@styles/tasks.styl'
import './Homepage.styl'

const Homepage = ({
  threads,
  is_loading_threads,
  load_threads,
  tasks,
  is_loading_tasks,
  load_tasks,
  directory_markdown,
  is_loading_directory_markdown,
  directory_markdown_error
}) => {
  return (
    <PageLayout>
      <DirectoryMarkdown
        directory_markdown={directory_markdown}
        is_loading_directory_markdown={is_loading_directory_markdown}
        directory_markdown_error={directory_markdown_error}
      />

      <div className='homepage-section'>
        <HomePageThreads
          threads={threads}
          is_loading_threads={is_loading_threads}
          load_threads={load_threads}
        />
      </div>

      <div className='homepage-section'>
        <HomePageTasks
          tasks={tasks}
          is_loading_tasks={is_loading_tasks}
          load_tasks={load_tasks}
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
  load_threads: PropTypes.func.isRequired,
  tasks: ImmutablePropTypes.list.isRequired,
  is_loading_tasks: PropTypes.bool.isRequired,
  load_tasks: PropTypes.func.isRequired,
  directory_markdown: PropTypes.string,
  is_loading_directory_markdown: PropTypes.bool,
  directory_markdown_error: PropTypes.string
}

export default Homepage
