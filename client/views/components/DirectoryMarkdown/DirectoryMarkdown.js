import React from 'react'
import PropTypes from 'prop-types'

import MarkdownViewer from '@components/primitives/MarkdownViewer.js'

import './DirectoryMarkdown.styl'

const DirectoryMarkdown = ({
  directory_markdown,
  is_loading_directory_markdown,
  directory_markdown_error,
  show_when_no_content = false
}) => {
  // Only show the container if there's actual content to display or explicitly requested
  const has_directory_content =
    directory_markdown ||
    is_loading_directory_markdown ||
    directory_markdown_error

  if (!show_when_no_content && !has_directory_content) {
    return null
  }

  return (
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
  )
}

DirectoryMarkdown.propTypes = {
  directory_markdown: PropTypes.string,
  is_loading_directory_markdown: PropTypes.bool,
  directory_markdown_error: PropTypes.string,
  show_when_no_content: PropTypes.bool
}

export default DirectoryMarkdown
