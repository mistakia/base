import React, { useState } from 'react'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'

const HomeFileBrowser = () => {
  const [is_collapsed, set_is_collapsed] = useState(true)

  const handle_toggle = () => {
    set_is_collapsed(!is_collapsed)
  }

  return (
    <div className='home-file-browser'>
      <div
        className='home-section-header home-section-header--clickable'
        onClick={handle_toggle}
        role='button'
        tabIndex={0}
        aria-expanded={!is_collapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handle_toggle()
          }
        }}>
        <span className='home-section-header__toggle'>
          {is_collapsed ? '+' : '-'}
        </span>
        <span className='home-section-header__dot home-section-header__dot--files' />
        <span className='home-section-header__title'>Files</span>
      </div>
      {!is_collapsed && (
        <div className='home-file-browser-content'>
          <FileSystemBrowser />
        </div>
      )}
    </div>
  )
}

export default HomeFileBrowser
