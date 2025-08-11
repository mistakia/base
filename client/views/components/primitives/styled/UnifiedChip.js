import React from 'react'
import PropTypes from 'prop-types'
import { Chip, Box } from '@mui/material'

/**
 * UnifiedChip - Consolidates custom CSS chip and Material-UI chip patterns
 * Handles both styling approaches through variant prop
 */
const UnifiedChip = ({
  variant = 'mui',
  status = 'default',
  size = 'small',
  label,
  children,
  ...props
}) => {
  if (variant === 'custom') {
    // Custom CSS chip implementation (matching existing .chip styles)
    const get_status_colors = (status) => {
      const colors = {
        default: {
          color: 'var(--color-text-secondary)',
          backgroundColor: 'var(--color-surface-secondary)',
          borderColor: 'var(--color-border-light)'
        },
        error: {
          color: 'var(--color-error)',
          backgroundColor:
            'color-mix(in srgb, var(--color-error) 10%, transparent)',
          borderColor: 'var(--color-error)'
        },
        success: {
          color: 'var(--color-success)',
          backgroundColor:
            'color-mix(in srgb, var(--color-success) 10%, transparent)',
          borderColor: 'var(--color-success)'
        },
        warning: {
          color: 'var(--color-warning)',
          backgroundColor:
            'color-mix(in srgb, var(--color-warning) 10%, transparent)',
          borderColor: 'var(--color-warning)'
        },
        info: {
          color: 'var(--color-info)',
          backgroundColor:
            'color-mix(in srgb, var(--color-info) 10%, transparent)',
          borderColor: 'var(--color-info)'
        }
      }
      return colors[status] || colors.default
    }

    const statusColors = get_status_colors(status)

    return (
      <Box
        component='span'
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 8px',
          fontFamily: 'var(--font-family-mono)',
          fontSize: '10px',
          fontWeight: 500,
          borderRadius: '4px',
          border: '1px solid',
          ...statusColors,
          ...props.sx
        }}
        {...props}>
        {label || children}
      </Box>
    )
  }

  // Material-UI chip implementation with consistent sizing
  const get_chip_color = (status) => {
    const colorMap = {
      error: 'error',
      success: 'success',
      warning: 'warning',
      info: 'info',
      default: 'default'
    }
    return colorMap[status] || 'default'
  }

  const get_chip_sx = (size) => {
    const sizeStyles = {
      small: { height: 20, fontSize: '10px' },
      medium: { height: 24, fontSize: '12px' }
    }
    return sizeStyles[size] || sizeStyles.small
  }

  return (
    <Chip
      label={label || children}
      size={size}
      color={get_chip_color(status)}
      sx={{
        fontFamily: 'var(--font-family-mono)',
        ...get_chip_sx(size),
        ...props.sx
      }}
      {...props}
    />
  )
}

UnifiedChip.propTypes = {
  variant: PropTypes.oneOf(['custom', 'mui']),
  status: PropTypes.oneOf(['default', 'error', 'success', 'warning', 'info']),
  size: PropTypes.oneOf(['small', 'medium']),
  label: PropTypes.string,
  children: PropTypes.node,
  sx: PropTypes.object
}

export default UnifiedChip
