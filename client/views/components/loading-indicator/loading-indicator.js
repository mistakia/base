import React from 'react'

import './loading-indicator.styl'

const LoadingIndicator = () => {
  return (
    <div className='loading-indicator'>
      <div className='loading-spinner'></div>
      <div className='loading-text'>Loading...</div>
    </div>
  )
}

export default LoadingIndicator
