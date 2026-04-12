import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import { threads_actions, get_threads_state } from '@core/threads/index.js'
import { tasks_actions } from '@core/tasks/actions.js'
import { get_tasks_state } from '@core/tasks/selectors.js'
import { directory_actions, get_directory_state } from '@core/directory'

import Homepage from './Homepage.js'

const map_state_to_props = createSelector(
  [get_threads_state, get_tasks_state, get_directory_state],
  (threads_state, tasks_state, directory_state) => ({
    threads: threads_state.get('threads'),
    session_created_at: threads_state.get('session_created_at'),
    is_loading_threads: threads_state.get('is_loading_threads'),
    tasks: tasks_state.get('tasks'),
    tag_visibility: tasks_state.get('tag_visibility'),
    is_loading_tasks:
      tasks_state.get('is_loading_tasks') ||
      tasks_state.get('is_fetching', false),
    directory_markdown:
      directory_state.get('directory_markdown_file')?.content || null,
    is_loading_directory_markdown: directory_state.get(
      'is_loading_directory_markdown'
    ),
    directory_markdown_error: directory_state.get('directory_markdown_error')
  })
)

const map_dispatch_to_props = {
  load_threads: threads_actions.load_threads,
  load_tasks: tasks_actions.load_tasks,
  load_directory_markdown: directory_actions.load_directory_markdown
}

export default connect(map_state_to_props, map_dispatch_to_props)(Homepage)
