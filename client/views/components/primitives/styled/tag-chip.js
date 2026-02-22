import React from 'react'
import PropTypes from 'prop-types'
import { Chip } from '@mui/material'
import { Link } from 'react-router-dom'

/**
 * Extract display title from tag base_uri
 * Converts 'user:tag/my-tag-name.md' to 'my-tag-name'
 */
const extract_tag_title = (base_uri) => {
  if (!base_uri) return ''
  const parts = base_uri.split('/')
  const filename = parts[parts.length - 1]
  return filename.replace(/\.md$/, '')
}

/**
 * Generate a consistent color from a string (for tags without explicit colors)
 */
const generate_color_from_string = (str) => {
  if (!str) return null
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 45%, 45%)`
}

/**
 * TagChip - Universal tag display component
 *
 * Displays a tag with consistent styling across the application.
 * Supports explicit colors from tag entities or generates consistent colors from base_uri.
 */
const TagChip = ({
  tag,
  size = 'small',
  variant = 'filled',
  max_width,
  show_color = true,
  to,
  ...props
}) => {
  // Support both tag objects and plain base_uri strings
  const base_uri = typeof tag === 'string' ? tag : tag?.base_uri
  const title = typeof tag === 'string' ? extract_tag_title(tag) : tag?.title
  const color = typeof tag === 'string' ? null : tag?.color

  const display_label = title || extract_tag_title(base_uri) || base_uri
  const chip_color = show_color
    ? color || generate_color_from_string(base_uri)
    : null

  const size_styles = {
    small: { height: '20px', fontSize: '10px', padding: '3px 8px' },
    medium: { height: '24px', fontSize: '12px', padding: '4px 10px' }
  }

  const link_props = to ? { component: Link, to, clickable: true } : {}

  return (
    <Chip
      label={display_label}
      size={size}
      variant={variant}
      {...link_props}
      sx={{
        ...size_styles[size],
        maxWidth: max_width || 'none',
        fontFamily: "'IBM Plex Mono', Monaco, Menlo, 'Ubuntu Mono', monospace",
        fontWeight: 700,
        lineHeight: 1,
        borderRadius: '4px',
        border: '1px solid #e9ecef',
        ...(chip_color && { borderColor: chip_color }),
        backgroundColor: chip_color
          ? `color-mix(in srgb, ${chip_color} 10%, #f8f9fa)`
          : '#f8f9fa',
        color: '#6c757d',
        transition: 'all 0.15s ease',
        ...(to && {
          cursor: 'pointer',
          textDecoration: 'none',
          '&:hover': {
            backgroundColor: chip_color
              ? `color-mix(in srgb, ${chip_color} 20%, #f8f9fa)`
              : 'rgba(0, 123, 255, 0.08)',
            borderColor: chip_color || '#007bff',
            textDecoration: 'none'
          }
        }),
        ...(!to && {
          '&:hover': {
            backgroundColor: '#fafafa',
            borderColor: chip_color || '#dee2e6'
          }
        }),
        '& .MuiChip-label': {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: 0
        },
        ...props.sx
      }}
      {...props}
    />
  )
}

TagChip.propTypes = {
  /** Tag object with base_uri, title, color OR plain base_uri string */
  tag: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      base_uri: PropTypes.string,
      title: PropTypes.string,
      color: PropTypes.string
    })
  ]).isRequired,
  /** Chip size */
  size: PropTypes.oneOf(['small', 'medium']),
  /** Chip variant */
  variant: PropTypes.oneOf(['filled', 'outlined']),
  /** Maximum width for the chip */
  max_width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  /** Whether to show colors */
  show_color: PropTypes.bool,
  /** Optional route path to make the chip a clickable link */
  to: PropTypes.string,
  /** Additional styles */
  sx: PropTypes.object
}

export { extract_tag_title }
export default TagChip
