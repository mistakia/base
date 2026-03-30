import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import LinkIcon from '@mui/icons-material/Link'
import { useSelector } from 'react-redux'

import { COLORS } from '@theme/colors.js'
import { get_has_valid_session } from '@core/app/selectors'
import ShareLinkDialog from '@components/ShareLinkDialog/ShareLinkDialog.js'

const ShareLinkButton = ({ entity_id, title }) => {
  const [dialog_open, set_dialog_open] = useState(false)
  const has_valid_session = useSelector(get_has_valid_session)

  const handle_open = useCallback(() => set_dialog_open(true), [])
  const handle_close = useCallback(() => set_dialog_open(false), [])

  if (!has_valid_session || !entity_id) {
    return null
  }

  return (
    <>
      <Box
        onClick={handle_open}
        title='Share link'
        sx={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px',
          color: COLORS.text_tertiary,
          transition: 'color 0.15s ease',
          '&:hover': {
            color: COLORS.text
          }
        }}>
        <LinkIcon sx={{ fontSize: '18px' }} />
      </Box>

      <ShareLinkDialog
        open={dialog_open}
        on_close={handle_close}
        entity_id={entity_id}
        title={title}
      />
    </>
  )
}

ShareLinkButton.propTypes = {
  entity_id: PropTypes.string,
  title: PropTypes.string
}

export default ShareLinkButton
