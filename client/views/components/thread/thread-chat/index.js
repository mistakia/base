import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import { thread_selectors, thread_actions } from '@core/thread'

import ThreadChat from './thread-chat'

// Selectors to get data from the core thread state
const { get_threads_loading_state, get_thread_messages } = thread_selectors

// Selector for the props needed by ThreadChat
const map_state_to_props = createSelector(
  [
    (state, props) => props.thread_id,
    (state, props) => thread_selectors.get_thread_by_id(state, props.thread_id),
    get_threads_loading_state
  ],
  (thread_id, current_thread, loading_state) => {
    const messages = current_thread ? get_thread_messages(current_thread) : []

    return {
      thread_id,
      thread_state: current_thread ? current_thread.get('thread_state') : null,
      messages,
      is_loading: loading_state.current_thread_loading,
      error: loading_state.current_thread_error,
      last_updated: current_thread ? current_thread.get('updated_at') : null
    }
  }
)

const map_dispatch_to_props = {
  load_thread: thread_actions.load_thread,
  add_message: thread_actions.add_message,
  update_status: thread_actions.update_thread_state
}

export default connect(map_state_to_props, map_dispatch_to_props)(ThreadChat)
