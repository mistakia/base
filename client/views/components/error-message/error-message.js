import React from 'react'
import PropTypes from 'prop-types'

import './error-message.styl'

const ErrorMessage = ({ error, title = 'Error' }) => {
  const error_text =
    typeof error === 'string'
      ? error
      : error?.message || 'An unexpected error occurred'

  return (
    <div className='error-message'>
      <div className='error-icon'>⚠️</div>
      <div className='error-content'>
        <h3 className='error-title'>{title}</h3>
        <p className='error-text'>{error_text}</p>
      </div>
    </div>
  )
}

ErrorMessage.propTypes = {
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
  title: PropTypes.string
}

export default ErrorMessage
