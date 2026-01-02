import React, { useState } from 'react'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'

const HomeFileBrowser = () => {
  const [is_expanded, set_is_expanded] = useState(false)

  const handle_toggle = () => {
    set_is_expanded(!is_expanded)
  }

  return (
    <div
      className={`home-file-browser ${is_expanded ? 'home-file-browser--expanded' : ''}`}>
      <div
        className='home-file-browser-header'
        onClick={handle_toggle}
        role='button'
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handle_toggle()
          }
        }}>
        <span className='home-file-browser-title'>Files</span>
        <span className='home-file-browser-toggle'>
          {is_expanded ? 'hide' : 'show'}
        </span>
      </div>
      {is_expanded && (
        <div className='home-file-browser-content'>
          <FileSystemBrowser />
        </div>
      )}
    </div>
  )
}

export default HomeFileBrowser
