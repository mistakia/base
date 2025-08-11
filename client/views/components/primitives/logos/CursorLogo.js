import React from 'react'
import PropTypes from 'prop-types'

const CursorLogo = ({ size = 20, className = '', ...props }) => {
  return (
    <svg
      viewBox='0 0 24 24'
      width={size}
      height={size}
      className={className}
      {...props}>
      <defs>
        <linearGradient
          gradientUnits='userSpaceOnUse'
          id='cursor-fill-0'
          x1='11.925'
          x2='11.925'
          y1='12'
          y2='24'>
          <stop offset='.16' stopColor='#000' stopOpacity='.39' />
          <stop offset='.658' stopColor='#000' stopOpacity='.8' />
        </linearGradient>
        <linearGradient
          gradientUnits='userSpaceOnUse'
          id='cursor-fill-1'
          x1='22.35'
          x2='11.925'
          y1='6.037'
          y2='12.15'>
          <stop offset='.182' stopColor='#000' stopOpacity='.31' />
          <stop offset='.715' stopColor='#000' stopOpacity='0' />
        </linearGradient>
        <linearGradient
          gradientUnits='userSpaceOnUse'
          id='cursor-fill-2'
          x1='11.925'
          x2='1.5'
          y1='0'
          y2='18'>
          <stop stopColor='#000' stopOpacity='.6' />
          <stop offset='.667' stopColor='#000' stopOpacity='.22' />
        </linearGradient>
      </defs>
      <path
        d='M11.925 24l10.425-6-10.425-6L1.5 18l10.425 6z'
        fill='url(#cursor-fill-0)'
      />
      <path d='M22.35 18V6L11.925 0v12l10.425 6z' fill='url(#cursor-fill-1)' />
      <path d='M11.925 0L1.5 6v12l10.425-6V0z' fill='url(#cursor-fill-2)' />
      <path d='M22.35 6L11.925 24V12L22.35 6z' fill='#555' />
      <path d='M22.35 6l-10.425 6L1.5 6h20.85z' fill='#000' />
    </svg>
  )
}

CursorLogo.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string
}

export default CursorLogo
