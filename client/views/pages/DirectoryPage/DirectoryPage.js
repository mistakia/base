import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'
import { useLocation } from 'react-router-dom'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import DirectoryMarkdown from '@views/components/DirectoryMarkdown/index.js'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'

const DirectoryPage = ({
  directory_markdown,
  is_directory,
  is_loading_directory_markdown,
  directory_markdown_error,
  entity_data
}) => {
  const dispatch = useDispatch()
  const location = useLocation()

  // Extract path from location
  const path = location.pathname === '/' ? '' : location.pathname
  const page_meta = use_page_meta({
    entity_data,
    custom_title: is_directory ? undefined : null,
    custom_description: is_directory ? undefined : null
  })

  // Load directory markdown when we're viewing a directory
  useEffect(() => {
    if (is_directory) {
      // dispatch(directory_actions.load_directory_markdown(path))
    }
  }, [is_directory, path, dispatch])

  // Check if we have markdown content to display
  const has_markdown_content = is_directory && directory_markdown

  // If we have markdown content, use two column layout
  if (has_markdown_content) {
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
              right_content={<FileSystemBrowser />}
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

  // Otherwise just show the file browser
  // Use different max-widths: 1200 for directories, 1400 for files
  const content_max_width = is_directory ? 1200 : 1400

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
        <div
          style={{
            maxWidth: content_max_width,
            margin: '0 auto',
            width: '100%'
          }}>
          <FileSystemBrowser />
        </div>
      </PageLayout>
    </>
  )
}

DirectoryPage.propTypes = {
  directory_markdown: PropTypes.string,
  is_directory: PropTypes.bool,
  is_loading_directory_markdown: PropTypes.bool,
  directory_markdown_error: PropTypes.string,
  entity_data: PropTypes.object
}

export default DirectoryPage
