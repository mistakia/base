import React from 'react'
import { Box, Typography } from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'

const RedactedDiffPlaceholder = () => {
  return (
    <Box
      className='diff-viewer diff-viewer--redacted'
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
        p: 4,
        backgroundColor: 'var(--color-background-subtle)',
        border: '1px dashed var(--color-border-subtle)',
        borderRadius: 1
      }}>
      <LockOutlinedIcon
        sx={{
          fontSize: 48,
          color: 'var(--color-text-disabled)',
          mb: 2
        }}
      />
      <Typography variant='body2' sx={{ color: 'var(--color-text-secondary)' }}>
        Diff content is restricted
      </Typography>
      <Typography
        variant='caption'
        sx={{ color: 'var(--color-text-disabled)', mt: 1 }}>
        You do not have permission to view this file&apos;s changes
      </Typography>
    </Box>
  )
}

export default RedactedDiffPlaceholder
