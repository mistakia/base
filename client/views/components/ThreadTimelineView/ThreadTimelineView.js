import React from 'react'
import { useSelector } from 'react-redux'
import { Box, useMediaQuery } from '@mui/material'
import { useNavigate, useLocation } from 'react-router-dom'

import {
  get_thread_cache_data,
  get_thread_loading_state
} from '@core/threads/selectors'
import { get_active_session_for_thread } from '@core/active-sessions/selectors'
import { COLORS } from '@theme/colors.js'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout.js'
import PathBreadcrumb from '@components/PathBreadcrumb/PathBreadcrumb.js'
import SharedViewBadge from '@components/SharedViewBadge/SharedViewBadge.js'
import { extract_working_directory } from '@views/utils/thread-metadata-extractor.js'

import ThreadHeader from './ThreadHeader'
import TimelineList from './TimelineList'
import './Timeline.styl'

const ThreadTimelineView = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const current_path = location.pathname
  const is_mobile = useMediaQuery('(max-width: 991px)')
  const is_mobile_breadcrumb = useMediaQuery('(max-width: 768px)')

  // Extract thread ID from path like /thread/abc123
  const thread_id = current_path.startsWith('/thread/')
    ? current_path.split('/')[2]
    : null

  const thread_data = useSelector((state) =>
    get_thread_cache_data(state, thread_id)
  )
  const loading_state = useSelector((state) =>
    get_thread_loading_state(state, thread_id)
  )
  const is_loading_thread = loading_state?.get('is_loading') || false
  const thread_error = loading_state?.get('error') || null

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

  const timeline_to_display = thread_data && thread_data.get('timeline')
  const metadata = thread_data
  const has_timeline_entries =
    Array.isArray(timeline_to_display) && timeline_to_display.length > 0

  // Extract working directory for link processing. Safe to call with an
  // empty/unavailable metadata -- extractor returns defaults.
  const working_directory = extract_working_directory(metadata)

  if (!thread_data) {
    return (
      <Box sx={{ p: 3 }}>
        <span>No thread data available</span>
      </Box>
    )
  }

  const left_content = has_timeline_entries ? (
    <TimelineList
      timeline={timeline_to_display}
      working_directory={working_directory.path}
      active_session={active_session}
    />
  ) : (
    <Box sx={{ p: 3 }}>
      <span>No timeline data available</span>
    </Box>
  )

  const right_content = (
    <Box>
      <ThreadHeader
        metadata={metadata}
        thread_id={thread_id}
        collapsible={is_mobile}
        default_collapsed={is_mobile}
      />
      <SharedViewBadge />
    </Box>
  )

  return (
    <Box sx={{ maxWidth: '1100px', margin: '0 auto' }}>
      {!is_mobile_breadcrumb && (
        <PathBreadcrumb path={current_path} on_navigate={handle_navigate} />
      )}
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
