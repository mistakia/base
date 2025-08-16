import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { threads_actions, get_threads_state } from '@core/threads/index.js'
import { get_directory_state } from '@core/directory'

import Homepage from './Homepage.js'

const map_state_to_props = createSelector(
  [get_threads_state, get_directory_state],
  (threads_state, directory_state) => ({
    threads: threads_state.get('threads'),
    is_loading_threads: threads_state.get('is_loading_threads'),
    directory_markdown:
      directory_state.get('directory_markdown_file')?.content || null,
    is_loading_directory_markdown: directory_state.get(
      'is_loading_directory_markdown'
    ),
    directory_markdown_error: directory_state.get('directory_markdown_error')
  })
)

const map_dispatch_to_props = {
  load_threads: threads_actions.load_threads
}

export default connect(map_state_to_props, map_dispatch_to_props)(Homepage)
