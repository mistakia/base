import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { thread_actions, get_thread_info } from '@core/thread'

import ThreadInterface from '../thread-interface'

const map_state_to_props = createSelector(get_thread_info, (info) => ({
  info
}))

const map_dispatch_to_props = {
  load_thread: thread_actions.fetch_thread_request,
  update_thread_state: thread_actions.update_thread_state_request
}

export default connect(
  map_state_to_props,
  map_dispatch_to_props
)(ThreadInterface)
