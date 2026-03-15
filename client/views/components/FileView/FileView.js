import React, { useEffect, useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useDispatch, useSelector } from 'react-redux'
import { directory_actions, get_directory_state } from '@core/directory'
import { git_actions } from '@core/git/actions'
import {
  get_file_at_ref,
  get_is_loading_file_at_ref_for_key,
  get_git_error
} from '@core/git/selectors'
import { subscribe_to_file, unsubscribe_from_file } from '@core/websocket'
import {
  get_file_type_from_path,
  detect_shell_script_from_content
} from '@views/utils/language-utils.js'
import { COLORS } from '@theme/colors.js'
import { API_URL } from '@core/constants'

import EntityRenderer from '@components/EntityRenderer/index.js'
import CodeViewer from '@components/primitives/CodeViewer.js'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import { RedactedContent } from '@components/primitives/styled'
import FileActions from '@components/FileActions/index.js'
import FileDiffToggle from '@components/FileActions/FileDiffToggle.js'
import GitFileActions from '@components/FileActions/GitFileActions.js'
import CopyPageButton from '@components/FileActions/CopyPageButton.js'
import DiffViewer from '@components/DiffViewer/index.js'
import ConflictResolver from '@components/ConflictResolver/index.js'

const FileView = ({ path }) => {
  const dispatch = useDispatch()
  const [is_diff_view_active, set_is_diff_view_active] = useState(false)

  const directory_state = useSelector(get_directory_state)
  const file_data = directory_state.get('file_data')
  const loading = directory_state.get('is_loading_file')
  const error = directory_state.get('file_error')

  const git_context = file_data?.git_context
  const is_loading_file_at_ref = useSelector((state) =>
    git_context
      ? get_is_loading_file_at_ref_for_key(
          state,
          git_context.repo_path,
          git_context.relative_path,
          'HEAD'
        )
      : false
  )
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
  }, [path, dispatch])

  // Subscribe to file change notifications
  useEffect(() => {
    if (!path) return

    subscribe_to_file(path)

    // Cleanup: unsubscribe when component unmounts or path changes
    return () => {
      unsubscribe_from_file(path)
    }
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

  const handle_conflict_resolved = useCallback(() => {
    // Reload file data to get updated git_context after conflict resolution
    dispatch(directory_actions.load_file(path))
  }, [dispatch, path])

  // Memoize file type and language detection to avoid duplicate calls
  const { file_type, detected_language } = useMemo(() => {
    if (!path) return { file_type: 'unknown', detected_language: null }

    if (file_data?.frontmatter && file_data?.frontmatter?.type) {
      return { file_type: 'entity', detected_language: null }
    }

    const type_from_path = get_file_type_from_path(path)

    // If file type is unknown (no extension), check content for shell scripts
    if (type_from_path === 'unknown' && file_data?.content) {
      const language = detect_shell_script_from_content(file_data.content)
      if (language) {
        return { file_type: 'code', detected_language: language }
      }
    }

    // For known code files, extract language from extension
    if (type_from_path === 'code') {
      const last_segment = path.split('/').pop()
      const parts = last_segment.split('.')
      const extension_language =
        parts.length > 1 ? parts.pop().toLowerCase() : 'text'
      return { file_type: 'code', detected_language: extension_language }
    }

    return { file_type: type_from_path, detected_language: null }
  }, [path, file_data])

  const render_content = () => {
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

      case 'code':
        return (
          <CodeViewer
            code={file_data?.content || ''}
            language={detected_language || 'text'}
            is_redacted={file_data?.is_redacted}
          />
        )

      case 'image':
        return (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <img
              src={`${API_URL}/filesystem/file/raw?path=${encodeURIComponent(path)}`}
              alt={path.split('/').pop()}
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                objectFit: 'contain'
              }}
            />
          </Box>
        )

      case 'pdf':
        return (
          <Box sx={{ height: 'calc(100vh - 120px)', width: '100%' }}>
            <iframe
              src={`${API_URL}/filesystem/file/raw?path=${encodeURIComponent(path)}`}
              title={path.split('/').pop()}
              style={{
                width: '100%',
                height: '100%',
                border: 'none'
              }}
            />
          </Box>
        )

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

  // Only show full-page loading when there is no existing file data.
  // When file_data already exists (e.g. background reload from FILE_CHANGED
  // websocket event), keep rendering the current content to avoid unmounting
  // the DiffViewer and losing scroll position.
  if (loading && !file_data) {
    return (
      <Box sx={{ p: 3 }}>
        <div>Loading file content...</div>
      </Box>
    )
  }

  if (error && !file_data) {
    return (
      <Box sx={{ p: 3 }}>
        <div style={{ color: COLORS.error }}>{error}</div>
      </Box>
    )
  }

  const show_top_actions = file_type !== 'entity'

  const render_diff_or_content = () => {
    // Check if file is in conflict state
    if (git_context?.status === 'conflict') {
      return (
        <ConflictResolver
          repo_path={git_context.repo_path}
          file_path={git_context.relative_path}
          compact={false}
          on_resolved={handle_conflict_resolved}
        />
      )
    }

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
        <FileActions>
          <CopyPageButton path={path} content={file_data?.content} />
          <GitFileActions git_context={git_context} />
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
