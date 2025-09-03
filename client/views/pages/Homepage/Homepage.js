import React from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import DirectoryMarkdown from '@views/components/DirectoryMarkdown/index.js'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout'
import HomePageThreads from './HomePageThreads.js'
import HomePageTasks from './HomePageTasks.js'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'

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
  const page_meta = use_page_meta()

  return (
    <>
      <PageHead
        title={page_meta.title}
        description={page_meta.description}
        tags={page_meta.tags}
        url={page_meta.url}
        image={page_meta.image}
        type={page_meta.type}
        site_name={page_meta.site_name}
        author={page_meta.author}
        published_time={page_meta.published_time}
        modified_time={page_meta.modified_time}
      />
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
    </>
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
