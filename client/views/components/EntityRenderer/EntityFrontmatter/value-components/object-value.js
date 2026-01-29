import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import { COLORS } from '@theme/colors.js'

const container_sx = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  fontSize: '12px'
}

const row_sx = {
  display: 'flex',
  gap: '6px',
  lineHeight: 1.5
}

const label_sx = {
  color: COLORS.text_tertiary,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  minWidth: 'fit-content'
}

const value_sx = {
  color: COLORS.text_secondary,
  wordBreak: 'break-word'
}

const ObjectValue = ({ value }) => {
  if (!value || typeof value !== 'object') {
    return <span style={{ fontSize: '12px' }}>N/A</span>
  }

  const entries = Object.entries(value)
  if (entries.length === 0) {
    return <span style={{ fontSize: '12px' }}>Empty</span>
  }

  return (
    <Box sx={container_sx}>
      {entries.map(([key, val]) => (
        <Box key={key} sx={row_sx}>
          <span style={label_sx}>{key}:</span>
          <span style={value_sx}>
            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
          </span>
        </Box>
      ))}
    </Box>
  )
}

ObjectValue.propTypes = {
  value: PropTypes.object
}

export default ObjectValue
