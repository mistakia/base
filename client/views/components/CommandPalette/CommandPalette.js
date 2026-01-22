import React, { useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Dialog, Box, List, CircularProgress } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'

import {
  search_actions,
  get_is_command_palette_open,
  get_search_query,
  get_is_search_loading,
  get_all_results_flat,
  get_selected_index,
  get_search_total
} from '@core/search'

import './CommandPalette.styl'

/**
 * Get display type from file path or category
 */
const get_type_label = (item) => {
  if (item.category === 'thread') {
    return 'thread'
  }
  if (item.category === 'directory') {
    return 'dir'
  }
  if (item.category === 'entity' && item.file_path) {
    // Extract entity type from path (e.g., "task/foo.md" -> "task")
    const first_segment = item.file_path.split('/')[0]
    return first_segment || 'entity'
  }
  if (item.category === 'file') {
    // Get file extension
    const ext = item.file_path?.split('.').pop()
    return ext || 'file'
  }
  return item.category || 'file'
}

const ResultItem = ({ item, is_selected, onClick }) => {
  const get_display_text = () => {
    if (item.category === 'thread') {
      return item.title || item.working_directory || item.thread_id?.slice(0, 8)
    }
    return item.file_path
  }

  return (
    <div
      className={`command-palette__result-item ${is_selected ? 'command-palette__result-item--selected' : ''}`}
      onClick={onClick}>
      <span className='command-palette__result-type'>
        {get_type_label(item)}
      </span>
      <span className='command-palette__result-text'>{get_display_text()}</span>
    </div>
  )
}

ResultItem.propTypes = {
  item: PropTypes.shape({
    category: PropTypes.string,
    file_path: PropTypes.string,
    thread_id: PropTypes.string,
    title: PropTypes.string,
    working_directory: PropTypes.string
  }).isRequired,
  is_selected: PropTypes.bool,
  onClick: PropTypes.func
}

const CommandPalette = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const input_ref = useRef(null)

  const is_open = useSelector(get_is_command_palette_open)
  const query = useSelector(get_search_query)
  const is_loading = useSelector(get_is_search_loading)
  const results = useSelector(get_all_results_flat)
  const selected_index = useSelector(get_selected_index)
  const total = useSelector(get_search_total)

  const handle_close = useCallback(() => {
    dispatch(search_actions.close())
  }, [dispatch])

  const handle_query_change = useCallback(
    (event) => {
      dispatch(search_actions.set_query(event.target.value))
    },
    [dispatch]
  )

  const navigate_to_item = useCallback(
    (item, new_tab = false) => {
      // Only close palette when navigating in current tab
      // Keep palette open when opening in new tab
      if (!new_tab) {
        handle_close()
      }

      let url
      if (item.category === 'thread') {
        url = `/thread/${item.thread_id}`
      } else if (item.file_path) {
        // Encode each path segment separately to preserve slashes
        const encoded_path = item.file_path
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/')
        url = `/${encoded_path}`
      }

      if (url) {
        if (new_tab) {
          window.open(url, '_blank')
        } else {
          navigate(url)
        }
      }
    },
    [navigate, handle_close]
  )

  const handle_key_down = useCallback(
    (event) => {
      const results_count = results.size

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          if (results_count > 0) {
            const next_index = (selected_index + 1) % results_count
            dispatch(search_actions.set_selected_index(next_index))
          }
          break

        case 'ArrowUp':
          event.preventDefault()
          if (results_count > 0) {
            const prev_index =
              selected_index === 0 ? results_count - 1 : selected_index - 1
            dispatch(search_actions.set_selected_index(prev_index))
          }
          break

        case 'Enter': {
          event.preventDefault()
          const selected_item = results.get(selected_index)
          if (selected_item) {
            // Command/Ctrl+Enter opens in new tab
            const new_tab = event.metaKey || event.ctrlKey
            navigate_to_item(selected_item, new_tab)
          }
          break
        }

        case 'Escape':
          event.preventDefault()
          handle_close()
          break
      }
    },
    [dispatch, results, selected_index, navigate_to_item, handle_close]
  )

  // Reset selected index to 0 when results change
  useEffect(() => {
    if (results.size > 0 && selected_index >= results.size) {
      dispatch(search_actions.set_selected_index(0))
    }
  }, [results, selected_index, dispatch])

  // Focus input when dialog opens
  useEffect(() => {
    if (is_open && input_ref.current) {
      input_ref.current.focus()
    }
  }, [is_open])

  if (!is_open) {
    return null
  }

  return (
    <Dialog
      open={is_open}
      onClose={handle_close}
      maxWidth='sm'
      fullWidth
      className='command-palette'
      hideBackdrop
      PaperProps={{
        className: 'command-palette__paper',
        sx: {
          boxShadow:
            '0 1px 6px rgba(0, 0, 0, 0.06), 0 2px 12px rgba(0, 0, 0, 0.04)'
        }
      }}>
      <Box className='command-palette__input-container'>
        <SearchIcon className='command-palette__search-icon' />
        <input
          ref={input_ref}
          type='text'
          className='command-palette__input'
          placeholder='Search...'
          value={query}
          onChange={handle_query_change}
          onKeyDown={handle_key_down}
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck='false'
          autoFocus
        />
        {is_loading && (
          <CircularProgress size={14} className='command-palette__loading' />
        )}
        {total > 0 && (
          <span className='command-palette__result-count'>{total}</span>
        )}
      </Box>

      {results.size > 0 && (
        <Box className='command-palette__results'>
          <List disablePadding>
            {results.map((item, index) => (
              <ResultItem
                key={`${item.category}-${item.file_path || item.thread_id}-${index}`}
                item={item}
                is_selected={index === selected_index}
                onClick={() => navigate_to_item(item)}
              />
            ))}
          </List>
        </Box>
      )}

      {query.length >= 2 && !is_loading && results.size === 0 && (
        <Box className='command-palette__empty'>No results found</Box>
      )}
    </Dialog>
  )
}

export default CommandPalette
