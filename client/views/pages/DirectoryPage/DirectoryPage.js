import React from 'react'
import PropTypes from 'prop-types'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'

const DirectoryPage = ({ directory_markdown }) => {
  return (
    <PageLayout>
      {directory_markdown && (
        <div className='directory-markdown-container'>
          <MarkdownViewer content={directory_markdown} />
        </div>
      )}
      <FileSystemBrowser />
    </PageLayout>
  )
}

DirectoryPage.propTypes = {
  directory_markdown: PropTypes.string
}

export default DirectoryPage
