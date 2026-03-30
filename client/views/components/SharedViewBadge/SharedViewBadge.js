import React from 'react'
import { Box } from '@mui/material'
import LinkIcon from '@mui/icons-material/Link'
import { useLocation } from 'react-router-dom'

import { COLORS } from '@theme/colors.js'

const SharedViewBadge = () => {
  const location = useLocation()
  const search_params = new URLSearchParams(location.search)
  const has_share_token = search_params.has('share_token')

  if (!has_share_token) {
    return null
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        fontSize: '11px',
        fontFamily: 'IBM Plex Mono, monospace',
        color: COLORS.text_secondary,
        backgroundColor: COLORS.surface_secondary,
        border: `1px solid ${COLORS.border_light}`,
        borderRadius: 0
      }}>
      <LinkIcon sx={{ fontSize: '12px' }} />
      Shared view
    </Box>
  )
}

export default SharedViewBadge
