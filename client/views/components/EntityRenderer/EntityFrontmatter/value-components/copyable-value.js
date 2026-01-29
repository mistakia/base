import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import CheckIcon from '@mui/icons-material/Check'

import { COLORS } from '@theme/colors.js'
import { use_copy_to_clipboard } from '@views/hooks/use-copy-to-clipboard.js'

const container_sx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: '12px',
  color: COLORS.text_secondary,
  borderRadius: '4px',
  padding: '2px 4px',
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: COLORS.surface_hover,
    color: COLORS.text
  }
}

const icon_sx = {
  fontSize: '12px',
  opacity: 0.6
}

const CopyableValue = ({ value }) => {
  const { copied_value, copy_to_clipboard } = use_copy_to_clipboard()
  const str_value = String(value)
  const is_copied = copied_value === str_value

  return (
    <Box
      sx={container_sx}
      onClick={() => copy_to_clipboard(str_value)}
      title='Click to copy'>
      <span>{str_value}</span>
      {is_copied ? (
        <CheckIcon sx={{ ...icon_sx, color: COLORS.success, opacity: 1 }} />
      ) : (
        <ContentCopyOutlinedIcon sx={icon_sx} />
      )}
    </Box>
  )
}

CopyableValue.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired
}

export default CopyableValue
