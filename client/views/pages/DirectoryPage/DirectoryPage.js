import React from 'react'
import PropTypes from 'prop-types'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'

const DirectoryPage = ({
  directory_markdown,
  is_directory,
  is_loading_directory_markdown,
  directory_markdown_error
}) => {
  // Only show the container if there's actual content to display
  const has_directory_content =
    directory_markdown ||
    is_loading_directory_markdown ||
    directory_markdown_error

  return (
    <PageLayout>
      {is_directory && has_directory_content && (
        <div className='directory-markdown-container'>
          {is_loading_directory_markdown && (
            <div className='directory-markdown-loading'>
              Loading directory information...
            </div>
          )}
          {directory_markdown_error && (
            <div className='directory-markdown-error'>
              Error loading directory information: {directory_markdown_error}
            </div>
          )}
          {directory_markdown &&
            !is_loading_directory_markdown &&
            !directory_markdown_error && (
              <MarkdownViewer content={directory_markdown} />
            )}
        </div>
      )}
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
