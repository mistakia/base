/**
 * @fileoverview Thread management functions
 */

import debug from 'debug'

import create_thread from './create-thread.mjs'
import get_thread from './get-thread.mjs'
import list_threads from './list-threads.mjs'
import {
  update_thread_state,
  update_thread_metadata
} from './update-thread.mjs'
import add_timeline_entry from './add-timeline-entry.mjs'
const log = debug('threads')

log('Initializing threads module')

/**
 * Export thread management functions
 */
export {
  // Core thread operations
  create_thread,
  get_thread,
  list_threads,
  update_thread_state,
  update_thread_metadata,

  // Timeline operations
  add_timeline_entry
}

/**
 * Default export of all thread management functions
 */
export default {
  create_thread,
  get_thread,
  list_threads,
  update_thread_state,
  update_thread_metadata,
  add_timeline_entry
}
