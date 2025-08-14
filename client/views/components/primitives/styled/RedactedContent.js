import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

/**
 * RedactedContent - Component for displaying redacted content blocks
 * Maintains layout and accessibility while indicating restricted access
 */
const RedactedContent = ({
  content_type = 'text',
  original_length = 0,
  placeholder_char = '█',
  show_tooltip = true,
  component = 'span',
  children,
  ...props
}) => {
  // Generate redacted text based on original length
  const generate_redacted_text = (length, char) => {
    if (length <= 0) return char.repeat(8) // Default minimum length

    // For different content types, adjust the redaction pattern
    switch (content_type) {
      case 'filename':
        // Preserve file extension if present
        if (typeof children === 'string' && children.includes('.')) {
          const parts = children.split('.')
          const extension = parts.pop()
          const name_length = children.length - extension.length - 1
          return char.repeat(Math.max(name_length, 3)) + '.' + extension
        }
        return char.repeat(Math.min(length, 20))

      case 'file_size':
        // Show format like "█.█ KB"
        return `${char}.${char} KB`

      case 'date':
        // Show format like "████-██-██"
        return `${char.repeat(4)}-${char.repeat(2)}-${char.repeat(2)}`

      case 'path':
        // Preserve path structure
        if (typeof children === 'string' && children.includes('/')) {
          return children
            .split('/')
            .map((segment) =>
              segment ? char.repeat(Math.min(segment.length, 10)) : ''
            )
            .join('/')
        }
        return char.repeat(Math.min(length, 50))

      case 'content':
        // For content blocks, use original length or reasonable default
        return char.repeat(Math.min(length || 100, 500))

      default:
        return char.repeat(Math.min(length || 10, 100))
    }
  }

  // Determine redacted text to display
  const redacted_text =
    children && typeof children === 'string'
      ? generate_redacted_text(children.length, placeholder_char)
      : generate_redacted_text(original_length, placeholder_char)

  // Get appropriate styling based on content type
  const get_redaction_styles = (content_type) => {
    const base_styles = {
      color: 'var(--color-text-disabled)',
      backgroundColor:
        'color-mix(in srgb, var(--color-text-disabled) 10%, transparent)',
      userSelect: 'none',
      cursor: 'not-allowed',
      opacity: 0.8
    }

    const type_styles = {
      text: {
        fontFamily: 'inherit',
        letterSpacing: '0.5px'
      },
      filename: {
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 500
      },
      file_size: {
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--font-size-xs)',
        opacity: 0.7
      },
      date: {
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--font-size-xs)',
        opacity: 0.7
      },
      path: {
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--font-size-sm)',
        wordBreak: 'break-all'
      },
      content: {
        fontFamily: 'inherit',
        lineHeight: 1.4,
        display: 'block',
        padding: '8px',
        borderRadius: '4px',
        border: '1px dashed var(--color-border-subtle)'
      }
    }

    return {
      ...base_styles,
      ...type_styles[content_type]
    }
  }

  // Create tooltip title if enabled
  const tooltip_title = show_tooltip
    ? `Access restricted - ${content_type} content redacted`
    : undefined

  return (
    <Box
      component={component}
      title={tooltip_title}
      sx={{
        ...get_redaction_styles(content_type),
        ...props.sx
      }}
      {...props}
      aria-label={`Redacted ${content_type} content`}
      role='text'>
      {redacted_text}
    </Box>
  )
}

RedactedContent.propTypes = {
  content_type: PropTypes.oneOf([
    'text',
    'filename',
    'file_size',
    'date',
    'path',
    'content'
  ]),
  original_length: PropTypes.number,
  placeholder_char: PropTypes.string,
  show_tooltip: PropTypes.bool,
  component: PropTypes.elementType,
  children: PropTypes.node,
  sx: PropTypes.object
}

export default RedactedContent
