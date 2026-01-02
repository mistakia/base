import React from 'react'
import { useNavigate } from 'react-router-dom'
import { COLORS } from '@theme/colors.js'

import DirectoryView from '@components/DirectoryView/index.js'
import FileView from '@components/FileView/index.js'
import PathBreadcrumb from '@components/PathBreadcrumb/index.js'
import { use_file_system_data } from '@views/hooks/useFileSystemData.js'

const FileSystemBrowser = () => {
  const navigate = useNavigate()
  const { current_path, is_directory, loading, error } = use_file_system_data({
    use_router_path: true
  })

  const handle_navigate = (path) => {
    navigate(path || '/')
  }

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <span>Loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <span style={{ color: COLORS.error }}>Error: {error}</span>
      </div>
    )
  }

  return (
    <div
      className='filesystem-browser-container'
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: '100%',
        width: '100%'
      }}>
      <PathBreadcrumb path={current_path} on_navigate={handle_navigate} />
      {is_directory ? (
        <DirectoryView path={current_path} on_navigate={handle_navigate} />
      ) : (
        <FileView path={current_path} />
      )}
    </div>
  )
}

export default FileSystemBrowser
