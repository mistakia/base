import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { thread_actions } from '@core/thread/actions'
import { thread_selectors } from '@core/thread'
import { get_app } from '@core/app/selectors'

import ThreadList from './thread-list'

const map_state_to_props = createSelector(
  thread_selectors.get_sorted_threads,
  thread_selectors.get_current_thread_id,
  thread_selectors.get_threads_loading_state,
  get_app,
  (threads, current_thread_id, loading_state, app) => ({
    threads,
    current_thread_id,
    loading: loading_state.threads_list_loading,
    error: loading_state.threads_list_error,
    user_id: app.get('user_id')
  })
)

const map_dispatch_to_props = {
  load_threads: thread_actions.load_threads
}

export default connect(map_state_to_props, map_dispatch_to_props)(ThreadList)
