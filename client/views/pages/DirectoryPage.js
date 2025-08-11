import React from 'react'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'

const DirectoryPage = () => {
  return (
    <PageLayout>
      <FileSystemBrowser />
    </PageLayout>
  )
}

export default DirectoryPage
