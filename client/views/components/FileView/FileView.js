import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useDispatch, useSelector } from 'react-redux'
import { directory_actions, get_directory_state } from '@core/directory'
import { get_file_type_from_path } from '@views/utils/language-utils.js'

import EntityRenderer from '@components/EntityRenderer/index.js'
import CodeViewer from '@components/primitives/CodeViewer.js'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'

const FileView = ({ path }) => {
  const dispatch = useDispatch()
  const directory_state = useSelector(get_directory_state)
  const file_data = directory_state.get('file_data')
  const loading = directory_state.get('is_loading_file')
  const error = directory_state.get('file_error')

  useEffect(() => {
    dispatch(directory_actions.load_file(path))
  }, [path])

  const get_file_type = () => {
    if (!path) return 'unknown'

    if (file_data?.frontmatter && file_data?.frontmatter?.type) {
      return 'entity'
    }

    return get_file_type_from_path(path)
  }

  const render_content = () => {
    const file_type = get_file_type()

    switch (file_type) {
      case 'entity':
        return (
          <EntityRenderer
            frontmatter={file_data.frontmatter}
            markdown={file_data.markdown}
            path={path}
          />
        )

      case 'markdown':
        return <MarkdownViewer content={file_data?.content || ''} />

      case 'code': {
        const language = path.split('.').pop().toLowerCase()
        return (
          <CodeViewer code={file_data?.content || ''} language={language} />
        )
      }

      default:
        return (
          <div style={{ padding: '24px', margin: '16px' }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {file_data?.content || ''}
            </pre>
          </div>
        )
    }
  }

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <div>Loading file content...</div>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <div style={{ color: '#f44336' }}>Error: {error}</div>
      </Box>
    )
  }

  return <Box sx={{ height: '100%' }}>{render_content()}</Box>
}

FileView.propTypes = {
  path: PropTypes.string.isRequired
}

export default FileView
