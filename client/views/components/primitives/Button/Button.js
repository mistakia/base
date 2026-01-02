import React from 'react'
import PropTypes from 'prop-types'

/**
 * Button Component
 *
 * A lightweight button component following the design system.
 * Replaces Material UI Button for consistency and reduced bundle size.
 *
 * @param {string} variant - Button style: 'primary', 'secondary', 'ghost', 'danger', 'warning'
 * @param {string} size - Button size: 'small', 'medium'
 * @param {boolean} icon - If true, renders as square icon-only button
 * @param {boolean} loading - If true, shows loading state
 * @param {boolean} disabled - If true, button is disabled
 * @param {boolean} full_width - If true, button takes full width
 * @param {string} type - Button type: 'button', 'submit', 'reset'
 * @param {string} className - Additional CSS classes
 * @param {function} onClick - Click handler
 * @param {node} children - Button content
 */
const Button = ({
  variant = 'secondary',
  size = 'medium',
  icon = false,
  loading = false,
  disabled = false,
  full_width = false,
  type = 'button',
  className = '',
  onClick,
  children,
  ...props
}) => {
  const class_names = [
    'btn',
    `btn--${variant}`,
    size === 'small' && 'btn--small',
    icon && 'btn--icon',
    loading && 'btn--loading',
    full_width && 'btn--full-width',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={class_names}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}>
      {children}
    </button>
  )
}

Button.propTypes = {
  variant: PropTypes.oneOf([
    'primary',
    'secondary',
    'ghost',
    'danger',
    'warning'
  ]),
  size: PropTypes.oneOf(['small', 'medium']),
  icon: PropTypes.bool,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  full_width: PropTypes.bool,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  className: PropTypes.string,
  onClick: PropTypes.func,
  children: PropTypes.node
}

export default Button
