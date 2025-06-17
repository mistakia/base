import { createSelector } from 'reselect'

export function get_users(state) {
  return state.get('users')
}

export const get_users_list = createSelector(get_users, (users) =>
  users.get('users_list')
)

export const get_users_loading = createSelector(get_users, (users) =>
  users.get('is_loading_users', false)
)

export const get_users_error = createSelector(get_users, (users) =>
  users.get('users_error')
)
