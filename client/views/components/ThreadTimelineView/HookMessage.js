import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'

import './HookMessage.styl'

const extract_hook_name = (content) => {
  const hook_match = content.match(/<(.+?-hook)>/)
  if (hook_match) {
    return hook_match[1]
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
  }
  return 'Hook'
}

const extract_hook_output = (content) => {
  const hook_match = content.match(/<.+?-hook>([\s\S]*)/)
  return hook_match ? hook_match[1].trim() : ''
}

const HookMessage = ({ message }) => {
  const [expanded, set_expanded] = useState(false)
  const hook_name = extract_hook_name(message.content)
  const hook_output = extract_hook_output(message.content)
  const handle_toggle = () => set_expanded((v) => !v)

  return (
    <div className='hook-message'>
      <div className='hook-message__header' onClick={handle_toggle}>
        <span className='hook-message__title'>{hook_name}</span>
        <IconButton
          size='small'
          className={`hook-message__toggle${expanded ? ' hook-message__toggle--expanded' : ''}`}>
          <ExpandMoreIcon fontSize='small' />
        </IconButton>
      </div>
      <Collapse in={expanded}>
        <div className='hook-message__body'>
          <pre className='hook-message__output'>
            {hook_output || 'No output'}
          </pre>
        </div>
      </Collapse>
    </div>
  )
}

HookMessage.propTypes = {
  message: PropTypes.object.isRequired
}

export default HookMessage
