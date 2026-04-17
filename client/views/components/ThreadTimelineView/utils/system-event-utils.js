/**
 * Utility functions for filtering and classifying system events in thread timelines.
 *
 * System events with type="system" are filtered to only
 * display meaningful events to users:
 * - Warnings (level="warning"): Model limits, hook failures
 * - Errors (level="error"): Critical failures
 * - Interrupts (is_interrupt=true): User-initiated interruptions
 * - State transitions (system_type="state_change"): Lifecycle and execution state changes
 * - Error events (system_type="error"): Error notifications
 */

/**
 * Determine if a system event should be displayed in the timeline UI.
 *
 * @param {Object} event - Timeline event object
 * @returns {boolean} - True if the event should be displayed
 */
export const is_displayable_system_event = (event) => {
  if (event?.type !== 'system') {
    return false
  }

  const metadata = event.metadata || {}

  // Display user interrupts
  if (metadata.is_interrupt === true) {
    return true
  }

  // Display warnings and errors
  const level = metadata.level
  if (level === 'warning' || level === 'error') {
    return true
  }

  // Display task notifications (queue operations)
  if (metadata.unsupported_message_type === 'queue-operation') {
    return true
  }

  if (event.system_type === 'state_change' || event.system_type === 'error') {
    return true
  }

  // Hide all other system events (info, suggestion, null, unsupported)
  return false
}

/**
 * Get display properties for a system event.
 *
 * @param {Object} event - Timeline event object with type="system"
 * @returns {Object} - Display properties { label, severity }
 */
export const get_system_event_display = (event) => {
  const metadata = event.metadata || {}
  const content = event.content || ''

  // User interrupt
  if (metadata.is_interrupt === true) {
    return {
      label: content || 'Request interrupted',
      severity: 'interrupt'
    }
  }

  // Error level
  if (metadata.level === 'error') {
    return {
      label: content || 'Error',
      severity: 'error'
    }
  }

  // Warning level
  if (metadata.level === 'warning') {
    return {
      label: content || 'Warning',
      severity: 'warning'
    }
  }

  // Task notification (queue operation)
  if (metadata.unsupported_message_type === 'queue-operation') {
    return {
      label: content,
      severity: 'tasknotification'
    }
  }

  if (event.system_type === 'error') {
    return {
      label: content || 'Error',
      severity: 'error'
    }
  }

  if (event.system_type === 'state_change') {
    return {
      label: content || 'State change',
      severity: 'info'
    }
  }

  // Fallback for any other displayed system event
  return {
    label: content || 'System event',
    severity: 'info'
  }
}
