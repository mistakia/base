import React, { useState, useEffect, useCallback } from 'react'
import ImmutablePropTypes from 'react-immutable-proptypes'
import Snackbar from '@mui/material/Snackbar'
import MuiAlert from '@mui/material/Alert'

const Alert = React.forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant='filled' {...props} />
})

/**
 * Notification Component
 *
 * Displays snackbar notifications with queuing support.
 * Manages a queue of notifications and displays them one at a time.
 * Supports both plain text notifications and custom rich components.
 */
const Notification = ({ info = null }) => {
  const [is_open, set_is_open] = useState(false)
  const [current_notification, set_current_notification] = useState(null)
  const [notification_queue, set_notification_queue] = useState([])

  // Handle incoming notification from props
  useEffect(() => {
    if (!info) return

    const notification_key = info.get('key')
    if (notification_key) {
      const notification_data = {
        ...info.toJS(),
        // Store component reference (not serializable)
        component: info.get('component')
      }
      set_notification_queue((prev_queue) => [...prev_queue, notification_data])
    }
  }, [info])

  // Process notification queue
  useEffect(() => {
    // If we have queued notifications and none is currently showing
    if (notification_queue.length > 0 && !current_notification) {
      const [next_notification, ...remaining_queue] = notification_queue
      set_current_notification(next_notification)
      set_notification_queue(remaining_queue)
      set_is_open(true)
    }
    // If we have queued notifications and one is showing, close current to show next
    else if (notification_queue.length > 0 && current_notification && is_open) {
      set_is_open(false)
    }
  }, [notification_queue, current_notification, is_open])

  const handle_close = useCallback((event, reason) => {
    if (reason === 'clickaway') {
      return
    }
    set_is_open(false)
  }, [])

  const handle_exited = useCallback(() => {
    set_current_notification(null)
  }, [])

  const duration = current_notification?.duration || 6000
  const has_severity = current_notification?.severity
  const has_custom_component = current_notification?.component

  // Render custom component if provided
  const render_content = () => {
    if (!current_notification) return null

    // Custom component takes precedence
    if (has_custom_component) {
      const CustomComponent = current_notification.component
      return (
        <Alert severity={has_severity || 'info'} onClose={handle_close}>
          <CustomComponent
            {...current_notification.component_props}
            on_close={handle_close}
          />
        </Alert>
      )
    }

    // Default text notification
    if (has_severity) {
      return (
        <Alert severity={current_notification.severity} onClose={handle_close}>
          {current_notification.message}
        </Alert>
      )
    }

    return null
  }

  return (
    <Snackbar
      key={current_notification?.key}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'right'
      }}
      open={is_open}
      autoHideDuration={duration}
      onClose={handle_close}
      TransitionProps={{ onExited: handle_exited }}
      sx={{
        bottom: '60px !important' // Account for bottom bar height (typically 48-60px)
      }}
      message={
        current_notification && !has_severity && !has_custom_component
          ? current_notification.message
          : undefined
      }>
      {render_content()}
    </Snackbar>
  )
}

Notification.propTypes = {
  info: ImmutablePropTypes.record
}

export default Notification
