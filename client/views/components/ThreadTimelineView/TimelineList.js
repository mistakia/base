import React, { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'

import { COLORS } from '@theme/colors.js'
import TimelineEvent from './TimelineEvent'
import CollapsibleEventGroup from './CollapsibleEventGroup'
import { group_tool_entries } from './utils/group-tool-entries'

// Length threshold for considering an assistant message as "notable"
const NOTABLE_ASSISTANT_MESSAGE_LENGTH = 500

// Auto-scroll configuration
const SCROLL_THRESHOLD_PX = 100 // Distance from bottom to consider "near bottom"
const AUTO_SCROLL_DELAY_MS = 100 // Delay before auto-scrolling after timeline update
const SMOOTH_SCROLL_COMPLETE_MS = 500 // Time to wait for smooth scroll to complete

/**
 * Calculate the content length of a timeline event message
 */
const get_message_content_length = (content) => {
  if (typeof content === 'string') {
    return content.length
  }
  return JSON.stringify(content).length
}

/**
 * Check if an entry is a "notable" event worthy of display in notable events view
 * - All user messages are notable
 * - Assistant messages are notable if they exceed the length threshold
 * - Tool pairs and other events are not notable
 */
const is_notable_event = (entry) => {
  if (entry.type === 'tool_pair') {
    return false
  }

  const timeline_event = entry.timeline_event
  if (timeline_event?.type !== 'message') {
    return false
  }

  if (timeline_event.role === 'user') {
    return true
  }

  if (timeline_event.role === 'assistant') {
    const content_length = get_message_content_length(timeline_event.content)
    return content_length >= NOTABLE_ASSISTANT_MESSAGE_LENGTH
  }

  return false
}

// Live Session Indicator component
const LIVE_INDICATOR_STYLES = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    marginLeft: '32px',
    marginTop: '8px',
    marginBottom: '8px',
    borderRadius: '8px',
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    border: '1px solid rgba(76, 175, 80, 0.2)'
  },
  dot: {
    fontSize: '12px',
    color: COLORS.success,
    animation: 'pulse 1.5s ease-in-out infinite'
  },
  text: {
    fontSize: '13px',
    fontWeight: 500,
    color: COLORS.success
  }
}

const LiveSessionIndicator = ({ active_session }) => {
  if (!active_session) return null

  const status = active_session.get
    ? active_session.get('status')
    : active_session.status
  const is_active = status === 'active'

  if (!is_active) return null

  return (
    <Box sx={LIVE_INDICATOR_STYLES.container}>
      <FiberManualRecordIcon sx={LIVE_INDICATOR_STYLES.dot} />
      <span style={LIVE_INDICATOR_STYLES.text}>Live session in progress</span>
    </Box>
  )
}

LiveSessionIndicator.propTypes = {
  active_session: PropTypes.object
}

