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
  get_chips
} from '@core/search'

import './CommandPalette.styl'

const encode_path = (p) =>
  p
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

function url_for_result(result) {
  if (!result) return null
  if (result.entity_uri) {
    if (result.entity_uri.startsWith('user:thread/')) {
      return `/thread/${result.entity_uri.slice('user:thread/'.length)}`
    }
    const entity_path = result.entity_uri.replace(/^(?:user|sys):/, '')
    return `/${encode_path(entity_path)}`
  }
  const fallback_path = result.relative_path || result.file_path
  if (fallback_path) return `/${encode_path(fallback_path)}`
  return null
}

function type_label(result) {
  if (result.type) return result.type
  if (result.category === 'recent') {
    const file_path = result.file_path || result.relative_path || ''
    return file_path.split('/')[0] || result.entity_type || 'entity'
  }
  return 'entity'
}

function display_text(result) {
  if (result.title) return result.title
  if (result.entity_uri) return result.entity_uri
  return result.relative_path || result.file_path || ''
}

const ResultItem = ({ item, is_selected, normalized_score, onClick }) => {
  const matches = Array.isArray(item.matches) ? item.matches : []
  const score_style =
    typeof normalized_score === 'number'
      ? { '--score': normalized_score }
      : undefined
  return (
    <div
      className={`command-palette__result-item ${is_selected ? 'command-palette__result-item--selected' : ''}`}
      style={score_style}
      onClick={onClick}>
      <div className='command-palette__result-header'>
        <span className='command-palette__result-type'>
          {type_label(item)}
        </span>
        <span className='command-palette__result-text'>
          {display_text(item)}
        </span>
        {typeof item.score === 'number' && (
          <span className='command-palette__result-score'>
            {item.score.toFixed(2)}
          </span>
        )}
      </div>
      {matches.length > 0 && (
        <div className='command-palette__result-matches'>
          {matches.map((match, i) => (
            <div key={i} className='command-palette__match'>
              <span className='command-palette__match-source'>
                {match.source}
              </span>
              {match.snippet && (
                <span className='command-palette__match-snippet'>
                  {match.snippet.slice(0, 160)}
                  {match.snippet.length > 160 ? '…' : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

ResultItem.propTypes = {
  item: PropTypes.shape({
    entity_uri: PropTypes.string,
    type: PropTypes.string,
    title: PropTypes.string,
    score: PropTypes.number,
    matches: PropTypes.array,
    category: PropTypes.string,
    file_path: PropTypes.string,
    relative_path: PropTypes.string,
    entity_type: PropTypes.string
  }).isRequired,
  is_selected: PropTypes.bool,
  normalized_score: PropTypes.number,
  onClick: PropTypes.func
}

const SearchChip = ({ chip, on_remove }) => {
  const variant_class = 'command-palette__chip--operator'
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
  const chips = useSelector(get_chips)

  const has_filter_chips = chips.size > 0
  const show_recent_files = (!query || query.length < 2) && !has_filter_chips
  const display_items = useMemo(
    () =>
      show_recent_files
        ? recent_files.map((item) => ({ ...item, category: 'recent' }))
        : results,
    [show_recent_files, recent_files, results]
  )
  const display_loading = show_recent_files ? recent_files_loading : is_loading

  const score_range = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    display_items.forEach((item) => {
      if (typeof item.score === 'number') {
        if (item.score < min) min = item.score
        if (item.score > max) max = item.score
      }
    })
    if (!isFinite(min) || !isFinite(max)) return null
    return { min, max }
  }, [display_items])

  const normalize_score = useCallback(
    (score) => {
      if (typeof score !== 'number' || !score_range) return undefined
      const { min, max } = score_range
      if (max === min) return 1
      return (score - min) / (max - min)
    },
    [score_range]
  )

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
      if (!new_tab) handle_close()

      const url = url_for_result(item)
      if (!url) return

      if (new_tab) {
        window.open(url, '_blank')
      } else {
        navigate(url)
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

  useEffect(() => {
    if (display_items.size > 0 && selected_index >= display_items.size) {
      dispatch(search_actions.set_selected_index(0))
    }
  }, [display_items, selected_index, dispatch])

  useEffect(() => {
    if (is_open && input_ref.current) input_ref.current.focus()
  }, [is_open])

  if (!is_open) return null

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
              : 'Search... (? semantic, type: tag: status: source: path:)'
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
                normalized_score={normalize_score(item.score)}
                onClick={() => navigate_to_item(item)}
              />
            ))}
          </List>
        </Box>
      )}

      {!show_recent_files && display_items.size > 0 && (
        <Box className='command-palette__results'>
          <List disablePadding>
            {display_items.map((item, index) => (
              <ResultItem
                key={`${item.entity_uri || item.file_path || 'item'}-${index}`}
                item={item}
                is_selected={index === selected_index}
                normalized_score={normalize_score(item.score)}
                onClick={() => navigate_to_item(item)}
              />
            ))}
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
