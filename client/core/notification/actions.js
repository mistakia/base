/**
 * Notification Actions
 *
 * Simple notification system for showing snackbar messages to users
 */

export const notification_action_types = {
  SHOW_NOTIFICATION: 'SHOW_NOTIFICATION',
  HIDE_NOTIFICATION: 'HIDE_NOTIFICATION'
}

export const notification_actions = {
  /**
   * Show a notification message
   *
   * @param {Object} params
   * @param {string} [params.message] - Message to display (not required if component is provided)
   * @param {string} [params.severity='info'] - Severity level: success, info, warning, error
   * @param {number} [params.duration=6000] - Auto-hide duration in ms
   * @param {string} [params.key] - Unique key for the notification (auto-generated if not provided)
   * @param {React.Component} [params.component] - Custom component to render instead of plain message
   * @param {Object} [params.component_props] - Props to pass to the custom component
   */
  show_notification: ({
    message,
    severity = 'info',
    duration = 6000,
    key,
    component,
    component_props
  }) => ({
    type: notification_action_types.SHOW_NOTIFICATION,
    payload: {
      message,
      severity,
      duration,
      key: key || `notification-${Date.now()}-${Math.random()}`,
      component,
      component_props
    }
  }),

  /**
   * Hide the current notification
   */
  hide_notification: () => ({
    type: notification_action_types.HIDE_NOTIFICATION
  })
}
