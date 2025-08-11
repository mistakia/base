import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

/**
 * MonospaceText - Consistent monospace typography component
 * Replaces 47+ hardcoded instances of fontFamily: 'Monaco, Menlo, monospace'
 */
const MonospaceText = ({
  variant = 'base',
  color = 'var(--color-text)',
  children,
  component = 'span',
  ...props
}) => {
  const get_font_size = (variant) => {
    const sizes = {
      xs: 'var(--font-size-xs)',
      sm: 'var(--font-size-sm)',
      base: 'var(--font-size-base)',
      xl: 'var(--font-size-xl)'
    }
    return sizes[variant] || sizes.base
  }

  return (
    <Box
      component={component}
      sx={{
        fontFamily: 'var(--font-family-mono)',
        fontSize: get_font_size(variant),
        color,
        lineHeight: 1.4,
        ...props.sx
      }}
      {...props}>
      {children}
    </Box>
  )
}

MonospaceText.propTypes = {
  variant: PropTypes.oneOf(['xs', 'sm', 'base', 'xl']),
  color: PropTypes.string,
  children: PropTypes.node.isRequired,
  component: PropTypes.elementType,
  sx: PropTypes.object
}

export default MonospaceText
