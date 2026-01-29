import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { Link } from 'react-router-dom'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import CheckIcon from '@mui/icons-material/Check'

import { COLORS } from '@theme/colors.js'
import {
  is_absolute_url,
  convert_base_uri_to_path
} from '@views/utils/base-uri-constants.js'
import { use_copy_to_clipboard } from '@views/hooks/use-copy-to-clipboard.js'

const BASE_URI_PREFIX_REGEX = /^(user:|sys:)/

const link_sx = {
  color: COLORS.icon_link,
  textDecoration: 'none',
  fontSize: '12px',
  wordBreak: 'break-all',
  '&:hover': {
    textDecoration: 'underline'
  }
}

const copy_icon_sx = {
  fontSize: '12px',
  opacity: 0.6,
  cursor: 'pointer',
  '&:hover': {
    opacity: 1
  }
}

const container_sx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px'
}

const LinkValue = ({ value, show_copy = false }) => {
  const { copied_value, copy_to_clipboard } = use_copy_to_clipboard()
  const str_value = String(value)
  const is_copied = copied_value === str_value
  const is_base_uri = BASE_URI_PREFIX_REGEX.test(str_value)
  const is_external = is_absolute_url(str_value)

  const render_link = () => {
    if (is_base_uri) {
      const path = convert_base_uri_to_path(str_value)
      return (
        <Box component={Link} to={path} sx={link_sx}>
          {str_value}
        </Box>
      )
    }

    if (is_external) {
      return (
        <Box
          component='a'
          href={str_value}
          target='_blank'
          rel='noopener noreferrer'
          sx={link_sx}>
          {str_value}
        </Box>
      )
    }

    // Fallback - render as plain text
    return <span style={{ fontSize: '12px' }}>{str_value}</span>
  }

  if (!show_copy) {
    return render_link()
  }

  return (
    <Box sx={container_sx}>
      {render_link()}
      <Box
        onClick={() => copy_to_clipboard(str_value)}
        title='Click to copy'
        sx={{ display: 'inline-flex', alignItems: 'center' }}>
        {is_copied ? (
          <CheckIcon
            sx={{ ...copy_icon_sx, color: COLORS.success, opacity: 1 }}
          />
        ) : (
          <ContentCopyOutlinedIcon sx={copy_icon_sx} />
        )}
      </Box>
    </Box>
  )
}

LinkValue.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  show_copy: PropTypes.bool
}

export default LinkValue
