import React from 'react'
import PropTypes from 'prop-types'

import './page-layout.styl'

const PageLayout = ({ children, className = '' }) => {
  return (
    <div className={`page-layout ${className}`}>
      <div className='page-content'>{children}</div>
    </div>
  )
}

PageLayout.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string
}

export default PageLayout
