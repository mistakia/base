import React from 'react'
import PropTypes from 'prop-types'

import './json-viewer.styl'

const JSONViewer = ({ data }) => {
  return (
    <div className='json-viewer'>
      <pre className='json-content'>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

JSONViewer.propTypes = {
  data: PropTypes.any.isRequired
}

export default JSONViewer
