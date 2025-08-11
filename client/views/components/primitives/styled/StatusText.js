import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

/**
 * StatusText - Semantic status colors for text and backgrounds
 * Replaces hardcoded error/success/warning colors throughout the app
 */
const StatusText = ({
  status = 'default',
  variant = 'text',
  children,
  component = 'span',
  ...props
}) => {
  const get_status_styles = (status, variant) => {
    const colors = {
      default: {
        text: { color: 'var(--color-text)' },
        background: {
          color: 'var(--color-text)',
          backgroundColor: 'var(--color-surface-secondary)',
          padding: '2px 6px',
          borderRadius: '3px'
        }
      },
      error: {
        text: { color: 'var(--color-error)' },
        background: {
          color: 'var(--color-error)',
          backgroundColor:
            'color-mix(in srgb, var(--color-error) 10%, transparent)',
          padding: '2px 6px',
          borderRadius: '3px',
          border:
            '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)'
        }
      },
      success: {
        text: { color: 'var(--color-success)' },
        background: {
          color: 'var(--color-success)',
          backgroundColor:
            'color-mix(in srgb, var(--color-success) 10%, transparent)',
          padding: '2px 6px',
          borderRadius: '3px',
          border:
            '1px solid color-mix(in srgb, var(--color-success) 30%, transparent)'
        }
      },
      warning: {
        text: { color: 'var(--color-warning)' },
        background: {
          color: 'var(--color-warning)',
          backgroundColor:
            'color-mix(in srgb, var(--color-warning) 10%, transparent)',
          padding: '2px 6px',
          borderRadius: '3px',
          border:
            '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)'
        }
      },
      info: {
        text: { color: 'var(--color-info)' },
        background: {
          color: 'var(--color-info)',
          backgroundColor:
            'color-mix(in srgb, var(--color-info) 10%, transparent)',
          padding: '2px 6px',
          borderRadius: '3px',
          border:
            '1px solid color-mix(in srgb, var(--color-info) 30%, transparent)'
        }
      }
    }

    return colors[status]?.[variant] || colors.default[variant]
  }

  return (
    <Box
      component={component}
      sx={{
        ...get_status_styles(status, variant),
        fontWeight: variant === 'background' ? 500 : 'inherit',
        ...props.sx
      }}
      {...props}>
      {children}
    </Box>
  )
}

StatusText.propTypes = {
  status: PropTypes.oneOf(['default', 'error', 'success', 'warning', 'info']),
  variant: PropTypes.oneOf(['text', 'background']),
  children: PropTypes.node.isRequired,
  component: PropTypes.elementType,
  sx: PropTypes.object
}

export default StatusText
