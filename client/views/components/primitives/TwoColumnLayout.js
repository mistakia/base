import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

const TwoColumnLayout = ({
  left_content,
  right_content,
  left_column_width = 8,
  right_column_width = 4,
  container_padding = 3,
  sticky_right = true
}) => {
  const left_flex_ratio = left_column_width
  const right_flex_ratio = right_column_width

  const container_style = {
    p: container_padding,
    '--left-flex': left_flex_ratio,
    '--right-flex': right_flex_ratio,
    '& .two-column-left': {
      '@media (min-width: 992px)': {
        flex: `${left_flex_ratio} 0 0%`
      }
    },
    '& .two-column-right': {
      '@media (min-width: 992px)': {
        flex: `${right_flex_ratio} 0 0%`
      }
    }
  }

  return (
    <Box sx={container_style}>
      <div className='two-column-container'>
        <div className='two-column-left'>{left_content}</div>

        <div
          className={`two-column-right ${sticky_right ? 'two-column-right-sticky' : ''}`}>
          {right_content}
        </div>
      </div>
    </Box>
  )
}

TwoColumnLayout.propTypes = {
  left_content: PropTypes.node.isRequired,
  right_content: PropTypes.node.isRequired,
  left_column_width: PropTypes.number,
  right_column_width: PropTypes.number,
  container_padding: PropTypes.number,
  sticky_right: PropTypes.bool
}

export default TwoColumnLayout
