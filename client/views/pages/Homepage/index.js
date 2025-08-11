import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { threads_actions, get_threads_state } from '@core/threads/index.js'

import Homepage from './Homepage.js'

const map_state_to_props = createSelector(
  get_threads_state,
  (threads_state) => ({
    threads: threads_state.get('threads'),
    is_loading_threads: threads_state.get('is_loading_threads')
  })
)

const map_dispatch_to_props = {
  load_threads: threads_actions.load_threads
}

export default connect(map_state_to_props, map_dispatch_to_props)(Homepage)
