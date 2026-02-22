import React from 'react'
import PropTypes from 'prop-types'
import { Dialog, Box } from '@mui/material'

import './ShortcutReference.styl'

const shortcuts = [
  { keys: ['Cmd', 'K'], description: 'New thread / resume thread' },
  { keys: ['Cmd', 'Shift', 'P'], description: 'Command palette' },
  { keys: ['Cmd', '/'], description: 'Shortcut reference' },
  { keys: ['Cmd', 'Enter'], description: 'Send message' },
  { keys: ['Escape'], description: 'Close overlay' }
]

const links = [
  { label: 'Home', path: '/' },
  { label: 'Threads', path: '/thread' },
  { label: 'Tasks', path: '/task' }
]

const tips = [
  'Command palette searches across files, entities, and threads',
  'Thread input supports file autocomplete with @ mentions',
  'Use Cmd+K on a thread page to resume that thread'
]

const ShortcutReference = ({ is_open, on_close }) => {
  if (!is_open) {
    return null
  }

  return (
    <Dialog
      open={is_open}
      onClose={on_close}
      maxWidth='sm'
      fullWidth
      className='shortcut-reference'
      hideBackdrop
      PaperProps={{
        className: 'shortcut-reference__paper',
        sx: {
          boxShadow:
            '0 1px 6px rgba(0, 0, 0, 0.06), 0 2px 12px rgba(0, 0, 0, 0.04)'
        }
      }}>
      <Box className='shortcut-reference__content'>
        <div className='shortcut-reference__section'>
          <div className='shortcut-reference__section-title'>
            Keyboard Shortcuts
          </div>
          {shortcuts.map((shortcut, index) => (
            <div key={index} className='shortcut-reference__shortcut-row'>
              <span className='shortcut-reference__shortcut-keys'>
                {shortcut.keys.map((key, i) => (
                  <kbd key={i} className='shortcut-reference__kbd'>
                    {key}
                  </kbd>
                ))}
              </span>
              <span className='shortcut-reference__shortcut-description'>
                {shortcut.description}
              </span>
            </div>
          ))}
        </div>

        <div className='shortcut-reference__section'>
          <div className='shortcut-reference__section-title'>Useful Links</div>
          {links.map((link, index) => (
            <div key={index} className='shortcut-reference__link-row'>
              <a href={link.path} className='shortcut-reference__link'>
                {link.label}
              </a>
              <span className='shortcut-reference__link-path'>{link.path}</span>
            </div>
          ))}
        </div>

        <div className='shortcut-reference__section'>
          <div className='shortcut-reference__section-title'>Tips</div>
          {tips.map((tip, index) => (
            <div key={index} className='shortcut-reference__tip-row'>
              {tip}
            </div>
          ))}
        </div>
      </Box>
    </Dialog>
  )
}

ShortcutReference.propTypes = {
  is_open: PropTypes.bool.isRequired,
  on_close: PropTypes.func.isRequired
}

export default ShortcutReference
