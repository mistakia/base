import React from 'react'
import PropTypes from 'prop-types'

const BaseLogo = ({ size = 20, className = '', ...props }) => {
  return (
    <svg
      viewBox='0 0 24 24'
      width={size}
      height={size}
      className={className}
      {...props}>
      <rect
        x='2'
        y='2'
        width='20'
        height='20'
        rx='3'
        fill='#4a90e2'
        stroke='#4a90e2'
        strokeWidth='1'
      />
      <path d='M8 8h8v2H8V8zm0 4h8v2H8v-2zm0 4h6v2H8v-2z' fill='white' />
    </svg>
  )
}

BaseLogo.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string
}

export default BaseLogo
