import React from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

import './back-button.styl'

const BackButton = ({ to, children = '← Back' }) => {
  return (
    <Link to={to} className='back-button'>
      {children}
    </Link>
  )
}

BackButton.propTypes = {
  to: PropTypes.string.isRequired,
  children: PropTypes.node
}

export default BackButton
