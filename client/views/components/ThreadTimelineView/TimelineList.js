import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'

import TimelineEvent from './TimelineEvent'
import CollapsibleToolGroup from './CollapsibleToolGroup'
import { TaskToolGroup } from './ToolComponents/ManagementTools/TaskTool'
import SkillInvocationEvent from './SkillInvocationEvent'
import { group_tool_entries } from './utils/group-tool-entries'
import './Timeline.styl'

// Auto-scroll configuration
const SCROLL_THRESHOLD_PX = 100
const AUTO_SCROLL_DELAY_MS = 100
const SMOOTH_SCROLL_COMPLETE_MS = 500

// Entry types that should be collapsible (not always visible)
const COLLAPSIBLE_ENTRY_TYPES = new Set([
  'tool_pair',
  'task_group',
  'orphaned_result'
])

const is_collapsible_entry = (entry) => {
  if (COLLAPSIBLE_ENTRY_TYPES.has(entry.type)) return true
  // Thinking events collapse alongside tool calls
  if (entry.type === 'regular' && entry.timeline_event?.type === 'thinking')
    return true
  return false
}

const TimelineList = ({
  timeline,
  working_directory = null,
  include_sidechain = false,
  active_session = null,
  scroll_container_ref = null
}) => {
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

  const grouped_entries = useMemo(
    () => group_tool_entries(timeline_main),
    [timeline_main]
  )

  // Find the last assistant message entry index (by original timeline index)
  const last_assistant_entry_index = useMemo(() => {
    let last_index = null
    timeline_main.forEach((event, index) => {
      if (event && event.type === 'message' && event.role === 'assistant') {
        last_index = index
      }
    })
    return last_index
  }, [timeline_main])

  // Single-pass grouping: alternate between always-visible entries and collapsible tool groups
  const display_sections = useMemo(() => {
    const sections = []
    let collapsible_buffer = []

    const flush_collapsible = () => {
      if (collapsible_buffer.length > 0) {
        sections.push({ type: 'collapsible', entries: collapsible_buffer })
        collapsible_buffer = []
      }
    }

    for (const entry of grouped_entries) {
      if (is_collapsible_entry(entry)) {
        collapsible_buffer.push(entry)
      } else {
        flush_collapsible()
        sections.push({ type: 'visible', entry })
      }
    }
    flush_collapsible()

    return sections
  }, [grouped_entries])

  // ============================================================================
  // AUTO-SCROLL UTILITIES
  // ============================================================================

  /**
   * Get the scrollable container element.
   * Uses scroll_container_ref if provided (for sheet context),
   * otherwise falls back to .page-layout or window.
   */
  const get_scroll_container = useCallback(() => {
    if (scroll_container_ref?.current) return scroll_container_ref.current
    return document.querySelector('.page-layout') || window
  }, [scroll_container_ref])

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

    // Not scrollable means all content is visible - treat as "at bottom"
    if (!is_scrollable) return true

    return distance_from_bottom < SCROLL_THRESHOLD_PX
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
   * Scroll to bottom on initial timeline load and enable auto_scroll
   */
  const has_initial_scrolled_ref = useRef(false)
  useEffect(() => {
    if (has_initial_scrolled_ref.current) return
    if (!timeline || get_timeline_length(timeline) === 0) return
    has_initial_scrolled_ref.current = true
    requestAnimationFrame(() => {
      scroll_to_bottom('auto')
      set_auto_scroll(true)
    })
  }, [timeline, get_timeline_length, scroll_to_bottom])

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
      // Prefer correlation id so the row identity survives the
      // optimistic-to-persisted swap (optimistic id is transient). Fall back to
      // entry id, then to the legacy type+index for entries with no id.
      const entry_key =
        entry._prompt_correlation_id ||
        entry.prompt_correlation_id ||
        entry.id ||
        `${entry.type}-${index}`

      if (entry.type === 'skill_invocation') {
        return (
          <SkillInvocationEvent
            key={entry_key}
            skills={entry.skills}
            user_text={entry.user_text}
          />
        )
      }

      if (entry.type === 'task_group') {
        return (
          <TaskToolGroup
            key={entry_key}
            tool_pairs={entry.tool_pairs}
            timeline={timeline}
          />
        )
      }

      if (entry.type === 'tool_pair') {
        // For tool pairs, use the tool call event as the main event
        const timeline_event = entry.tool_call_event

        return (
          <TimelineEvent
            key={entry_key}
            timeline_event={timeline_event}
            tool_result_event={entry.tool_result_event}
            is_last_assistant_message={false}
            timeline={timeline}
            working_directory={working_directory}
            render_nested_timeline={(nested) => (
              <TimelineList
                timeline={nested}
                working_directory={working_directory}
                include_sidechain={true}
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
          render_nested_timeline={(nested) => (
            <TimelineList
              timeline={nested}
              working_directory={working_directory}
              include_sidechain={true}
            />
          )}
        />
      )
    },
    [timeline, last_assistant_entry_index, working_directory]
  )

  const render_content = () => {
    return display_sections.map((section, section_index) => {
      if (section.type === 'visible') {
        return render_timeline_event(section.entry, section_index)
      }

      // Collapsible tool group
      return (
        <CollapsibleToolGroup
          key={`tool-group-${section_index}`}
          entries={section.entries}
          render_event={render_timeline_event}
          group_key={`tg-${section_index}`}
        />
      )
    })
  }

  return (
    <Box
      className='timeline-list'
      sx={{ py: 3, position: 'relative' }}
      ref={timeline_container_ref}>
      {/* Render timeline events */}
      {render_content()}

      {/* Lifecycle indicator now lives at the bottom-of-thread footer
          (rendered by ThreadSheet above the composer); intentionally
          not rendered in-list to avoid stacking two indicators. */}

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
            width='16'
            height='16'
            viewBox='0 0 16 16'
            fill='none'
            xmlns='http://www.w3.org/2000/svg'>
            <path
              d='M4 9l4 4 4-4M4 3l4 4 4-4'
              stroke='currentColor'
              strokeWidth='1.5'
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
  active_session: PropTypes.object,
  scroll_container_ref: PropTypes.object
}

export default React.memo(TimelineList)
