import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useDispatch, useSelector } from 'react-redux'
import { directory_actions, get_directory_state } from '@core/directory'
import {
  get_file_type_from_path,
  detect_shell_script_from_content
} from '@views/utils/language-utils.js'

import EntityRenderer from '@components/EntityRenderer/index.js'
import CodeViewer from '@components/primitives/CodeViewer.js'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import { RedactedContent } from '@components/primitives/styled'
import CursorButton from '@components/CursorButton/index.js'

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

    const file_type = get_file_type_from_path(path)

    // If file type is unknown (no extension), check content for shell scripts
    if (file_type === 'unknown' && file_data?.content) {
      const detected_language = detect_shell_script_from_content(
        file_data.content
      )
      if (detected_language) {
        return 'code'
      }
    }

    return file_type
  }

  const render_content = () => {
    const file_type = get_file_type()

    switch (file_type) {
      case 'entity':
        return (
          <EntityRenderer
            frontmatter={file_data.frontmatter}
            markdown={file_data.markdown}
            is_redacted={file_data?.is_redacted}
            path={path}
          />
        )

      case 'markdown':
        return (
          <MarkdownViewer
            content={file_data?.content || ''}
            is_redacted={file_data?.is_redacted}
          />
        )

      case 'code': {
        // Try to detect language from content first (for files without extensions)
        let language = detect_shell_script_from_content(file_data?.content)

        // If not detected from content, get from file extension
        if (!language) {
          const last_segment = path.split('/').pop()
          const parts = last_segment.split('.')
          language = parts.length > 1 ? parts.pop().toLowerCase() : 'text'
        }

        return (
          <CodeViewer
            code={file_data?.content || ''}
            language={language}
            is_redacted={file_data?.is_redacted}
          />
        )
      }

      default:
        // For other file types, use RedactedContent component if redacted
        if (file_data?.is_redacted) {
          return (
            <Box sx={{ p: 3 }}>
              <RedactedContent
                content_type='content'
                original_length={file_data?.content?.length || 500}
                show_tooltip={true}
                sx={{
                  minHeight: '200px',
                  width: '100%',
                  display: 'block'
                }}
              />
            </Box>
          )
        }

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
        <div style={{ color: '#f44336' }}>{error}</div>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', position: 'relative' }}>
      <CursorButton path={path} />
      {render_content()}
    </Box>
  )
}

FileView.propTypes = {
  path: PropTypes.string.isRequired
}

export default FileView
