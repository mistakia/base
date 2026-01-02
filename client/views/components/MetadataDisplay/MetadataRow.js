import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import { COLORS } from '@theme/colors.js'

const MetadataRow = ({
  label,
  value,
  scrollable = false,
  is_first = false,
  border_style = 'default',
  label_style = {},
  value_style = {},
  sx = {}
}) => {
  const default_border_style = {
    borderTop: is_first ? 'none' : `1px solid ${COLORS.border}`,
    borderBottom: 'none'
  }

  const compact_border_style = {
    borderTop: is_first ? 'none' : `1px solid ${COLORS.border_light}`,
    borderBottom: 'none'
  }

  const border_styles = {
    default: default_border_style,
    compact: compact_border_style,
    none: {}
  }

  return (
    <Box
      sx={{
        ...border_styles[border_style],
        position: 'relative',
        minHeight: '60px',
        ...sx
      }}>
      <Box
        sx={{
          position: 'absolute',
          top: '8px',
          left: '12px',
          fontSize: '11px',
          color: COLORS.text_secondary,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          ...label_style
        }}>
        {label}
      </Box>
      <Box
        sx={{
          pt: '28px',
          pb: '12px',
          px: '12px',
          fontSize: '14px',
          color: COLORS.text,
          fontWeight: 400,
          ...(scrollable
            ? {
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace'
              }
            : {
                wordBreak: 'break-all'
              }),
          ...value_style
        }}>
        {value}
      </Box>
    </Box>
  )
}

MetadataRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  scrollable: PropTypes.bool,
  is_first: PropTypes.bool,
  border_style: PropTypes.oneOf(['default', 'compact', 'none']),
  label_style: PropTypes.object,
  value_style: PropTypes.object,
  sx: PropTypes.object
}

export default MetadataRow
