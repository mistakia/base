import React, { useState } from 'react'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import HelpTooltip from '@components/primitives/HelpTooltip.js'

const HomeFileBrowser = () => {
  const [is_collapsed, set_is_collapsed] = useState(false)

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
        <HelpTooltip title='Browse the files and folders in your knowledge base. You can open any file to view or edit it.'>
          <span className='home-section-header__title'>Files</span>
        </HelpTooltip>
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
