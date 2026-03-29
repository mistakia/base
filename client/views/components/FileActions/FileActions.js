import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

const FileActions = ({ children }) => {
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
        margin: '8px 0'
      }}>
      {children}
    </Box>
  )
}

FileActions.propTypes = {
  children: PropTypes.node
}

export default FileActions
