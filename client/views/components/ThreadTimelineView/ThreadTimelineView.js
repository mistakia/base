import React from 'react'
import { useSelector } from 'react-redux'
import { Box } from '@mui/material'

import { get_threads_state } from '@core/threads/selectors'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout.js'

import ThreadHeader from './ThreadHeader'
import TimelineList from './TimelineList'
import './Timeline.styl'

const ThreadTimelineView = () => {
  const threads_state = useSelector(get_threads_state)
  const selected_thread_data = threads_state.get('selected_thread_data')
  const is_loading_thread = threads_state.get('is_loading_thread')
  const thread_error = threads_state.get('thread_error')

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

  const leftContent = <TimelineList timeline={timeline_to_display} />

  const rightContent = <ThreadHeader metadata={metadata} />

  return (
    <Box sx={{ maxWidth: '1400px', margin: '0 auto' }}>
      <TwoColumnLayout
        left_content={leftContent}
        right_content={rightContent}
        left_column_width={8}
        right_column_width={4}
        container_padding={0}
        sticky_right={true}
      />
    </Box>
  )
}

export default ThreadTimelineView
