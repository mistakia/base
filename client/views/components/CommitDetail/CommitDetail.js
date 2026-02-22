import React, { useRef } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography, CircularProgress } from '@mui/material'
import { PatchDiff } from '@pierre/diffs/react'

import { COLORS } from '@theme/colors.js'

const status_labels = {
  A: 'Added',
  M: 'Modified',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied'
}

const status_colors = {
  A: '#2da44e',
  M: '#bf8700',
  D: '#cf222e',
  R: '#8250df',
  C: '#0969da'
}

const diff_options = {
  layout: 'unified',
  themes: {
    light: 'github-light',
    dark: 'github-dark'
  },
  themeType: 'light',
  lineNumbers: true,
  wordWrap: true,
  unsafeCSS: `
    pre {
      font-size: 11px !important;
      line-height: 1.4 !important;
    }
  `
}

const CommitDetail = ({ detail, is_loading }) => {
  const options_ref = useRef(diff_options).current
  if (is_loading) {
    return (
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={20} />
      </Box>
    )
  }

  if (!detail) {
    return null
  }

  const { subject, body, author_name, author_email, date, files, diff } = detail

  return (
    <Box
      sx={{
        borderTop: `1px solid ${COLORS.border_light}`,
        backgroundColor: '#fafafa'
      }}>
      {/* Commit message */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border_light}` }}>
        <Typography
          variant='body2'
          sx={{ fontWeight: 600, fontSize: '13px', mb: 0.5 }}>
          {subject}
        </Typography>
        {body && (
          <Box
            component='pre'
            sx={{
              margin: 0,
              fontFamily: 'monospace',
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: COLORS.text_secondary,
              mt: 1
            }}>
            {body}
          </Box>
        )}
        <Typography
          variant='caption'
          sx={{ color: COLORS.text_secondary, mt: 1, display: 'block' }}>
          {author_name} {'<'}
          {author_email}
          {'>'} - {date ? new Date(date).toLocaleString() : '-'}
        </Typography>
      </Box>

      {/* File list */}
      {files && files.length > 0 && (
        <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border_light}` }}>
          <Typography
            variant='body2'
            sx={{
              fontSize: '12px',
              fontWeight: 600,
              mb: 1,
              color: COLORS.text_secondary
            }}>
            {files.length} file{files.length !== 1 ? 's' : ''} changed
          </Typography>
          {files.map((file) => (
            <Box
              key={file.path}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.25
              }}>
              <Typography
                variant='caption'
                sx={{
                  fontWeight: 600,
                  fontSize: '11px',
                  color: status_colors[file.status] || COLORS.text_secondary,
                  minWidth: 60
                }}>
                {status_labels[file.status] || file.status}
              </Typography>
              <Typography
                variant='body2'
                sx={{ fontSize: '12px', fontFamily: 'monospace' }}>
                {file.path}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Diff content */}
      {diff && (
        <Box sx={{ overflow: 'auto', maxHeight: 600 }}>
          <PatchDiff patch={diff} options={options_ref} />
        </Box>
      )}
    </Box>
  )
}

CommitDetail.propTypes = {
  detail: PropTypes.shape({
    subject: PropTypes.string,
    body: PropTypes.string,
    author_name: PropTypes.string,
    author_email: PropTypes.string,
    date: PropTypes.string,
    files: PropTypes.arrayOf(
      PropTypes.shape({
        status: PropTypes.string,
        path: PropTypes.string
      })
    ),
    diff: PropTypes.string
  }),
  is_loading: PropTypes.bool
}

export default CommitDetail
