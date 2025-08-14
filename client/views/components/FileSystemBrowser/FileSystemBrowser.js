import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Box } from '@mui/material'

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
      <Box sx={{ p: 3 }}>
        <span>Loading...</span>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <span style={{ color: '#f44336' }}>Error: {error}</span>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: '1100px',
        margin: '0 auto'
      }}>
      <PathBreadcrumb path={current_path} on_navigate={handle_navigate} />
      {is_directory ? (
        <DirectoryView path={current_path} on_navigate={handle_navigate} />
      ) : (
        <FileView path={current_path} />
      )}
    </Box>
  )
}

export default FileSystemBrowser
