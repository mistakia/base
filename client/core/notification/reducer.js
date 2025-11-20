import { Record } from 'immutable'

import { notification_action_types } from './actions'

/**
 * Notification State Record
 *
 * Manages the current notification to display
 * Queue is handled in the Notification component itself
 */
const NotificationState = new Record({
  key: null,
  message: null,
  severity: 'info', // success, info, warning, error
  duration: 6000,
  component: null, // Custom React component to render
  component_props: null // Props to pass to the custom component
})

export function notification_reducer(
  state = new NotificationState(),
  { payload, type }
) {
  switch (type) {
    case notification_action_types.SHOW_NOTIFICATION:
      return state.merge({
        key: payload.key,
        message: payload.message,
        severity: payload.severity,
        duration: payload.duration,
        component: payload.component,
        component_props: payload.component_props
      })

    case notification_action_types.HIDE_NOTIFICATION:
      return state.merge({
        key: null,
        message: null,
        component: null,
        component_props: null
      })

    default:
      return state
  }
}
