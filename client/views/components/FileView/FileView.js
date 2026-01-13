import React, { useEffect, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useDispatch, useSelector } from 'react-redux'
import { directory_actions, get_directory_state } from '@core/directory'
import { git_actions } from '@core/git/actions'
import {
  get_file_at_ref,
  get_is_loading_file_at_ref,
  get_git_error
} from '@core/git/selectors'
import {
  get_file_type_from_path,
  detect_shell_script_from_content
} from '@views/utils/language-utils.js'
import { COLORS } from '@theme/colors.js'

import EntityRenderer from '@components/EntityRenderer/index.js'
import CodeViewer from '@components/primitives/CodeViewer.js'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import { RedactedContent } from '@components/primitives/styled'
import FileActions from '@components/FileActions/index.js'
import FileDiffToggle from '@components/FileActions/FileDiffToggle.js'
import DiffViewer from '@components/DiffViewer/index.js'

const FileView = ({ path }) => {
  const dispatch = useDispatch()
  const [is_diff_view_active, set_is_diff_view_active] = useState(false)

  const directory_state = useSelector(get_directory_state)
  const file_data = directory_state.get('file_data')
  const loading = directory_state.get('is_loading_file')
  const error = directory_state.get('file_error')

  const git_context = file_data?.git_context
  const is_loading_file_at_ref = useSelector(get_is_loading_file_at_ref)
  const git_error = useSelector(get_git_error)
  const file_at_ref_data = useSelector((state) =>
    git_context
      ? get_file_at_ref(
          state,
          git_context.repo_path,
          git_context.relative_path,
          'HEAD'
        )
      : null
  )

  useEffect(() => {
    dispatch(directory_actions.load_file(path))
    // Reset diff view when path changes
    set_is_diff_view_active(false)
  }, [path])

  const handle_diff_toggle = useCallback(() => {
    if (!is_diff_view_active && git_context) {
      // Load file content at HEAD when activating diff view
      dispatch(
        git_actions.load_file_at_ref({
          repo_path: git_context.repo_path,
          file_path: git_context.relative_path,
          ref: 'HEAD'
        })
      )
    }
    set_is_diff_view_active(!is_diff_view_active)
  }, [is_diff_view_active, git_context, dispatch])

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
            content={file_data.content}
            is_redacted={file_data?.is_redacted}
            path={path}
            git_context={git_context}
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
        <div style={{ color: COLORS.error }}>{error}</div>
      </Box>
    )
  }

  const file_type = get_file_type()
  const show_top_actions = file_type !== 'entity'

  const render_diff_or_content = () => {
    if (is_diff_view_active && git_context) {
      return (
        <DiffViewer
          original_content={file_at_ref_data?.content}
          current_content={file_data?.content || ''}
          file_path={path}
          is_redacted={file_at_ref_data?.is_redacted}
          is_loading={is_loading_file_at_ref}
          error={git_error}
        />
      )
    }
    return render_content()
  }

  return (
    <Box sx={{ height: '100%' }}>
      {show_top_actions && (
        <FileActions path={path}>
          <FileDiffToggle
            git_context={git_context}
            is_active={is_diff_view_active}
            on_toggle={handle_diff_toggle}
          />
        </FileActions>
      )}
      {render_diff_or_content()}
    </Box>
  )
}

FileView.propTypes = {
  path: PropTypes.string.isRequired
}

export default FileView
