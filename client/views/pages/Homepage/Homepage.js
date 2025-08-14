import React, { useState, useEffect, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import ImmutablePropTypes from 'react-immutable-proptypes'
import { Link, useNavigate } from 'react-router-dom'

import PageLayout from '@views/layout/PageLayout.js'
import FileSystemBrowser from '@components/FileSystemBrowser/index.js'
import Thread from '@components/Thread/index.js'

import './Homepage.styl'

const Homepage = ({ threads, is_loading_threads, load_threads }) => {
  const [cards_per_row, set_cards_per_row] = useState(4) // Default assumption
  const [focused_index, set_focused_index] = useState(0)
  const grid_ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    load_threads()
  }, [load_threads])

  // Reset focus when threads change
  useEffect(() => {
    if (threads.size > 0) {
      set_focused_index(0)
    }
  }, [threads.size])

  const calculate_cards_per_row = useCallback(() => {
    if (!grid_ref.current) return

    const container_width = grid_ref.current.offsetWidth
    const card_width = 200
    const gap = 16

    const cards_per_row = Math.floor(
      (container_width + gap) / (card_width + gap)
    )
    set_cards_per_row(Math.max(1, cards_per_row))
  }, [])

  useEffect(() => {
    calculate_cards_per_row()

    const handle_resize = () => calculate_cards_per_row()
    window.addEventListener('resize', handle_resize)

    return () => window.removeEventListener('resize', handle_resize)
  }, [calculate_cards_per_row])

  // Additional effect to calculate after the grid is rendered
  useEffect(() => {
    if (grid_ref.current) {
      calculate_cards_per_row()
    }
  }, [grid_ref.current, calculate_cards_per_row])

  const get_displayed_threads = () => {
    // Show 2-3 complete rows based on cards per row
    const rows_to_show = cards_per_row === 1 ? 5 : cards_per_row <= 3 ? 3 : 2
    const cards_to_show = rows_to_show * cards_per_row

    console.log(
      'cards_per_row:',
      cards_per_row,
      'rows_to_show:',
      rows_to_show,
      'cards_to_show:',
      cards_to_show
    )

    return threads.take(cards_to_show)
  }

  // Handle keyboard navigation
  const handle_keydown = useCallback(
    (event) => {
      const displayed_threads = get_displayed_threads()
      if (displayed_threads.size === 0) return

      const current_row = Math.floor(focused_index / cards_per_row)
      const current_col = focused_index % cards_per_row
      let new_index = focused_index

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          new_index = Math.max(0, focused_index - 1)
          break
        case 'ArrowRight':
          event.preventDefault()
          new_index = Math.min(displayed_threads.size - 1, focused_index + 1)
          break
        case 'ArrowUp':
          event.preventDefault()
          if (current_row > 0) {
            new_index = Math.max(0, focused_index - cards_per_row)
          }
          break
        case 'ArrowDown': {
          event.preventDefault()
          const next_row_index = focused_index + cards_per_row
          if (next_row_index < displayed_threads.size) {
            new_index = next_row_index
          } else {
            // Go to last item in grid if trying to go down from last row
            const last_row_start =
              Math.floor((displayed_threads.size - 1) / cards_per_row) *
              cards_per_row
            const target_col = Math.min(
              current_col,
              (displayed_threads.size - 1) % cards_per_row
            )
            new_index = last_row_start + target_col
          }
          break
        }
        case 'Enter': {
          event.preventDefault()
          const focused_thread = displayed_threads.get(focused_index)
          if (focused_thread) {
            navigate(`/thread/${focused_thread.thread_id}`)
          }
          break
        }
        default:
          return
      }

      set_focused_index(new_index)
    },
    [focused_index, cards_per_row, get_displayed_threads, navigate]
  )

  // Add keyboard event listener
  useEffect(() => {
    document.addEventListener('keydown', handle_keydown)
    return () => {
      document.removeEventListener('keydown', handle_keydown)
    }
  }, [handle_keydown])

  const displayed_threads = get_displayed_threads()

  return (
    <PageLayout>
      <div className='homepage-section'>
        <div className='threads-container'>
          {is_loading_threads ? (
            <div>Loading threads...</div>
          ) : threads.size === 0 ? (
            <div>No active threads</div>
          ) : (
            <>
              <div className='threads-grid' ref={grid_ref}>
                {displayed_threads.map((thread, index) => (
                  <Thread
                    key={thread.id}
                    thread={thread}
                    is_focused={index === focused_index}
                  />
                ))}
              </div>
              {threads.size > displayed_threads.size && (
                <Link to='/thread' className='all-threads-link'>
                  All Threads
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <div className='homepage-section'>
        <FileSystemBrowser />
      </div>
    </PageLayout>
  )
}

Homepage.propTypes = {
  threads: ImmutablePropTypes.list.isRequired,
  is_loading_threads: PropTypes.bool.isRequired,
  load_threads: PropTypes.func.isRequired
}

export default Homepage
