import { connect } from 'react-redux'

import { get_app } from '@core/app'
import {
  directories_actions,
  get_directories_for_type,
  get_directory_state,
  get_expanded_directories
} from '@core/directory'

import Menu from './menu'

const map_state_to_props = (state) => {
  const app = get_app(state)
  const user_state = get_directories_for_type(state, 'user')
  const system_state = get_directories_for_type(state, 'system')
  const expanded_directories = get_expanded_directories(state)

  return {
    username: app.username,
    public_key: app.public_key,
    is_authenticated: !!app.public_key,
    user_directories:
      user_state && user_state.directories ? user_state.directories : [],
    system_directories:
      system_state && system_state.directories ? system_state.directories : [],
    expanded_directories,
    get_directory_state_fn: (type, path) =>
      get_directory_state(state, type, path)
  }
}

const map_dispatch_to_props = {
  load_directories: directories_actions.load_directories,
  toggle_directory: directories_actions.toggle_directory
}

export default connect(map_state_to_props, map_dispatch_to_props)(Menu)
