import React from 'react'
import PropTypes from 'prop-types'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import DirectoryMarkdown from '@views/components/DirectoryMarkdown/index.js'

const DirectoryPage = ({
  directory_markdown,
  is_directory,
  is_loading_directory_markdown,
  directory_markdown_error
}) => {
  return (
    <PageLayout>
      {is_directory && (
        <DirectoryMarkdown
          directory_markdown={directory_markdown}
          is_loading_directory_markdown={is_loading_directory_markdown}
          directory_markdown_error={directory_markdown_error}
        />
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
