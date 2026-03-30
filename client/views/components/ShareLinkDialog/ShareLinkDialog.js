import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import CheckIcon from '@mui/icons-material/Check'

import { useSelector } from 'react-redux'

import Button from '@components/primitives/Button'
import { COLORS } from '@theme/colors.js'
import { BASE_URL } from '@core/constants'
import { get_app } from '@core/app/selectors'
import { use_copy_to_clipboard } from '@views/hooks/use-copy-to-clipboard.js'
import { create_share_token } from '@views/utils/create-share-token.js'

const EXPIRATION_PRESETS = [
  { label: 'No expiration', value: 0 },
  { label: '1 hour', value: 3600 },
  { label: '24 hours', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
  { label: 'Custom date', value: 'custom' }
]

const ShareLinkDialog = ({ open, on_close, entity_id, title }) => {
  const [expiration_preset, set_expiration_preset] = useState(0)
  const [custom_date, set_custom_date] = useState('')
  const [share_url, set_share_url] = useState(null)
  const [error, set_error] = useState(null)
  const { copied_value, copy_to_clipboard } = use_copy_to_clipboard()
  const is_copied = copied_value === share_url
  const app_state = useSelector(get_app)
  const private_key_hex = app_state.get('user_private_key')
  const public_key_hex = app_state.get('user_public_key')

  const compute_exp = useCallback(() => {
    if (expiration_preset === 'custom') {
      if (!custom_date) return null
      const date = new Date(custom_date)
      if (Number.isNaN(date.getTime())) return null
      return Math.floor(date.getTime() / 1000)
    }
    if (expiration_preset === 0) return 0
    return Math.floor(Date.now() / 1000) + expiration_preset
  }, [expiration_preset, custom_date])

  const handle_generate = useCallback(() => {
    const exp = compute_exp()
    if (exp === null) {
      set_error('Invalid expiration date')
      return
    }

    try {
      const token = create_share_token({
        entity_id,
        private_key_hex,
        public_key_hex,
        exp
      })
      set_share_url(`${BASE_URL}/s/${token}`)
      set_error(null)
    } catch (err) {
      set_error(err.message || 'Failed to generate share link')
    }
  }, [entity_id, private_key_hex, public_key_hex, compute_exp])

  const handle_close = useCallback(() => {
    set_share_url(null)
    set_error(null)
    set_expiration_preset(0)
    set_custom_date('')
    on_close()
  }, [on_close])

  const handle_copy = useCallback(() => {
    if (share_url) {
      copy_to_clipboard(share_url)
    }
  }, [share_url, copy_to_clipboard])

  return (
    <Dialog
      open={open}
      onClose={handle_close}
      maxWidth='sm'
      fullWidth
      PaperProps={{ sx: { borderRadius: 0 } }}>
      <DialogTitle sx={{ fontFamily: 'IBM Plex Mono, monospace', pb: 1 }}>
        Share Link
      </DialogTitle>

      <DialogContent>
        {title && (
          <Box
            sx={{
              fontSize: '13px',
              color: COLORS.text_secondary,
              mb: 2,
              fontFamily: 'IBM Plex Mono, monospace'
            }}>
            {title}
          </Box>
        )}

        {!share_url ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth size='small'>
              <InputLabel
                sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px' }}>
                Expiration
              </InputLabel>
              <Select
                value={expiration_preset}
                label='Expiration'
                onChange={(e) => set_expiration_preset(e.target.value)}
                sx={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '13px',
                  borderRadius: 0
                }}>
                {EXPIRATION_PRESETS.map((preset) => (
                  <MenuItem
                    key={preset.value}
                    value={preset.value}
                    sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px' }}>
                    {preset.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {expiration_preset === 'custom' && (
              <TextField
                type='datetime-local'
                label='Expiration date'
                value={custom_date}
                onChange={(e) => set_custom_date(e.target.value)}
                size='small'
                fullWidth
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  min: new Date().toISOString().slice(0, 16)
                }}
                sx={{
                  '& .MuiInputBase-root': {
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '13px',
                    borderRadius: 0
                  }
                }}
              />
            )}

            {error && (
              <Box
                sx={{
                  fontSize: '12px',
                  color: COLORS.error,
                  fontFamily: 'IBM Plex Mono, monospace'
                }}>
                {error}
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1.5,
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 0
              }}>
              <Box
                sx={{
                  flex: 1,
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '12px',
                  wordBreak: 'break-all',
                  color: COLORS.text,
                  lineHeight: 1.4
                }}>
                {share_url}
              </Box>
              <Box
                onClick={handle_copy}
                sx={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 0.5,
                  flexShrink: 0,
                  color: is_copied ? COLORS.success : COLORS.text_secondary,
                  transition: 'color 0.15s ease',
                  '&:hover': {
                    color: is_copied ? COLORS.success : COLORS.text
                  }
                }}>
                {is_copied ? (
                  <CheckIcon sx={{ fontSize: '18px' }} />
                ) : (
                  <ContentCopyOutlinedIcon sx={{ fontSize: '18px' }} />
                )}
              </Box>
            </Box>
            <Box
              sx={{
                fontSize: '11px',
                color: COLORS.text_tertiary,
                fontFamily: 'IBM Plex Mono, monospace'
              }}>
              Anyone with this link can view this resource (read-only).
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button variant='secondary' onClick={handle_close}>
          {share_url ? 'Close' : 'Cancel'}
        </Button>
        {!share_url && (
          <Button
            variant='primary'
            onClick={handle_generate}
            disabled={expiration_preset === 'custom' && !custom_date}>
            Generate Link
          </Button>
        )}
        {share_url && (
          <Button variant='primary' onClick={handle_copy}>
            {is_copied ? 'Copied' : 'Copy Link'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

ShareLinkDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  on_close: PropTypes.func.isRequired,
  entity_id: PropTypes.string.isRequired,
  title: PropTypes.string
}

export default ShareLinkDialog
