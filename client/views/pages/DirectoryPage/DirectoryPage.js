import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'
import { useLocation } from 'react-router-dom'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import DirectoryMarkdown from '@views/components/DirectoryMarkdown/index.js'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout'

const DirectoryPage = ({
  directory_markdown,
  is_directory,
  is_loading_directory_markdown,
  directory_markdown_error
}) => {
  const dispatch = useDispatch()
  const location = useLocation()

  // Extract path from location
  const path = location.pathname === '/' ? '' : location.pathname

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
    )
  }

  // Otherwise just show the file browser
  return (
    <PageLayout>
      <FileSystemBrowser />
    </PageLayout>
  )
}

DirectoryPage.propTypes = {
  directory_markdown: PropTypes.string,
  is_directory: PropTypes.bool,
  is_loading_directory_markdown: PropTypes.bool,
  directory_markdown_error: PropTypes.string
}

export default DirectoryPage
