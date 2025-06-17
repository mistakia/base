import React from 'react'
import PropTypes from 'prop-types'

import './code-viewer.styl'

const CodeViewer = ({ code, language = 'text' }) => {
  return (
    <div className='code-viewer'>
      <div className='code-header'>
        <span className='code-language'>{language}</span>
      </div>
      <pre className='code-content'>
        <code>{code}</code>
      </pre>
    </div>
  )
}

CodeViewer.propTypes = {
  code: PropTypes.string.isRequired,
  language: PropTypes.string
}

export default CodeViewer
