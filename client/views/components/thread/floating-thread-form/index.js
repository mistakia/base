import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { thread_actions } from '@core/thread/actions'
import { thread_selectors } from '@core/thread'
import { get_app } from '@core/app'

import FloatingThreadForm from './floating-thread-form'

const map_state_to_props = createSelector(
  thread_selectors.get_inference_providers,
  thread_selectors.get_inference_providers_loading_state,
  thread_selectors.get_threads_loading_state,
  get_app,
  (providers, providers_state, thread_state, app) => ({
    providers,
    providers_loading: providers_state.loading,
    providers_error: providers_state.error,
    thread_loading: thread_state.current_thread_loading,
    thread_error: thread_state.current_thread_error,
    user_id: app.get('user_id')
  })
)

const map_dispatch_to_props = {
  load_providers: thread_actions.load_inference_providers,
  create_thread: thread_actions.create_thread
}

export default connect(
  map_state_to_props,
  map_dispatch_to_props
)(FloatingThreadForm)
