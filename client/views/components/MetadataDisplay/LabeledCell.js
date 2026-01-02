import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import { COLORS } from '@theme/colors.js'

const LabeledCell = ({
  label,
  value,
  scrollable = false,
  add_left_border = false,
  compact = false,
  label_style = {},
  value_style = {},
  sx = {}
}) => {
  const cell_min_height = compact ? '48px' : '60px'
  const label_top = compact ? '6px' : '8px'
  const label_font_size = compact ? '10px' : '11px'
  const value_padding_top = compact ? '22px' : '28px'
  const value_padding_bottom = compact ? '8px' : '12px'
  const value_font_size = compact ? '13px' : '14px'

  return (
    <Box
      sx={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        minHeight: cell_min_height,
        borderLeft: add_left_border
          ? `1px solid ${COLORS.border_light}`
          : 'none',
        ...sx
      }}>
      <Box
        sx={{
          position: 'absolute',
          top: label_top,
          left: '12px',
          fontSize: label_font_size,
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
          pt: value_padding_top,
          pb: value_padding_bottom,
          px: '12px',
          fontSize: value_font_size,
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

LabeledCell.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  scrollable: PropTypes.bool,
  add_left_border: PropTypes.bool,
  compact: PropTypes.bool,
  label_style: PropTypes.object,
  value_style: PropTypes.object,
  sx: PropTypes.object
}

export default LabeledCell
