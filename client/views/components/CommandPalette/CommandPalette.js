import React, { useEffect, useCallback, useMemo, useRef } from 'react'
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
  get_search_total,
  get_recent_files,
  get_recent_files_loading,
  get_search_mode,
  get_semantic_available,
  get_chips
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
  if (item.category === 'recent' || item.category === 'entity') {
    // Extract entity type from path (e.g., "task/foo.md" -> "task")
    const file_path = item.file_path || item.relative_path
    if (file_path) {
      const first_segment = file_path.split('/')[0]
      return first_segment || item.entity_type || 'entity'
    }
    return item.entity_type || 'entity'
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
    return item.file_path || item.relative_path
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
    relative_path: PropTypes.string,
    thread_id: PropTypes.string,
    title: PropTypes.string,
    working_directory: PropTypes.string,
    entity_type: PropTypes.string
  }).isRequired,
  is_selected: PropTypes.bool,
  onClick: PropTypes.func
}

const ContentResultItem = ({ item, is_selected, onClick }) => (
  <div
    className={`command-palette__result-item command-palette__result-item--content ${is_selected ? 'command-palette__result-item--selected' : ''}`}
    onClick={onClick}>
    <div className='command-palette__content-header'>
      <span className='command-palette__result-type'>
        {item.relative_path?.split('.').pop() || 'file'}
      </span>
      <span className='command-palette__result-text'>{item.relative_path}</span>
      <span className='command-palette__line-number'>:{item.line_number}</span>
    </div>
    <div className='command-palette__content-context'>
      {item.context_before?.map((line, i) => (
        <div key={`before-${i}`} className='command-palette__context-line'>
          {line}
        </div>
      ))}
      <div className='command-palette__match-line'>{item.match_line}</div>
      {item.context_after?.map((line, i) => (
        <div key={`after-${i}`} className='command-palette__context-line'>
          {line}
        </div>
      ))}
    </div>
  </div>
)

ContentResultItem.propTypes = {
  item: PropTypes.object.isRequired,
  is_selected: PropTypes.bool,
  onClick: PropTypes.func
}

const SemanticResultItem = ({ item, is_selected, onClick }) => (
  <div
    className={`command-palette__result-item command-palette__result-item--semantic ${is_selected ? 'command-palette__result-item--selected' : ''}`}
    onClick={onClick}>
    <div className='command-palette__semantic-header'>
      <span className='command-palette__result-type'>
        {item.type || 'entity'}
      </span>
      <span className='command-palette__result-text'>
        {item.title || item.base_uri}
      </span>
      <span className='command-palette__similarity-score'>
        {Math.round((item.similarity_score || 0) * 100)}%
      </span>
    </div>
    {item.description && (
      <div className='command-palette__semantic-description'>
        {item.description}
      </div>
    )}
    {item.chunk_text && (
      <div className='command-palette__semantic-chunk'>
        {item.chunk_text.slice(0, 200)}
        {item.chunk_text.length > 200 ? '...' : ''}
      </div>
    )}
  </div>
)

SemanticResultItem.propTypes = {
  item: PropTypes.object.isRequired,
  is_selected: PropTypes.bool,
  onClick: PropTypes.func
}

const SearchChip = ({ chip, on_remove }) => {
  const variant_class =
    chip.type === 'mode'
      ? 'command-palette__chip--mode'
      : chip.type === 'exclude'
        ? 'command-palette__chip--exclude'
        : 'command-palette__chip--operator'

  return (
    <span className={`command-palette__chip ${variant_class}`}>
      <span className='command-palette__chip-label'>{chip.label}</span>
      <span className='command-palette__chip-remove' onClick={on_remove}>
        &times;
      </span>
    </span>
  )
}

SearchChip.propTypes = {
  chip: PropTypes.shape({
    type: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired
  }).isRequired,
  on_remove: PropTypes.func.isRequired
}

