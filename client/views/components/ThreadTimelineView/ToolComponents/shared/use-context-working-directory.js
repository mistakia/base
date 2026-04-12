import { useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'

import { get_thread_working_directory } from '@core/threads/selectors'
import { get_thread_sheet_active_sheet } from '@core/thread-sheet/selectors'

/**
 * Derives the working_directory for the current thread context.
 * Checks the URL for a thread page first, then falls back to the active sheet.
 */
export function use_context_working_directory() {
  const location = useLocation()
  const url_thread_id = location.pathname.startsWith('/thread/')
    ? location.pathname.split('/')[2]
    : null
  const sheet_thread_id = useSelector(get_thread_sheet_active_sheet)
  const context_thread_id = url_thread_id || sheet_thread_id
  return useSelector((state) =>
    get_thread_working_directory(state, context_thread_id)
  )
}
