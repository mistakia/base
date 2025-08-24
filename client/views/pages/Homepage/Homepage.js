import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import DirectoryMarkdown from '@views/components/DirectoryMarkdown/index.js'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout'
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
      <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <TwoColumnLayout
          left_content={
            <DirectoryMarkdown
              directory_markdown={directory_markdown}
              is_loading_directory_markdown={is_loading_directory_markdown}
              directory_markdown_error={directory_markdown_error}
            />
          }
          right_content={
            <div className='homepage-right-column'>
              <HomePageThreads
                threads={threads}
                is_loading_threads={is_loading_threads}
                load_threads={load_threads}
              />
              <HomePageTasks
                tasks={tasks}
                is_loading_tasks={is_loading_tasks}
                load_tasks={load_tasks}
              />
              <FileSystemBrowser />
            </div>
          }
          left_column_width={6}
          right_column_width={6}
          container_padding={0}
          sticky_left={true}
          sticky_right={false}
        />
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
