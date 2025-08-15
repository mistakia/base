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
