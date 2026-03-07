import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Box } from '@mui/material'
import { useNavigate, useLocation } from 'react-router-dom'

import { get_threads_state } from '@core/threads/selectors'
import { get_active_session_for_thread } from '@core/active-sessions/selectors'
import { COLORS } from '@theme/colors.js'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout.js'
import PathBreadcrumb from '@components/PathBreadcrumb/PathBreadcrumb.js'
import FileActions from '@components/FileActions/index.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
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
  const [is_file_browser_visible, set_is_file_browser_visible] = useState(false)

  // Extract thread ID from path like /thread/abc123
  const thread_id = current_path.startsWith('/thread/')
    ? current_path.split('/')[2]
    : null

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
        <span style={{ color: COLORS.error }}>
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

  // Keyboard shortcut handler for toggling file browser (Cmd/Ctrl+B)
  useEffect(() => {
    const handle_keydown = (event) => {
      // Cmd/Ctrl+B to toggle file browser
      if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault()
        set_is_file_browser_visible((prev) => !prev)
      }
    }

    document.addEventListener('keydown', handle_keydown)
    return () => document.removeEventListener('keydown', handle_keydown)
  }, [])

  const toggle_file_browser = () => {
    set_is_file_browser_visible((prev) => !prev)
  }

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
        <FileActions>
          <button
            className='file-browser-toggle-button'
            onClick={toggle_file_browser}
            title='Toggle file browser (⌘B / Ctrl+B)'
            aria-label={
              is_file_browser_visible
                ? 'Hide file browser'
                : 'Show file browser'
            }>
            {is_file_browser_visible ? 'hide files' : 'show files'}
          </button>
        </FileActions>
      )}
      {is_file_browser_visible && (
        <div className='file-browser-container'>
          <FileSystemBrowser />
        </div>
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
