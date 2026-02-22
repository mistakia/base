import React from 'react'
import PropTypes from 'prop-types'
import { Box, Typography, CircularProgress } from '@mui/material'

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

const CommitDetail = ({ detail, is_loading }) => {
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

  const { subject, body, author_name, author_email, date, files, diff } =
    detail

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
        <Box
          component='pre'
          sx={{
            margin: 0,
            p: 2,
            fontFamily: 'monospace',
            fontSize: '11px',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'auto',
            maxHeight: 600,
            '& .diff-add': { color: '#2da44e', backgroundColor: '#dafbe1' },
            '& .diff-del': { color: '#cf222e', backgroundColor: '#ffebe9' }
          }}>
          {diff.split('\n').map((line, index) => {
            let class_name = ''
            if (line.startsWith('+') && !line.startsWith('+++')) {
              class_name = 'diff-add'
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              class_name = 'diff-del'
            }
            return (
              <span key={index} className={class_name}>
                {line}
                {'\n'}
              </span>
            )
          })}
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
