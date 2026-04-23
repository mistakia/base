import React, { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { Box, CircularProgress } from '@mui/material'
import FolderIcon from '@mui/icons-material/Folder'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'

import './FileAutocompleteSuggestions.styl'

/**
 * Format path with directory portions muted
 * Returns JSX with styled path segments
 */
const format_path_display = (path) => {
  if (!path) return null

  const last_separator_index = path.lastIndexOf('/')

  if (last_separator_index === -1) {
    // No directory portion, just filename
    return <span className='suggestion-filename'>{path}</span>
  }

  const directory_part = path.slice(0, last_separator_index + 1)
  const filename_part = path.slice(last_separator_index + 1)

  return (
    <>
      <span className='suggestion-directory'>{directory_part}</span>
      <span className='suggestion-filename'>{filename_part}</span>
    </>
  )
}

/**
 * SuggestionItem component
 * Renders individual suggestion with icon and formatted path
 */
function SuggestionItem({ suggestion, is_selected, on_click }) {
  const item_ref = useRef(null)

  // Auto-scroll selected item into view
  useEffect(() => {
    if (is_selected && item_ref.current) {
      item_ref.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      })
    }
  }, [is_selected])

  const is_directory =
    suggestion.is_directory || suggestion.type === 'directory'
  const display_path = suggestion.file_path || ''

  return (
    <Box
      ref={item_ref}
      className={`suggestion-item ${is_selected ? 'selected' : ''}`}
      onClick={on_click}
      role='option'
      aria-selected={is_selected}>
      <span className='suggestion-icon'>
        {is_directory ? (
          <FolderIcon className='folder-icon' />
        ) : (
          <InsertDriveFileOutlinedIcon className='file-icon' />
        )}
      </span>
      <span className='suggestion-path'>
        {format_path_display(display_path)}
      </span>
    </Box>
  )
}

SuggestionItem.propTypes = {
  suggestion: PropTypes.shape({
    file_path: PropTypes.string,
    path: PropTypes.string,
    relative_path: PropTypes.string,
    is_directory: PropTypes.bool,
    type: PropTypes.string
  }).isRequired,
  is_selected: PropTypes.bool,
  on_click: PropTypes.func.isRequired
}

/**
 * FileAutocompleteSuggestions component
 * Renders scrollable suggestion list above the input
 */
export default function FileAutocompleteSuggestions({
  suggestions,
  selected_index,
  is_loading,
  is_visible,
  on_select,
  search_term
}) {
  if (!is_visible) {
    return null
  }

  const has_suggestions = suggestions && suggestions.length > 0

  return (
    <Box
      className='file-autocomplete-suggestions'
      role='listbox'
      aria-label='File suggestions'>
      {is_loading && !has_suggestions && (
        <Box className='suggestions-loading'>
          <CircularProgress size={16} />
          <span>Searching...</span>
        </Box>
      )}

      {!is_loading && !has_suggestions && search_term && (
        <Box className='suggestions-empty'>
          No files found matching &quot;{search_term}&quot;
        </Box>
      )}

      {has_suggestions && (
        <Box className='suggestions-list'>
          {suggestions.map((suggestion, index) => (
            <SuggestionItem
              key={suggestion.path || index}
              suggestion={suggestion}
              is_selected={index === selected_index}
              on_click={() => on_select(index)}
            />
          ))}
        </Box>
      )}

      {is_loading && has_suggestions && (
        <Box className='suggestions-loading-inline'>
          <CircularProgress size={12} />
        </Box>
      )}
    </Box>
  )
}

FileAutocompleteSuggestions.propTypes = {
  suggestions: PropTypes.arrayOf(
    PropTypes.shape({
      file_path: PropTypes.string,
      path: PropTypes.string,
      relative_path: PropTypes.string,
      is_directory: PropTypes.bool,
      type: PropTypes.string
    })
  ),
  selected_index: PropTypes.number,
  is_loading: PropTypes.bool,
  is_visible: PropTypes.bool,
  on_select: PropTypes.func.isRequired,
  search_term: PropTypes.string
}

FileAutocompleteSuggestions.defaultProps = {
  suggestions: [],
  selected_index: 0,
  is_loading: false,
  is_visible: false,
  search_term: ''
}
