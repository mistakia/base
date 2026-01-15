import React from 'react'
import PropTypes from 'prop-types'
import { Chip } from '@mui/material'

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
    small: { height: '20px', fontSize: '10px' },
    medium: { height: '24px', fontSize: '12px' }
  }

  return (
    <Chip
      label={display_label}
      size={size}
      variant={variant}
      sx={{
        ...size_styles[size],
        maxWidth: max_width || 'none',
        ...(chip_color && {
          backgroundColor:
            variant === 'filled'
              ? `color-mix(in srgb, ${chip_color} 20%, transparent)`
              : 'transparent',
          borderColor: chip_color,
          color: chip_color,
          border: variant === 'outlined' ? `1px solid ${chip_color}` : 'none'
        }),
        '& .MuiChip-label': {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: '0 6px'
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
  /** Additional styles */
  sx: PropTypes.object
}

export { extract_tag_title }
export default TagChip
