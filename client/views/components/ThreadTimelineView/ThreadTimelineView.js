import React from 'react'
import { useSelector } from 'react-redux'
import { Box } from '@mui/material'
import { useNavigate, useLocation } from 'react-router-dom'

import { get_threads_state } from '@core/threads/selectors'
import { get_active_session_for_thread } from '@core/active-sessions/selectors'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout.js'
import PathBreadcrumb from '@components/PathBreadcrumb/PathBreadcrumb.js'
import FileActions from '@components/FileActions/index.js'
import { extract_working_directory } from '@views/utils/thread-metadata-extractor.js'

import ThreadHeader from './ThreadHeader'
import TimelineList from './TimelineList'
import './Timeline.styl'

const ThreadTimelineView = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const current_path = location.pathname
  const threads_state = useSelector(get_threads_state)
  const selected_thread_data = threads_state.get('selected_thread_data')
  const is_loading_thread = threads_state.get('is_loading_thread')
  const thread_error = threads_state.get('thread_error')

  // Extract thread ID from path like /thread/abc123
  const thread_id = current_path.startsWith('/thread/')
    ? current_path.split('/')[2]
    : null
  const thread_path = thread_id ? `/thread/${thread_id}/metadata.json` : null

  // Get active session for this thread if it exists
  const active_session = useSelector((state) =>
    get_active_session_for_thread(state, thread_id)
  )

  const handle_navigate = (path) => {
    navigate(path || '/')
  }

  if (is_loading_thread) {
    return (
      <Box sx={{ p: 3 }}>
        <span>Loading thread...</span>
      </Box>
    )
  }

  if (thread_error) {
    return (
      <Box sx={{ p: 3 }}>
        <span style={{ color: '#f44336' }}>
          Error loading thread: {thread_error}
        </span>
      </Box>
    )
  }

  const timeline_to_display =
    selected_thread_data && selected_thread_data.get('timeline')
  const metadata = selected_thread_data

  if (!timeline_to_display || timeline_to_display.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <span>No timeline data available</span>
      </Box>
    )
  }

  // Extract working directory for link processing
  const working_directory = extract_working_directory(metadata)

  const left_content = (
    <TimelineList
      timeline={timeline_to_display}
      working_directory={working_directory.path}
      active_session={active_session}
    />
  )

  const right_content = (
    <Box>
      <ThreadHeader metadata={metadata} thread_id={thread_id} />
      {selected_thread_data && (
        <FileActions
          path={thread_path}
          title='Open thread metadata in Cursor'
        />
      )}
    </Box>
  )

  return (
    <Box sx={{ maxWidth: '1100px', margin: '0 auto' }}>
      <PathBreadcrumb path={current_path} on_navigate={handle_navigate} />
      <TwoColumnLayout
        left_content={left_content}
        right_content={right_content}
        left_column_width={8}
        right_column_width={4}
        container_padding={0}
        sticky_right={true}
      />
    </Box>
  )
}

export default ThreadTimelineView
