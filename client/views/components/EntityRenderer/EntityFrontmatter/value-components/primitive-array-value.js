import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

const container_sx = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  alignItems: 'center'
}

const PrimitiveArrayValue = ({ value }) => {
  if (!Array.isArray(value) || value.length === 0) {
    return <span style={{ fontSize: '12px' }}>None</span>
  }

  return (
    <Box sx={container_sx}>
      {value.map((item, index) => (
        <span key={index} className='chip'>
          {String(item)}
        </span>
      ))}
    </Box>
  )
}

PrimitiveArrayValue.propTypes = {
  value: PropTypes.array.isRequired
}

export default PrimitiveArrayValue
