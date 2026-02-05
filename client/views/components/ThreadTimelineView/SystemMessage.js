import React, { useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import PanToolIcon from '@mui/icons-material/PanTool'

import './SystemMessage.styl'
import { ansi_to_html } from '@views/utils/ansi-to-html.js'
import { get_system_event_display } from './utils/system-event-utils.js'
import TaskNotificationMessage from './TaskNotificationMessage'

const SystemMessage = ({ message, working_directory = null }) => {
  const [is_expanded, set_is_expanded] = useState(false)

  const on_toggle = useCallback(() => {
    set_is_expanded((v) => !v)
  }, [])

  const { label, severity } = get_system_event_display(message)

  // Route task notifications to the dedicated component
  if (severity === 'tasknotification') {
    // System event content may be JSON-wrapped; extract the raw text
    let raw_content = label || ''
    if (typeof raw_content === 'string') {
      try {
        const parsed = JSON.parse(raw_content)
        if (typeof parsed === 'string') {
          raw_content = parsed
        } else if (parsed && typeof parsed.content === 'string') {
          raw_content = parsed.content
        }
      } catch {
        // not JSON, use as-is
      }
    }
    return <TaskNotificationMessage message={{ content: raw_content }} />
  }

  let content = label || ''
  if (typeof content !== 'string') {
    content = JSON.stringify(content, null, 2)
  }

  const should_truncate = content.length > 200
  const display_content = useMemo(() => {
    const text_to_render =
      should_truncate && !is_expanded
        ? content.substring(0, 200) + '...'
        : content

    return ansi_to_html(text_to_render)
  }, [content, should_truncate, is_expanded])

  const container_class = `system-message system-message--${severity}${
    should_truncate ? ' system-message--clickable' : ''
  }`

  const render_icon = () => {
    const icon_props = { className: 'system-message__icon', fontSize: 'small' }

    switch (severity) {
      case 'error':
        return <ErrorOutlineIcon {...icon_props} />
      case 'warning':
        return <WarningAmberIcon {...icon_props} />
      case 'interrupt':
        return <PanToolIcon {...icon_props} />
      default:
        return null
    }
  }

  const render_ansi_content = () => {
    return display_content.map((element, index) => {
      if (typeof element === 'string') {
        return element
      } else if (element && element.type === 'span') {
        return (
          <span key={element.key || index} style={element.props.style}>
            {element.props.children}
          </span>
        )
      }
      return null
    })
  }

  return (
    <div
      className={container_class}
      onClick={should_truncate ? on_toggle : undefined}>
      {render_icon()}
      <div
        className={`system-message__content${should_truncate ? ' system-message__content--truncated' : ''}`}>
        <div className='system-message__text'>{render_ansi_content()}</div>
      </div>
      {should_truncate && (
        <span className='system-message__expand-hint'>
          {is_expanded ? 'Click to collapse' : 'Click to expand'}
        </span>
      )}
    </div>
  )
}

SystemMessage.propTypes = {
  message: PropTypes.shape({
    content: PropTypes.oneOfType([PropTypes.string, PropTypes.object])
      .isRequired,
    system_type: PropTypes.string,
    metadata: PropTypes.shape({
      level: PropTypes.string
    })
  }).isRequired,
  working_directory: PropTypes.string
}

export default SystemMessage
