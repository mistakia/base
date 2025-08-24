import React from 'react'
import PropTypes from 'prop-types'
import { convert_url_path_to_filesystem_path } from '@views/utils/base-uri-constants.js'
import CursorLogo from '@components/primitives/logos/CursorLogo.js'

const CursorButton = ({
  path,
  title = 'Open in Cursor',
  style = {},
  className = ''
}) => {
  const handle_open_in_cursor = () => {
    if (!path) return

    try {
      // Convert URL path to filesystem path
      const filesystem_path = convert_url_path_to_filesystem_path(path)

      // Generate Cursor URL
      const cursor_url = `cursor://file/${filesystem_path}`

      // Open in Cursor using location.href (safer for custom protocols)
      window.location.href = cursor_url
    } catch (error) {
      console.error('Failed to open file in Cursor:', error)
      alert(`Failed to open file in Cursor: ${error.message}`)
    }
  }

  if (!path) {
    return null
  }

  const default_style = {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    opacity: 0.7,
    transition: 'opacity 0.2s',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style
  }

  return (
    <button
      onClick={handle_open_in_cursor}
      style={default_style}
      className={className}
      onMouseEnter={(e) => {
        e.target.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        e.target.style.opacity = '0.7'
      }}
      title={title}>
      <CursorLogo size={16} />
    </button>
  )
}

CursorButton.propTypes = {
  path: PropTypes.string,
  title: PropTypes.string,
  style: PropTypes.object,
  className: PropTypes.string
}

export default CursorButton
