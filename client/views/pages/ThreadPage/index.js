import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { threads_actions, get_threads_state } from '@core/threads/index.js'

import ThreadPage from './ThreadPage.js'

const map_state_to_props = createSelector(
  get_threads_state,
  (threads_state) => ({
    thread_data: threads_state.get('selected_thread_data'),
    is_loading: threads_state.get('is_loading_thread'),
    error: threads_state.get('thread_error')
  })
)

const map_dispatch_to_props = {
  load_thread: threads_actions.load_thread,
  select_thread: threads_actions.select_thread,
  clear_selected_thread: threads_actions.clear_selected_thread
}

export default connect(map_state_to_props, map_dispatch_to_props)(ThreadPage)
