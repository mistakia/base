import { createSelector } from 'reselect'

export function get_app(state) {
  return state.get('app')
}

export const get_has_private_key = createSelector(
  [get_app],
  (app) => !!app.get('user_private_key')
)

export const get_has_valid_session = createSelector(
  [get_app],
  (app) => !!app.get('user_token')
)

export const get_authentication_state = createSelector([get_app], (app) => {
  const has_private_key = !!app.get('user_private_key')
  const has_valid_session = !!app.get('user_token')
  const is_establishing_session = app.get('is_establishing_session')

  if (!has_private_key) {
    return 'no_private_key'
  }

  if (has_private_key && !has_valid_session) {
    return is_establishing_session ? 'establishing_session' : 'no_session'
  }

  if (has_private_key && has_valid_session) {
    return 'authenticated'
  }

  return 'unknown'
})

export const get_user_permissions = createSelector([get_app], (app) => {
  return app.get('user_permissions')
})

export const get_can_create_threads = createSelector(
  [get_user_permissions],
  (permissions) => {
    if (!permissions) {
      return false
    }
    return permissions.create_threads === true
  }
)

export const get_can_resume_thread = createSelector(
  [get_app, (_, thread) => thread],
  (app, thread) => {
    if (!thread) {
      return false
    }

    const user_public_key = app.get('user_public_key')
    if (!user_public_key) {
      return false
    }

    // User can resume thread if they own it
    return thread.user_public_key === user_public_key
  }
)
