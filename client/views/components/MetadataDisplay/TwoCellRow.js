import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import { COLORS } from '@theme/colors.js'
import LabeledCell from './LabeledCell.js'

const TwoCellRow = ({
  left_label,
  left_value,
  left_scrollable = false,
  right_label,
  right_value,
  right_scrollable = false,
  is_first = false,
  compact = false,
  border_style = 'default',
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

  const min_height = compact ? '48px' : '60px'

  return (
    <Box
      sx={{
        ...border_styles[border_style],
        display: 'flex',
        minHeight: min_height,
        ...sx
      }}>
      <LabeledCell
        label={left_label}
        value={left_value}
        scrollable={left_scrollable}
        compact={compact}
      />
      <LabeledCell
        label={right_label}
        value={right_value}
        scrollable={right_scrollable}
        add_left_border={true}
        compact={compact}
      />
    </Box>
  )
}

TwoCellRow.propTypes = {
  left_label: PropTypes.string.isRequired,
  left_value: PropTypes.node.isRequired,
  left_scrollable: PropTypes.bool,
  right_label: PropTypes.string.isRequired,
  right_value: PropTypes.node.isRequired,
  right_scrollable: PropTypes.bool,
  is_first: PropTypes.bool,
  compact: PropTypes.bool,
  border_style: PropTypes.oneOf(['default', 'compact', 'none']),
  sx: PropTypes.object
}

export default TwoCellRow
