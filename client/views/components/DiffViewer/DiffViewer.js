import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box, CircularProgress, Alert } from '@mui/material'
import { FileDiff } from '@pierre/diffs/react'
import { parseDiffFromFile } from '@pierre/diffs'

import { get_language_from_path } from '@views/utils/language-utils.js'
import RedactedDiffPlaceholder from './RedactedDiffPlaceholder.js'

import './DiffViewer.styl'

const DiffViewer = ({
  original_content,
  current_content,
  file_path,
  is_redacted,
  is_loading,
  error
}) => {
  const file_name = file_path?.split('/').pop() || 'file'
  const language = get_language_from_path(file_path)

  const { file_diff, diff_error, no_changes } = useMemo(() => {
    if (
      original_content === null ||
      original_content === undefined ||
      is_loading ||
      error ||
      is_redacted
    ) {
      return { file_diff: null, diff_error: null, no_changes: false }
    }

    const old_file = {
      name: file_name,
      contents: original_content
    }

    const new_file = {
      name: file_name,
      contents: current_content || ''
    }

    // Check if files are identical
    if (old_file.contents === new_file.contents) {
      return { file_diff: null, diff_error: null, no_changes: true }
    }

    try {
      const diff = parseDiffFromFile(old_file, new_file)
      // Set language after parsing
      diff.lang = language
      return { file_diff: diff, diff_error: null, no_changes: false }
    } catch (err) {
      return {
        file_diff: null,
        diff_error: err.message || 'Failed to compute diff',
        no_changes: false
      }
    }
  }, [
    original_content,
    current_content,
    file_name,
    language,
    is_loading,
    error,
    is_redacted
  ])

  if (is_loading) {
    return (
      <Box
        className='diff-viewer diff-viewer--loading'
        sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (error) {
    return (
      <Box className='diff-viewer' sx={{ p: 2 }}>
        <Alert severity='warning'>Unable to load diff: {error}</Alert>
      </Box>
    )
  }

  if (is_redacted) {
    return <RedactedDiffPlaceholder />
  }

  if (no_changes) {
    return (
      <Box className='diff-viewer' sx={{ p: 2 }}>
        <Alert severity='info'>No changes detected in this file.</Alert>
      </Box>
    )
  }

  if (diff_error) {
    return (
      <Box className='diff-viewer' sx={{ p: 2 }}>
        <Alert severity='warning'>Unable to compute diff: {diff_error}</Alert>
      </Box>
    )
  }

  // Guard against rendering with null file_diff (e.g., original content not yet loaded)
  if (!file_diff) {
    return (
      <Box
        className='diff-viewer diff-viewer--loading'
        sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  const diff_options = {
    layout: 'split',
    themes: {
      light: 'github-light',
      dark: 'github-dark'
    },
    themeType: 'light',
    lineNumbers: true,
    wordWrap: true,
    // Inject CSS into Shadow DOM to match ConflictResolver font size and hide header
    unsafeCSS: `
      pre {
        font-size: 11px !important;
        line-height: 1.4 !important;
      }
      [data-diffs-header] {
        display: none !important;
      }
    `
  }

  return (
    <Box className='diff-viewer'>
      <FileDiff
        fileDiff={file_diff}
        options={diff_options}
        className='diff-viewer__content'
      />
    </Box>
  )
}

DiffViewer.propTypes = {
  original_content: PropTypes.string,
  current_content: PropTypes.string,
  file_path: PropTypes.string,
  is_redacted: PropTypes.bool,
  is_loading: PropTypes.bool,
  error: PropTypes.string
}

export default DiffViewer
