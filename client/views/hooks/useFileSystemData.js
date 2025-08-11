import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { directory_actions, get_directory_state } from '@core/directory'

/**
 * Custom hook for filesystem data management
 * Extracts the filesystem logic from FileSystemBrowser for reusability
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.use_router_path - Whether to sync with router pathname (default: true)
 * @param {string} options.initial_path - Initial path to load (default: '')
 * @returns {Object} Filesystem state and handlers
 */
export const use_file_system_data = ({
  use_router_path = true,
  initial_path = ''
} = {}) => {
  const location = use_router_path ? useLocation() : null

  const [current_path, set_current_path] = useState(initial_path)
  const dispatch = useDispatch()
  const directory_state = useSelector(get_directory_state)
  const path_info = directory_state.get('path_info')
  const loading = directory_state.get('is_loading_path_info')
  const error = directory_state.get('path_info_error')
  const is_directory = path_info?.type === 'directory' || current_path === ''

  const check_path_type = useCallback(
    async (path) => {
      dispatch(directory_actions.load_path_info(path))
    },
    [dispatch]
  )

  const navigate_to_path = useCallback(
    async (path) => {
      const normalized_path = path || ''
      set_current_path(normalized_path)

      try {
        await check_path_type(normalized_path)
      } catch (err) {
        console.error('Navigation error:', err)
      }
    },
    [check_path_type]
  )

  // Sync with router location if enabled
  useEffect(() => {
    if (use_router_path && location) {
      const path = location.pathname === '/' ? '' : location.pathname
      if (path !== current_path) {
        navigate_to_path(path)
      }
    }
  }, [use_router_path, location, current_path, navigate_to_path])

  // Load initial path
  useEffect(() => {
    if (!use_router_path && initial_path !== undefined) {
      navigate_to_path(initial_path)
    }
  }, [use_router_path, initial_path, navigate_to_path])

  const refresh = useCallback(async () => {
    try {
      await check_path_type(current_path)
    } catch (err) {
      console.error('Refresh error:', err)
    }
  }, [current_path, check_path_type])

  return {
    // State
    current_path,
    is_directory,
    loading,
    error,

    // Actions
    navigate_to_path,
    check_path_type,
    refresh,

    // Computed properties
    is_file: !is_directory,
    has_error: !!error
  }
}
