import { put } from 'redux-saga/effects'

import { notification_actions } from './actions'

/**
 * Show a success notification
 *
 * @param {string} message - Message to display
 */
export function* show_success_notification(message) {
  yield put(
    notification_actions.show_notification({
      message,
      severity: 'success',
      duration: 6000
    })
  )
}

/**
 * Show an info notification
 *
 * @param {string} message - Message to display
 */
export function* show_info_notification(message) {
  yield put(
    notification_actions.show_notification({
      message,
      severity: 'info',
      duration: 6000
    })
  )
}

/**
 * Show a warning notification
 *
 * @param {string} message - Message to display
 */
export function* show_warning_notification(message) {
  yield put(
    notification_actions.show_notification({
      message,
      severity: 'warning',
      duration: 8000
    })
  )
}

/**
 * Show an error notification
 *
 * @param {string} message - Message to display
 */
export function* show_error_notification(message) {
  yield put(
    notification_actions.show_notification({
      message,
      severity: 'error',
      duration: 10000
    })
  )
}
