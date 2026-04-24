import React from 'react'
import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import { useLocation } from 'react-router-dom'

import { get_directory_state } from '@core/directory'
import CommitsPage from '@pages/CommitsPage/index.js'
import FileHistoryPage from '@pages/FileHistoryPage/FileHistoryPage.js'

import DirectoryPage from './DirectoryPage.js'

const map_state_to_props = createSelector(
  [get_directory_state],
  (directory_state) => {
    const path_info = directory_state.get('path_info')
    const is_directory = path_info?.type === 'directory'

    return {
      directory_markdown:
        directory_state.get('directory_markdown_file')?.content || null,
      is_loading_directory_markdown: directory_state.get(
        'is_loading_directory_markdown'
      ),
      directory_markdown_error: directory_state.get('directory_markdown_error'),
      is_directory
    }
  }
)

const ConnectedDirectoryPage = connect(map_state_to_props)(DirectoryPage)

const DirectoryPageRouter = () => {
  const location = useLocation()
  const pathname = location.pathname

  if (pathname.startsWith('/git-history/')) {
    const encoded = pathname.slice('/git-history/'.length)
    let decoded = encoded
    try {
      decoded = decodeURIComponent(encoded)
    } catch {
      decoded = encoded
    }
    return <FileHistoryPage base_uri={decoded} />
  }

  if (pathname.endsWith('/commits') || pathname === '/commits') {
    const repo_path = pathname.replace(/^\//, '').replace(/\/?commits$/, '')
    return <CommitsPage repo_path={repo_path} />
  }

  return <ConnectedDirectoryPage />
}

export default DirectoryPageRouter
