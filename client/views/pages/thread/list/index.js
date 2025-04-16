import { connect } from 'react-redux'

import { thread_actions } from '@core/thread/actions'

import ThreadsListPage from './list-page'

const map_dispatch_to_props = {
  load_threads: thread_actions.load_threads
}

export default connect(null, map_dispatch_to_props)(ThreadsListPage)
