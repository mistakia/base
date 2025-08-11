import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux'
import { Box } from '@mui/material'

import { threads_actions } from '@core/threads/actions'
import { get_threads_state } from '@core/threads/selectors'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout.js'

import ThreadHeader from './ThreadHeader'
import TimelineList from './TimelineList'
import './Timeline.styl'

const ThreadTimelineView = ({ thread_id, timeline_data }) => {
  const dispatch = useDispatch()

  const threads_state = useSelector(get_threads_state)
  const timeline = threads_state.get('selected_thread_timeline')
  const metadata = threads_state.get('selected_thread_metadata')
  const is_loading_timeline = threads_state.get('is_loading_timeline')
  const is_loading_metadata = threads_state.get('is_loading_metadata')
  const timeline_error = threads_state.get('timeline_error')
  const metadata_error = threads_state.get('metadata_error')

  useEffect(() => {
    if (timeline_data) {
      // If timeline data is provided as prop, we don't need to fetch
      return
    }

    if (thread_id) {
      dispatch(threads_actions.load_thread_timeline(thread_id))
      dispatch(threads_actions.load_thread_metadata(thread_id))
    }
  }, [dispatch, thread_id, timeline_data])

  if (is_loading_timeline) {
    return (
      <Box sx={{ p: 3 }}>
        <span>Loading timeline...</span>
      </Box>
    )
  }

  if (timeline_error) {
    return (
      <Box sx={{ p: 3 }}>
        <span style={{ color: '#f44336' }}>
          Error loading timeline: {timeline_error}
        </span>
      </Box>
    )
  }

  const timeline_to_display = timeline_data || timeline

  if (!timeline_to_display || timeline_to_display.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <span>No timeline data available</span>
      </Box>
    )
  }

  const leftContent = <TimelineList timeline={timeline_to_display} />

  const rightContent = (
    <ThreadHeader
      metadata={metadata}
      is_loading_metadata={is_loading_metadata}
      metadata_error={metadata_error}
    />
  )

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

ThreadTimelineView.propTypes = {
  thread_id: PropTypes.string,
  timeline_data: PropTypes.array
}

export default ThreadTimelineView
