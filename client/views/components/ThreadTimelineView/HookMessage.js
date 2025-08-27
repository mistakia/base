import React, { useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Typography, Collapse, IconButton } from '@mui/material'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'

const HookMessage = ({ message }) => {
  const [expanded, set_expanded] = useState(false)

  // Extract hook name from content like <user-prompt-submit-hook>
  const extract_hook_name = (content) => {
    const hook_match = content.match(/<(.+?-hook)>/)
    if (hook_match) {
      return hook_match[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())
    }
    return 'Hook'
  }

  // Extract hook execution output (everything after the hook tag)
  const extract_hook_output = (content) => {
    const hook_match = content.match(/<.+?-hook>([\s\S]*)/)
    return hook_match ? hook_match[1].trim() : ''
  }

  const hook_name = extract_hook_name(message.content)
  const hook_output = extract_hook_output(message.content)

  const handle_toggle = () => {
    set_expanded(!expanded)
  }

  return (
    <Box
      sx={{
        border: '1px solid var(--color-border)',
        borderRadius: 1,
        overflow: 'hidden'
      }}>
      {/* Hook header - clickable */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: 'var(--color-surface-hover)'
          }
        }}
        onClick={handle_toggle}>
        <Typography
          variant='body2'
          sx={{
            fontWeight: 600,
            color: 'var(--color-text-tertiary)'
          }}>
          {hook_name}
        </Typography>
        <IconButton
          size='small'
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }}>
          <ExpandMoreIcon fontSize='small' />
        </IconButton>
      </Box>

      {/* Hook output - collapsible */}
      <Collapse in={expanded}>
        <Box
          sx={{
            p: 2,
            borderTop: '1px solid var(--color-border)'
          }}>
          <Typography
            variant='body2'
            component='pre'
            sx={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: 'var(--color-text)',
              overflow: 'auto',
              maxHeight: '400px'
            }}>
            {hook_output || 'No output'}
          </Typography>
        </Box>
      </Collapse>
    </Box>
  )
}

HookMessage.propTypes = {
  message: PropTypes.object.isRequired
}

export default HookMessage
