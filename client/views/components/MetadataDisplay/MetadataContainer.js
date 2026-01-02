import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import { COLORS } from '@theme/colors.js'

const MetadataContainer = ({
  children,
  background_color = 'white',
  border_radius = 2,
  border_color = COLORS.border,
  padding = 0,
  sx = {}
}) => {
  return (
    <Box
      sx={{
        backgroundColor: background_color,
        borderRadius: border_radius,
        border: border_color ? `1px solid ${border_color}` : 'none',
        overflow: 'hidden',
        padding,
        ...sx
      }}>
      {children}
    </Box>
  )
}

MetadataContainer.propTypes = {
  children: PropTypes.node.isRequired,
  background_color: PropTypes.string,
  border_radius: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  border_color: PropTypes.string,
  padding: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  sx: PropTypes.object
}

export default MetadataContainer
