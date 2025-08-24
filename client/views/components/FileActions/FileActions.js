import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import CursorButton from '@components/CursorButton/index.js'

const FileActions = ({ path, title, children }) => {
  return (
    <Box
      className='file-actions'
      sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 1,
        mb: 2,
        minHeight: '24px',
        maxWidth: '1200px',
        margin: '8px auto',
        px: 2
      }}>
      {children}
      {path && <CursorButton path={path} title={title} />}
    </Box>
  )
}

FileActions.propTypes = {
  path: PropTypes.string,
  title: PropTypes.string,
  children: PropTypes.node
}

export default FileActions