const encode_path = (p) =>
  p
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

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
  const recent_files = useSelector(get_recent_files)
  const recent_files_loading = useSelector(get_recent_files_loading)
  const search_mode = useSelector(get_search_mode)
  const semantic_available = useSelector(get_semantic_available)
  const chips = useSelector(get_chips)

  // Determine what to display: recent files (when no query/filters) or search results
  const has_filter_chips = chips.some((c) => c.type !== 'mode')
  const show_recent_files = (!query || query.length < 2) && !has_filter_chips
  const display_items = useMemo(
    () =>
      show_recent_files
        ? recent_files.map((item) => ({ ...item, category: 'recent' }))
        : results,
    [show_recent_files, recent_files, results]
  )
  const display_loading = show_recent_files ? recent_files_loading : is_loading

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
      } else if (item.category === 'semantic' && item.base_uri) {
        const entity_path = item.base_uri.replace(/^user:/, '')
        url = `/${encode_path(entity_path)}`
      } else if (item.category === 'content' && item.relative_path) {
        const line_suffix = item.line_number ? `#L${item.line_number}` : ''
        url = `/${encode_path(item.relative_path)}${line_suffix}`
      } else {
        const file_path = item.file_path || item.relative_path
        if (file_path) {
          url = `/${encode_path(file_path)}`
        }
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
      const items_count = display_items.size

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          if (items_count > 0) {
            const next_index = (selected_index + 1) % items_count
            dispatch(search_actions.set_selected_index(next_index))
          }
          break

        case 'ArrowUp':
          event.preventDefault()
          if (items_count > 0) {
            const prev_index =
              selected_index === 0 ? items_count - 1 : selected_index - 1
            dispatch(search_actions.set_selected_index(prev_index))
          }
          break

        case 'Enter': {
          event.preventDefault()
          const selected_item = display_items.get(selected_index)
          if (selected_item) {
            // Command/Ctrl+Enter opens in new tab
            const new_tab = event.metaKey || event.ctrlKey
            navigate_to_item(selected_item, new_tab)
          }
          break
        }

        case 'Backspace':
          if (!query && chips.size > 0) {
            event.preventDefault()
            dispatch(search_actions.remove_chip(chips.size - 1))
          }
          break

        case 'Escape':
          event.preventDefault()
          handle_close()
          break
      }
    },
    [
      dispatch,
      display_items,
      selected_index,
      navigate_to_item,
      handle_close,
      query,
      chips
    ]
  )

  // Reset selected index to 0 when display items change
  useEffect(() => {
    if (display_items.size > 0 && selected_index >= display_items.size) {
      dispatch(search_actions.set_selected_index(0))
    }
  }, [display_items, selected_index, dispatch])

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
        {chips.map((chip, index) => (
          <SearchChip
            key={`${chip.key}-${chip.value}-${index}`}
            chip={chip}
            on_remove={() => dispatch(search_actions.remove_chip(index))}
          />
        ))}
        <input
          ref={input_ref}
          type='text'
          className='command-palette__input'
          placeholder={
            chips.size > 0
              ? 'Filter...'
              : 'Search... (# content, ? semantic, type: tag: in: -exclude)'
          }
          value={query}
          onChange={handle_query_change}
          onKeyDown={handle_key_down}
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck='false'
          autoFocus
        />
        {display_loading && (
          <CircularProgress size={14} className='command-palette__loading' />
        )}
        {!show_recent_files && total > 0 && (
          <span className='command-palette__result-count'>{total}</span>
        )}
        {search_mode === 'semantic' && !semantic_available && (
          <span className='command-palette__mode-status'>
            Ollama unavailable
          </span>
        )}
      </Box>

      {show_recent_files && display_items.size > 0 && (
        <Box className='command-palette__results'>
          <div className='command-palette__section-header'>Recent Files</div>
          <List disablePadding>
            {display_items.map((item, index) => (
              <ResultItem
                key={`recent-${item.relative_path || item.file_path}-${index}`}
                item={item}
                is_selected={index === selected_index}
                onClick={() => navigate_to_item(item)}
              />
            ))}
          </List>
        </Box>
      )}

      {!show_recent_files && display_items.size > 0 && (
        <Box className='command-palette__results'>
          <List disablePadding>
            {display_items.map((item, index) => {
              if (item.category === 'content') {
                return (
                  <ContentResultItem
                    key={`content-${item.relative_path}-${item.line_number}-${index}`}
                    item={item}
                    is_selected={index === selected_index}
                    onClick={() => navigate_to_item(item)}
                  />
                )
              }
              if (item.category === 'semantic') {
                return (
                  <SemanticResultItem
                    key={`semantic-${item.base_uri}-${item.chunk_index}-${index}`}
                    item={item}
                    is_selected={index === selected_index}
                    onClick={() => navigate_to_item(item)}
                  />
                )
              }
              return (
                <ResultItem
                  key={`${item.category}-${item.file_path || item.thread_id}-${index}`}
                  item={item}
                  is_selected={index === selected_index}
                  onClick={() => navigate_to_item(item)}
                />
              )
            })}
          </List>
        </Box>
      )}

      {!show_recent_files && !is_loading && results.size === 0 && (
        <Box className='command-palette__empty'>No results found</Box>
      )}
    </Dialog>
  )
}

export default CommandPalette
