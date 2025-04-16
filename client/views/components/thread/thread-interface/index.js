import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { thread_actions, get_thread_messages } from '@core/thread'

import ThreadInterface from './thread-interface'

const map_state_to_props = createSelector(get_thread_messages, (messages) => ({
  messages
}))

const map_dispatch_to_props = {
  add_message: thread_actions.add_thread_message_request
}

export default connect(
  map_state_to_props,
  map_dispatch_to_props
)(ThreadInterface)