const TimelineList = ({
  timeline,
  working_directory = null,
  include_sidechain = false,
  hide_timeline_dot = false,
  hide_timeline_line = false,
  active_session = null
}) => {
  /**
   * View mode state:
   * - 'default': Shows first user messages, last assistant message, everything between collapsed
   * - 'notable_events': Shows all notable events (user messages + long assistant messages)
   *                     with smaller collapsible sections for non-notable events between them
   */
  const [view_mode, set_view_mode] = useState('default')
  const [auto_scroll, set_auto_scroll] = useState(false)
  const [show_scroll_button, set_show_scroll_button] = useState(false)
  const timeline_container_ref = useRef(null)

  // Helper to get timeline length (handles both arrays and Immutable Lists)
  const get_timeline_length = useCallback((timeline_data) => {
    if (Array.isArray(timeline_data)) return timeline_data.length
    return timeline_data?.size || timeline_data?.length || 0
  }, [])

  // Track previous timeline length for detecting new entries
  const last_timeline_length_ref = useRef(get_timeline_length(timeline))

  const timeline_main = React.useMemo(() => {
    if (!Array.isArray(timeline)) return []
    if (include_sidechain) return timeline
    return timeline.filter((evt) => !evt?.provider_data?.is_sidechain)
  }, [timeline, include_sidechain])

  const grouped_entries = group_tool_entries(timeline_main)

  // find the last assistant message entry index (by original timeline index)
  const last_assistant_entry_index = (() => {
    let last_index = null
    timeline_main.forEach((event, index) => {
      if (event && event.type === 'message' && event.role === 'assistant') {
        last_index = index
      }
    })
    return last_index
  })()

  // Find last consecutive user message and last assistant message in grouped entries
  const find_collapsible_boundaries = () => {
    let last_consecutive_user_message_group_index = null
    let last_assistant_message_group_index = null
    let consecutive_user_messages_ended = false

    grouped_entries.forEach((entry, group_index) => {
      if (entry.type === 'tool_pair') {
        // Tool pairs indicate the end of consecutive user messages
        consecutive_user_messages_ended = true
        return
      }

      // Regular event - check if it's a message
      const timeline_event = entry.timeline_event
      if (timeline_event?.type === 'message') {
        if (timeline_event.role === 'user') {
          if (!consecutive_user_messages_ended) {
            // Still in consecutive user messages at the start
            last_consecutive_user_message_group_index = group_index
          }
        } else if (timeline_event.role === 'assistant') {
          // Any assistant message ends consecutive user messages
          consecutive_user_messages_ended = true

          if (entry.index === last_assistant_entry_index) {
            last_assistant_message_group_index = group_index
          }
        }
      } else {
        // Any non-message event ends consecutive user messages
        consecutive_user_messages_ended = true
      }
    })

    return {
      last_consecutive_user_message_group_index,
      last_assistant_message_group_index
    }
  }

  const {
    last_consecutive_user_message_group_index,
    last_assistant_message_group_index
  } = find_collapsible_boundaries()

  /**
   * Group collapsible entries into sections for notable events view.
   * Creates alternating sections of notable events and collapsible groups.
   * Returns array of: { type: 'notable', event, original_index } | { type: 'collapsible', events }
   */
  const group_by_notable_events = (entries) => {
    const sections = []
    let hidden_events_buffer = []

    entries.forEach((entry, index) => {
      if (is_notable_event(entry)) {
        // Flush any hidden events as a collapsible section
        if (hidden_events_buffer.length > 0) {
          sections.push({ type: 'collapsible', events: hidden_events_buffer })
          hidden_events_buffer = []
        }
        sections.push({ type: 'notable', event: entry, original_index: index })
      } else {
        hidden_events_buffer.push(entry)
      }
    })

    // Flush remaining hidden events
    if (hidden_events_buffer.length > 0) {
      sections.push({ type: 'collapsible', events: hidden_events_buffer })
    }

    return sections
  }

  // Split entries into three sections: before, collapsible, after
  const entries_before_collapsible =
    last_consecutive_user_message_group_index !== null
      ? grouped_entries.slice(0, last_consecutive_user_message_group_index + 1)
      : []

  const collapsible_entries =
    last_consecutive_user_message_group_index !== null &&
    last_assistant_message_group_index !== null
      ? grouped_entries.slice(
          last_consecutive_user_message_group_index + 1,
          last_assistant_message_group_index
        )
      : []

  const entries_after_collapsible =
    last_assistant_message_group_index !== null
      ? grouped_entries.slice(last_assistant_message_group_index)
      : grouped_entries

  const should_use_collapsible = collapsible_entries.length > 0

  // ============================================================================
  // AUTO-SCROLL UTILITIES
  // ============================================================================

  /**
   * Get the scrollable container element (.page-layout or window fallback)
   */
  const get_scroll_container = useCallback(() => {
    return document.querySelector('.page-layout') || window
  }, [])

  /**
   * Get scroll metrics from a container
   */
  const get_scroll_metrics = useCallback((container) => {
    if (container === window) {
      return {
        scroll_height: document.documentElement.scrollHeight,
        scroll_top: window.pageYOffset || document.documentElement.scrollTop,
        client_height: window.innerHeight
      }
    }
    return {
      scroll_height: container.scrollHeight,
      scroll_top: container.scrollTop,
      client_height: container.clientHeight
    }
  }, [])

  /**
   * Check if user is near the bottom of the scrollable container
   */
  const is_near_bottom = useCallback(() => {
    const container = get_scroll_container()
    const { scroll_height, scroll_top, client_height } =
      get_scroll_metrics(container)

    const distance_from_bottom = scroll_height - scroll_top - client_height
    const is_scrollable = scroll_height > client_height

    return is_scrollable && distance_from_bottom < SCROLL_THRESHOLD_PX
  }, [get_scroll_container, get_scroll_metrics])

  /**
   * Scroll container to bottom with smooth behavior
   */
  const scroll_to_bottom = useCallback(
    (behavior = 'smooth') => {
      const container = get_scroll_container()
      const { scroll_height } = get_scroll_metrics(container)

      if (container === window) {
        window.scrollTo({
          top: scroll_height,
          left: 0,
          behavior
        })
      } else {
        container.scrollTo({
          top: scroll_height,
          left: 0,
          behavior
        })
      }
    },
    [get_scroll_container, get_scroll_metrics]
  )

  // ============================================================================
  // AUTO-SCROLL STATE MANAGEMENT
  // ============================================================================

  /**
   * Handle scroll events to enable/disable auto_scroll based on scroll position
   */
  useEffect(() => {
    const container = get_scroll_container()

    const handle_scroll = () => {
      const near_bottom = is_near_bottom()
      set_auto_scroll((prev) => {
        // Only update if state would change
        if (near_bottom && !prev) return true
        if (!near_bottom && prev) return false
        return prev
      })
    }

    container.addEventListener('scroll', handle_scroll, { passive: true })
    return () => container.removeEventListener('scroll', handle_scroll)
  }, [is_near_bottom, get_scroll_container])

  /**
   * Auto-scroll when timeline updates and auto_scroll is enabled
   */
  useEffect(() => {
    const current_length = get_timeline_length(timeline)
    const previous_length = last_timeline_length_ref.current

    // Only auto-scroll if timeline has new entries and auto_scroll is enabled
    if (current_length > previous_length && auto_scroll) {
      // Delay to ensure DOM has updated with new content
      const timeout_id = setTimeout(() => {
        scroll_to_bottom()
      }, AUTO_SCROLL_DELAY_MS)

      return () => clearTimeout(timeout_id)
    }

    last_timeline_length_ref.current = current_length
  }, [timeline, auto_scroll, scroll_to_bottom, get_timeline_length])

  /**
   * Handle floating button click - scroll to bottom and enable auto_scroll
   */
  const handle_scroll_button_click = useCallback(() => {
    set_auto_scroll(true)
    scroll_to_bottom('smooth')

    // Verify we reached the bottom after smooth scroll completes
    // If not, do a final instant scroll to ensure we're there
    const container = get_scroll_container()
    if (container !== window) {
      setTimeout(() => {
        const { scroll_height, scroll_top, client_height } =
          get_scroll_metrics(container)
        const distance_from_bottom = scroll_height - scroll_top - client_height

        if (distance_from_bottom > 10) {
          scroll_to_bottom('auto')
        }
        set_auto_scroll(true)
      }, SMOOTH_SCROLL_COMPLETE_MS)
    }
  }, [get_scroll_container, get_scroll_metrics, scroll_to_bottom])

  /**
   * Show/hide floating scroll button based on scroll position
   */
  useEffect(() => {
    const container = get_scroll_container()

    const update_button_visibility = () => {
      set_show_scroll_button(!is_near_bottom())
    }

    // Initial check
    update_button_visibility()

    // Check after DOM is ready
    const initial_timeout = setTimeout(update_button_visibility, 100)
    const layout_timeout = setTimeout(update_button_visibility, 500)

    // Listen to scroll and resize events
    container.addEventListener('scroll', update_button_visibility, {
      passive: true
    })
    window.addEventListener('resize', update_button_visibility, {
      passive: true
    })

    // Periodic check as fallback
    const interval_id = setInterval(update_button_visibility, 1000)

    return () => {
      clearTimeout(initial_timeout)
      clearTimeout(layout_timeout)
      clearInterval(interval_id)
      container.removeEventListener('scroll', update_button_visibility)
      window.removeEventListener('resize', update_button_visibility)
    }
  }, [is_near_bottom, get_scroll_container])

  // Helper function to render a single timeline event
  const render_timeline_event = React.useCallback(
    (entry, index) => {
      const entry_key = `${entry.type}-${entry.index || index}`

      if (entry.type === 'tool_pair') {
        // For tool pairs, use the tool call event as the main event
        const timeline_event = entry.tool_call_event
        const tool_name = timeline_event?.content?.tool_name
        const hide_dot_for_main_subthread = tool_name === 'Task'

        return (
          <TimelineEvent
            key={entry_key}
            timeline_event={timeline_event}
            tool_result_event={entry.tool_result_event}
            is_last_assistant_message={false}
            timeline={timeline}
            working_directory={working_directory}
            hide_timeline_dot={hide_dot_for_main_subthread}
            render_nested_timeline={(nested) => (
              <TimelineList
                timeline={nested}
                working_directory={working_directory}
                include_sidechain={true}
                hide_timeline_dot={false}
                hide_timeline_line={false}
              />
            )}
          />
        )
      }

      // Regular events
      const timeline_event = entry.timeline_event
      const is_last_assistant_message =
        timeline_event &&
        timeline_event.type === 'message' &&
        timeline_event.role === 'assistant' &&
        entry.index === last_assistant_entry_index

      return (
        <TimelineEvent
          key={entry_key}
          timeline_event={timeline_event}
          is_last_assistant_message={is_last_assistant_message}
          timeline={timeline}
          working_directory={working_directory}
          hide_timeline_dot={hide_timeline_dot}
          render_nested_timeline={(nested) => (
            <TimelineList
              timeline={nested}
              working_directory={working_directory}
              include_sidechain={true}
              hide_timeline_dot={false}
              hide_timeline_line={false}
            />
          )}
        />
      )
    },
    [timeline, last_assistant_entry_index, hide_timeline_dot, working_directory]
  )

  /**
   * Render a single section from the notable events view
   */
  const render_notable_section = (section, section_index) => {
    if (section.type === 'notable') {
      return render_timeline_event(
        section.event,
        entries_before_collapsible.length + section.original_index
      )
    }

    if (section.type === 'collapsible') {
      // If only one event, render it directly without collapsing
      if (section.events.length === 1) {
        return render_timeline_event(
          section.events[0],
          entries_before_collapsible.length + section_index
        )
      }

      // Multiple events: render as collapsible group
      return (
        <CollapsibleEventGroup
          key={`collapsible-${section_index}`}
          events={section.events}
          renderEvent={render_timeline_event}
          hideTimelineDot={hide_timeline_dot}
          hideTimelineLine={hide_timeline_line}
          mode='notable_events'
        />
      )
    }

    return null
  }

  // Render content based on view mode
  const render_content = () => {
    if (view_mode === 'default') {
      // Default view: first user messages, last assistant, everything between collapsed
      if (should_use_collapsible) {
        return (
          <>
            {/* Render entries before collapsible section */}
            {entries_before_collapsible.map((entry, index) =>
              render_timeline_event(entry, index)
            )}

            {/* Render collapsible section with mode="default" */}
            <CollapsibleEventGroup
              events={collapsible_entries}
              renderEvent={render_timeline_event}
              hideTimelineDot={hide_timeline_dot}
              hideTimelineLine={hide_timeline_line}
              mode='default'
              onExpand={() => set_view_mode('notable_events')}
            />

            {/* Render entries after collapsible section */}
            {entries_after_collapsible.map((entry, index) =>
              render_timeline_event(
                entry,
                index +
                  entries_before_collapsible.length +
                  collapsible_entries.length
              )
            )}
          </>
        )
      } else {
        return grouped_entries.map((entry, index) =>
          render_timeline_event(entry, index)
        )
      }
    } else if (view_mode === 'notable_events') {
      // Notable events view: show all notable events with collapsible sections between them
      const notable_sections = group_by_notable_events(collapsible_entries)

      return (
        <>
          {/* Render entries before collapsible section */}
          {entries_before_collapsible.map((entry, index) =>
            render_timeline_event(entry, index)
          )}

          {/* Render notable sections (alternating notable events and collapsible groups) */}
          {notable_sections.map(render_notable_section)}

          {/* Render entries after collapsible section */}
          {entries_after_collapsible.map((entry, index) =>
            render_timeline_event(
              entry,
              index +
                entries_before_collapsible.length +
                collapsible_entries.length
            )
          )}
        </>
      )
    }
  }

  return (
    <Box sx={{ py: 3, position: 'relative' }} ref={timeline_container_ref}>
      {/* Timeline line */}
      {!hide_timeline_line && (
        <Box
          sx={{
            position: 'absolute',
            left: '15px',
            top: '30px',
            bottom: '20px',
            width: '2px',
            backgroundColor: 'var(--timeline-accent)',
            zIndex: 0
          }}
        />
      )}

      {/* Render timeline events */}
      {render_content()}

      {/* Live session indicator - only show for top-level timeline with active session */}
      {!include_sidechain && active_session && (
        <LiveSessionIndicator active_session={active_session} />
      )}

      {/* Floating scroll to bottom button - only show for top-level timeline */}
      {show_scroll_button && !include_sidechain && (
        <div
          className='timeline-scroll-button'
          onClick={handle_scroll_button_click}
          aria-label='scroll to bottom'
          role='button'
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handle_scroll_button_click()
            }
          }}>
          <svg
            width='24'
            height='24'
            viewBox='0 0 24 24'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'>
            <path
              d='M7 13l5 5 5-5M7 6l5 5 5-5'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
        </div>
      )}
    </Box>
  )
}

TimelineList.propTypes = {
  timeline: PropTypes.array.isRequired,
  working_directory: PropTypes.string,
  include_sidechain: PropTypes.bool,
  hide_timeline_dot: PropTypes.bool,
  hide_timeline_line: PropTypes.bool,
  active_session: PropTypes.object
}

export default TimelineList
