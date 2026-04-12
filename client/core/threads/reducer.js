import { Record, List, Map } from 'immutable'

import { threads_action_types } from './actions'
import { thread_action_types } from '@core/thread/actions'
import { thread_sheet_action_types } from '@core/thread-sheet/actions'
import { app_actions } from '@core/app/actions'
import { active_sessions_action_types } from '@core/active-sessions/actions'
import { thread_columns } from '@views/components/ThreadsTable/index.js'
import { TABLE_OPERATORS } from 'react-table/src/constants.mjs'
import { create_default_table_state } from '@core/table/create-default-table-state.js'
import { create_view } from '@core/table/create-view.js'
import {
  update_view_on_config_change,
  on_table_pending,
  on_table_fulfilled,
  on_table_failed
} from '@core/table/table-reducer-helpers.js'
import { log_lifecycle } from '@core/utils/session-lifecycle-debug'

// ============================================================================
// Helper Functions for Reducer Logic
// ============================================================================

/**
 * Updates a thread in all table views
 */
function update_thread_in_all_views(state, thread_id, update_fn) {
  return state.update('thread_table_views', (views) =>
    views.map((view) =>
      view.updateIn(['thread_table_data'], (data) =>
        data
          ? data.map((thread) =>
              thread.get('thread_id') === thread_id ? update_fn(thread) : thread
            )
          : data
      )
    )
  )
}

/**
 * Adds a new thread to the beginning of all table views
 */
function add_thread_to_all_views(state, new_thread) {
  return state.update('thread_table_views', (views) =>
    views.map((view) =>
      view.updateIn(['thread_table_data'], (data) =>
        data ? data.unshift(new_thread) : List([new_thread])
      )
    )
  )
}

/**
 * Updates a cached thread entry if it exists in thread_cache
 */
function update_thread_cache_entry(state, thread_id, update_fn) {
  if (!state.hasIn(['thread_cache', thread_id])) return state
  return state.updateIn(['thread_cache', thread_id], update_fn)
}

/**
 * Updates a thread in the basic threads list.
 * Thread list items are Immutable Maps (from GET_THREADS_FULFILLED wrapping in List),
 * but updated_data may be plain JS objects from WebSocket events.
 */
function update_thread_in_basic_list(state, thread_id, updated_data) {
  return state.update('threads', (threads) => {
    if (!threads) return threads
    return threads.map((thread) => {
      const id = thread.get ? thread.get('thread_id') : thread.thread_id
      if (id === thread_id) {
        if (thread.merge) {
          return thread.merge(updated_data)
        }
        return { ...thread, ...updated_data }
      }
      return thread
    })
  })
}

/**
 * Prepends a thread to the basic threads list with dedup by thread_id.
 * If a thread with the same thread_id already exists, replaces it with the new data.
 */
function add_thread_to_basic_list(state, new_thread) {
  return state.update('threads', (threads) => {
    if (!threads) return List([new_thread])
    const new_id = new_thread.get
      ? new_thread.get('thread_id')
      : new_thread.thread_id
    const existing_index = threads.findIndex((thread) => {
      const id = thread.get ? thread.get('thread_id') : thread.thread_id
      return id === new_id
    })
    if (existing_index !== -1) {
      return threads.set(existing_index, new_thread)
    }
    return threads.unshift(new_thread)
  })
}

/**
 * Updates an existing thread in the basic list, or prepends it if not found.
 * Combines update_thread_in_basic_list semantics with add-if-missing fallback.
 */
function upsert_thread_in_basic_list(state, thread_id, updated_data) {
  return state.update('threads', (threads) => {
    if (!threads) return List([Map(updated_data)])
    const existing_index = threads.findIndex((thread) => {
      const id = thread.get ? thread.get('thread_id') : thread.thread_id
      return id === thread_id
    })
    if (existing_index !== -1) {
      return threads.update(existing_index, (thread) => {
        if (thread.merge) {
          return thread.merge(updated_data)
        }
        return { ...thread, ...updated_data }
      })
    }
    const new_entry =
      updated_data instanceof Map ? updated_data : Map(updated_data)
    return threads.unshift(new_entry)
  })
}

/**
 * Appends a timeline entry to a cached thread
 */
function append_timeline_entry(state, thread_id, entry) {
  return update_thread_cache_entry(state, thread_id, (thread_data) =>
    thread_data.update('timeline', (timeline) => {
      if (timeline && Array.isArray(timeline)) {
        const exists = timeline.some((e) => e.id === entry.id)
        if (exists) return timeline
        return [...timeline, entry]
      }
      return [entry]
    })
  )
}

function remove_optimistic_entries(state, thread_id) {
  return update_thread_cache_entry(state, thread_id, (thread_data) =>
    thread_data.update('timeline', (timeline) => {
      if (timeline && Array.isArray(timeline)) {
        const filtered = timeline.filter((e) => !e._optimistic)
        return filtered.length !== timeline.length ? filtered : timeline
      }
      return timeline
    })
  )
}

/**
 * After loading thread data into cache, re-inject optimistic entry if a pending
 * resume exists and the loaded timeline does not already contain a user message
 * timestamped after the pending resume's submitted_at.
 */
function reinject_optimistic_entry_if_needed(state, thread_id) {
  const pending_resume = state.getIn(['thread_pending_resumes', thread_id])
  if (!pending_resume || !pending_resume.get('prompt')) return state

  const submitted_at = pending_resume.get('submitted_at')
  const timeline = state.getIn(['thread_cache', thread_id, 'timeline'])
  if (!timeline || !Array.isArray(timeline)) return state

  // Check if timeline already has a user message after submitted_at
  // Timeline entries from the server use `timestamp`, not `created_at`
  const has_recent_user_message = timeline.some(
    (e) =>
      e.type === 'message' &&
      e.role === 'user' &&
      !e._optimistic &&
      (e.timestamp || e.created_at) >= submitted_at
  )
  if (has_recent_user_message) return state

  // Check if an optimistic entry already exists
  const has_optimistic = timeline.some((e) => e._optimistic)
  if (has_optimistic) return state

  const optimistic_entry = {
    id: `optimistic-${thread_id}-${Date.now()}`,
    type: 'message',
    role: 'user',
    content: pending_resume.get('prompt'),
    timestamp: submitted_at,
    created_at: submitted_at,
    _optimistic: true
  }
  return append_timeline_entry(state, thread_id, optimistic_entry)
}

// ============================================================================
// Default Table Configuration
// ============================================================================

const DEFAULT_TABLE_COLUMNS = [
  'thread_state',
  'source_provider',
  'title',
  'tags',
  'working_directory',
  'created_at',
  'updated_at',
  'duration',
  'message_count',
  'user_message_count',
  'assistant_message_count',
  'tool_call_count',
  'total_tokens',
  'cost',
  'external_session_id'
]

const DEFAULT_TABLE_STATE = create_default_table_state({
  columns: DEFAULT_TABLE_COLUMNS,
  sort: [{ column_id: 'updated_at', desc: true }]
})

const DEFAULT_THREAD_TABLE_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'default',
  view_name: 'All Threads',
  table_state: DEFAULT_TABLE_STATE
})

const ACTIVE_THREADS_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'active',
  view_name: 'Active Threads',
  table_state: create_default_table_state({
    columns: DEFAULT_TABLE_COLUMNS,
    sort: [{ column_id: 'updated_at', desc: true }],
    where: new List([
      {
        column_id: 'thread_state',
        operator: '=',
        value: 'active'
      }
    ])
  })
})

// Note: time-based filter dates are computed at module load time.
// For long-running sessions, these become stale. A proper fix requires
// recalculating in a selector or action when the view is selected.
const LAST_48_HOURS_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'last_48_hours',
  view_name: 'Last 48 Hours',
  table_state: create_default_table_state({
    columns: DEFAULT_TABLE_COLUMNS,
    sort: [{ column_id: 'created_at', desc: true }],
    where: new List([
      {
        column_id: 'created_at',
        operator: TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
        value: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      }
    ])
  })
})

const LAST_7_DAYS_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'last_7_days',
  view_name: 'Last 7 Days',
  table_state: create_default_table_state({
    columns: DEFAULT_TABLE_COLUMNS,
    sort: [{ column_id: 'created_at', desc: true }],
    where: new List([
      {
        column_id: 'created_at',
        operator: TABLE_OPERATORS.GREATER_THAN_OR_EQUAL,
        value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    ])
  })
})

// ============================================================================
// Initial State
// ============================================================================

const ThreadsState = new Record({
  // Available tags for filter dropdown
  available_tags: new List(),
  is_loading_available_tags: false,
  available_tags_error: null,

  // Basic threads list for simple get_threads API calls
  threads: new List(),
  is_loading_threads: false,
  threads_error: null,

  // Unified thread data cache keyed by thread_id.
  // Entries are not proactively evicted; cleared on CLEAR_AUTH.
  thread_cache: new Map(),
  // Loading states per thread_id: { is_loading, error }
  thread_loading: new Map(),

  // Pending resume state keyed by thread_id
  thread_pending_resumes: new Map(),

  models_data: new Map({
    loading: false,
    error: null,
    data: null
  }),

  // Timestamp of most recent CREATE_THREAD_SESSION_FULFILLED, used by
  // FloatingSessionsPanel to auto-open when a session is created
  session_created_at: null,

  // Table views management
  thread_table_views: new Map({
    default: DEFAULT_THREAD_TABLE_VIEW,
    active: ACTIVE_THREADS_VIEW,
    last_48_hours: LAST_48_HOURS_VIEW,
    last_7_days: LAST_7_DAYS_VIEW
  }),
  selected_thread_table_view_id: 'active',
  thread_all_columns: Map(thread_columns)
})

// ============================================================================
// Reducer Function
// ============================================================================

export function threads_reducer(state = new ThreadsState(), { payload, type }) {
  switch (type) {
    // ========================================================================
    // Available Tags Actions
    // ========================================================================

    case threads_action_types.GET_THREADS_AVAILABLE_TAGS_PENDING:
      return state.merge({
        is_loading_available_tags: true,
        available_tags_error: null
      })

    case threads_action_types.GET_THREADS_AVAILABLE_TAGS_FULFILLED: {
      const tags = Array.isArray(payload.data) ? payload.data : []
      return state.merge({
        available_tags: new List(tags),
        is_loading_available_tags: false,
        available_tags_error: null
      })
    }

    case threads_action_types.GET_THREADS_AVAILABLE_TAGS_FAILED:
      return state.merge({
        is_loading_available_tags: false,
        available_tags_error: payload.error
      })

    // ========================================================================
    // Basic Threads List Actions
    // ========================================================================

    case threads_action_types.GET_THREADS_PENDING:
      return state.merge({
        is_loading_threads: true,
        threads_error: null
      })

    case threads_action_types.GET_THREADS_FULFILLED: {
      const thread_list = payload.data || []
      return state.merge({
        threads: new List(thread_list),
        is_loading_threads: false,
        threads_error: null
      })
    }

    case threads_action_types.GET_THREADS_FAILED:
      return state.merge({
        is_loading_threads: false,
        threads_error: payload.error
      })

    // ========================================================================
    // Single Thread Actions (page and sheet share the same cache)
    // ========================================================================

    case threads_action_types.GET_THREAD_PENDING:
    case thread_sheet_action_types.GET_SHEET_THREAD_PENDING: {
      const thread_id =
        payload.opts?.thread_id || payload.opts?.params?.thread_id
      if (!thread_id) return state
      return state.setIn(
        ['thread_loading', thread_id],
        Map({ is_loading: true, error: null })
      )
    }

    case threads_action_types.GET_THREAD_FULFILLED:
    case thread_sheet_action_types.GET_SHEET_THREAD_FULFILLED: {
      const thread_data = payload.data
      const thread_id = thread_data?.thread_id
      if (!thread_id) return state

      let new_state = state
        .setIn(['thread_cache', thread_id], Map(thread_data))
        .setIn(
          ['thread_loading', thread_id],
          Map({ is_loading: false, error: null })
        )

      // Re-inject optimistic entry if a pending resume exists
      new_state = reinject_optimistic_entry_if_needed(new_state, thread_id)

      // Also update the thread in the basic threads list if it exists
      new_state = update_thread_in_basic_list(
        new_state,
        thread_id,
        thread_data
      )

      return new_state
    }

    case threads_action_types.GET_THREAD_FAILED:
    case thread_sheet_action_types.GET_SHEET_THREAD_FAILED: {
      const thread_id =
        payload.opts?.thread_id || payload.opts?.params?.thread_id
      if (!thread_id) return state
      return state.setIn(
        ['thread_loading', thread_id],
        Map({ is_loading: false, error: payload.error })
      )
    }

    // ========================================================================
    // Models Data Actions
    // ========================================================================

    case threads_action_types.GET_MODELS_PENDING:
      return state.mergeIn(['models_data'], {
        loading: true,
        error: null
      })

    case threads_action_types.GET_MODELS_FULFILLED:
      return state.mergeIn(['models_data'], {
        loading: false,
        error: null,
        data: Map(payload.data.models || {})
      })

    case threads_action_types.GET_MODELS_FAILED:
      return state.mergeIn(['models_data'], {
        loading: false,
        error: payload.error
      })

    // ========================================================================
    // Auth - Inject user_public_key filter into table views
    // ========================================================================

    case app_actions.POST_USER_SESSION_FULFILLED: {
      const permissions = payload.data?.permissions
      const user_public_key = payload.data?.user_public_key
      if (!permissions?.create_threads || !user_public_key) return state

      const ownership_filter = {
        column_id: 'user_public_key',
        operator: '=',
        value: user_public_key
      }

      const add_ownership_filter = (view, table_state_key) => {
        const where = view.getIn([table_state_key, 'where'])
        if (!where) return view
        const already_has_filter = where.some(
          (f) =>
            (f.get ? f.get('column_id') : f.column_id) === 'user_public_key'
        )
        if (already_has_filter) return view
        return view.updateIn([table_state_key, 'where'], (w) =>
          w.push(new Map(ownership_filter))
        )
      }

      return state.update('thread_table_views', (views) =>
        views.map((view) => {
          let updated = add_ownership_filter(view, 'saved_table_state')
          updated = add_ownership_filter(updated, 'thread_table_state')
          return updated
        })
      )
    }

    case app_actions.CLEAR_AUTH: {
      const remove_ownership_filter = (view, table_state_key) => {
        const where = view.getIn([table_state_key, 'where'])
        if (!where) return view
        return view.updateIn([table_state_key, 'where'], (w) =>
          w.filter(
            (f) =>
              (f.get ? f.get('column_id') : f.column_id) !== 'user_public_key'
          )
        )
      }

      return state
        .set('thread_cache', new Map())
        .set('thread_loading', new Map())
        .update('thread_table_views', (views) =>
          views.map((view) => {
            let updated = remove_ownership_filter(view, 'saved_table_state')
            updated = remove_ownership_filter(updated, 'thread_table_state')
            return updated
          })
        )
    }

    // ========================================================================
    // Table View Management Actions
    // ========================================================================

    case threads_action_types.UPDATE_THREAD_TABLE_VIEW: {
      const { view } = payload
      const view_id = view?.view_id || 'default'
      return state.updateIn(['thread_table_views', view_id], (existing_view) =>
        update_view_on_config_change({
          view: existing_view,
          entity_prefix: 'thread',
          view_id,
          view_name: view?.view_name,
          table_state: view?.table_state
        })
      )
    }

    case threads_action_types.SET_THREAD_TABLE_STATE: {
      const { view_id: set_view_id, table_state: new_table_state } = payload
      const target_view_id = set_view_id || 'active'
      return state.setIn(
        ['thread_table_views', target_view_id, 'thread_table_state'],
        new Map(new_table_state)
      )
    }

    case threads_action_types.SELECT_THREAD_TABLE_VIEW:
      return state.set('selected_thread_table_view_id', payload.view_id)

    case threads_action_types.GET_THREADS_TABLE_PENDING: {
      const view_id_pending = payload.opts?.view_id || 'default'
      return state.updateIn(['thread_table_views', view_id_pending], (view) =>
        on_table_pending({
          view,
          entity_prefix: 'thread',
          is_append: payload.opts?.is_append
        })
      )
    }

    case threads_action_types.GET_THREADS_TABLE_FULFILLED: {
      const is_append = payload.opts?.is_append || false
      const view_id_fulfilled = payload.opts?.view_id || 'default'
      const rows = Array.isArray(payload.data?.rows) ? payload.data.rows : []
      const thread_total_row_count =
        typeof payload.data?.total_row_count === 'number'
          ? payload.data.total_row_count
          : 0

      return state.updateIn(['thread_table_views', view_id_fulfilled], (view) =>
        on_table_fulfilled({
          view,
          entity_prefix: 'thread',
          rows,
          is_append,
          total_row_count: thread_total_row_count
        })
      )
    }

    case threads_action_types.GET_THREADS_TABLE_FAILED: {
      const view_id_failed = payload.opts?.view_id || 'default'
      return state.updateIn(['thread_table_views', view_id_failed], (view) =>
        on_table_failed({
          view,
          entity_prefix: 'thread',
          error: payload.error
        })
      )
    }

    // ========================================================================
    // Thread State Change (from PUT /threads/:id/state response)
    // ========================================================================

    case thread_action_types.PUT_THREAD_STATE_FULFILLED: {
      const thread_data = payload.data
      const thread_id = thread_data?.thread_id
      if (!thread_id) return state

      let new_state = update_thread_in_basic_list(state, thread_id, thread_data)

      // Update cached thread data so the detail page reflects the new state
      new_state = update_thread_cache_entry(
        new_state,
        thread_id,
        (current_data) =>
          current_data ? current_data.merge(thread_data) : current_data
      )

      // Update thread in all table views
      const updated_thread = Map(thread_data)
      new_state = update_thread_in_all_views(
        new_state,
        thread_id,
        () => updated_thread
      )

      return new_state
    }

    // ========================================================================
    // WebSocket Real-Time Thread Events
    // ========================================================================

    case threads_action_types.CREATE_THREAD_SESSION_FULFILLED: {
      // Optimistically add thread to views with session_status: 'queued'
      const { thread_id, job_id } = payload.data
      const prompt = payload.opts?.prompt || ''

      // Check if thread already exists (THREAD_CREATED from watcher may arrive first)
      const already_exists = state
        .get('thread_table_views')
        .some((view) =>
          view
            .get('thread_table_data', List())
            .some((t) => t.get('thread_id') === thread_id)
        )
      if (already_exists) return state

      const optimistic_thread = Map({
        thread_id,
        session_status: 'queued',
        prompt_snippet: prompt.slice(0, 200),
        job_id,
        thread_state: 'active',
        created_at: new Date().toISOString()
      })
      let new_state = add_thread_to_all_views(state, optimistic_thread)
      new_state = add_thread_to_basic_list(new_state, optimistic_thread)
      new_state = new_state.set('session_created_at', Date.now())
      return new_state
    }

    case threads_action_types.THREAD_CREATED: {
      const new_thread = Map(payload.thread)
      let new_state = add_thread_to_all_views(state, new_thread)
      new_state = add_thread_to_basic_list(new_state, new_thread)
      return new_state
    }

    case threads_action_types.THREAD_UPDATED: {
      const updated_thread = Map(payload.thread)
      const thread_id = updated_thread.get('thread_id')

      // Update thread in all table views
      let new_state = update_thread_in_all_views(
        state,
        thread_id,
        () => updated_thread
      )

      // Update cached thread if it exists - MERGE to preserve timeline
      new_state = update_thread_cache_entry(
        new_state,
        thread_id,
        (current_data) =>
          current_data ? current_data.merge(updated_thread) : updated_thread
      )

      // Upsert the basic threads list (handles threads not yet in the list)
      new_state = upsert_thread_in_basic_list(
        new_state,
        thread_id,
        payload.thread
      )

      return new_state
    }

    case threads_action_types.THREAD_TIMELINE_ENTRY_ADDED: {
      const { thread_id, entry } = payload
      const cache_has_thread = state.hasIn(['thread_cache', thread_id])

      log_lifecycle('REDUCER', 'THREAD_TIMELINE_ENTRY_ADDED', {
        thread_id,
        entry_id: entry.id,
        entry_type: entry.type,
        entry_role: entry.role,
        truncated: !!entry.truncated,
        cache_has_thread
      })

      // Only append full (non-truncated) entries to cached thread timelines.
      // Truncated entries are received when the client is not subscribed to the
      // thread and contain only summary fields for session card display.
      let new_state = state
      if (!entry.truncated) {
        // If this is a user message, check for and replace any optimistic entry
        if (entry.type === 'message' && entry.role === 'user') {
          new_state = update_thread_cache_entry(
            new_state,
            thread_id,
            (thread_data) =>
              thread_data.update('timeline', (timeline) => {
                if (!timeline || !Array.isArray(timeline)) return timeline
                const optimistic_index = timeline.findIndex(
                  (e) => e._optimistic && e.role === 'user'
                )
                if (optimistic_index !== -1) {
                  const updated = [...timeline]
                  updated[optimistic_index] = entry
                  return updated
                }
                return timeline
              })
          )
          // If we replaced an optimistic entry, don't append again
          const current_timeline = new_state.getIn([
            'thread_cache',
            thread_id,
            'timeline'
          ])
          const already_has_entry =
            current_timeline &&
            Array.isArray(current_timeline) &&
            current_timeline.some((e) => e.id === entry.id)
          if (!already_has_entry) {
            new_state = append_timeline_entry(new_state, thread_id, entry)
          }
        } else {
          new_state = append_timeline_entry(new_state, thread_id, entry)
        }
      }

      // Update the basic threads list with the latest_timeline_event
      if (entry.type !== 'system') {
        new_state = update_thread_in_basic_list(new_state, thread_id, {
          latest_timeline_event: entry
        })
      }

      return new_state
    }

    // ========================================================================
    // Thread Resume Lifecycle
    // ========================================================================

    case threads_action_types.RESUME_THREAD_SESSION_PENDING: {
      const { opts } = payload
      const thread_id = opts.thread_id
      if (!thread_id) return state
      return state.setIn(
        ['thread_pending_resumes', thread_id],
        Map({
          prompt: opts.prompt || '',
          prompt_snippet: (opts.prompt || '').slice(0, 120),
          status: 'submitted',
          job_id: null,
          queue_position: null,
          error_message: null,
          submitted_at: new Date().toISOString()
        })
      )
    }

    case threads_action_types.RESUME_THREAD_SESSION_FULFILLED: {
      const { opts, data } = payload
      const thread_id = opts.thread_id
      if (!thread_id || !state.hasIn(['thread_pending_resumes', thread_id])) {
        return state
      }
      let new_state = state.updateIn(
        ['thread_pending_resumes', thread_id],
        (entry) =>
          entry.merge({
            status: 'queued',
            job_id: data?.job_id || null,
            queue_position: data?.queue_position ?? null
          })
      )

      // Insert optimistic user message into the cached thread timeline
      if (opts.prompt) {
        const now = new Date().toISOString()
        const optimistic_entry = {
          id: `optimistic-${thread_id}-${Date.now()}`,
          type: 'message',
          role: 'user',
          content: opts.prompt,
          timestamp: now,
          created_at: now,
          _optimistic: true
        }
        new_state = append_timeline_entry(
          new_state,
          thread_id,
          optimistic_entry
        )
      }

      return new_state
    }

    case threads_action_types.RESUME_THREAD_SESSION_FAILED: {
      const { opts, error } = payload
      const thread_id = opts.thread_id
      if (!thread_id || !state.hasIn(['thread_pending_resumes', thread_id])) {
        return state
      }
      let new_state = state.updateIn(
        ['thread_pending_resumes', thread_id],
        (entry) =>
          entry.merge({
            status: 'failed',
            error_message: error || 'Resume failed'
          })
      )
      new_state = remove_optimistic_entries(new_state, thread_id)
      return new_state
    }

    case threads_action_types.THREAD_JOB_STARTED: {
      const { job_id, thread_id } = payload
      // Direct match by thread_id from the event
      if (thread_id && state.hasIn(['thread_pending_resumes', thread_id])) {
        return state.updateIn(['thread_pending_resumes', thread_id], (entry) =>
          entry.set('status', 'starting')
        )
      }
      // Fallback: find entry by job_id
      if (job_id) {
        const match = state
          .get('thread_pending_resumes')
          .findEntry((entry) => entry.get('job_id') === job_id)
        if (match) {
          const [matched_thread_id] = match
          return state.updateIn(
            ['thread_pending_resumes', matched_thread_id],
            (entry) => entry.set('status', 'starting')
          )
        }
      }
      return state
    }

    case active_sessions_action_types.ACTIVE_SESSION_STARTED: {
      const { session } = payload
      // Clear pending resume when the real session starts
      const thread_id = session?.thread_id
      if (thread_id && state.hasIn(['thread_pending_resumes', thread_id])) {
        return state.deleteIn(['thread_pending_resumes', thread_id])
      }
      // Fallback: match by job_id
      if (session?.job_id) {
        const match = state
          .get('thread_pending_resumes')
          .findEntry((entry) => entry.get('job_id') === session.job_id)
        if (match) {
          return state.deleteIn(['thread_pending_resumes', match[0]])
        }
      }
      return state
    }

    case threads_action_types.THREAD_JOB_FAILED: {
      const { job_id, thread_id: failed_thread_id } = payload
      if (!job_id) return state

      // Update session_status to 'failed' on the thread in table views
      let new_state = state
      if (failed_thread_id) {
        new_state = update_thread_in_all_views(
          new_state,
          failed_thread_id,
          (thread) => thread.set('session_status', 'failed')
        )
      } else {
        // Match by job_id in table views
        new_state = state.update('thread_table_views', (views) =>
          views.map((view) =>
            view.updateIn(['thread_table_data'], (data) =>
              data
                ? data.map((thread) =>
                    thread.get('job_id') === job_id
                      ? thread.set('session_status', 'failed')
                      : thread
                  )
                : data
            )
          )
        )
      }

      const match = new_state
        .get('thread_pending_resumes')
        .findEntry((entry) => entry.get('job_id') === job_id)
      if (match) {
        const [matched_thread_id] = match
        new_state = new_state.updateIn(
          ['thread_pending_resumes', matched_thread_id],
          (entry) =>
            entry.merge({
              status: 'failed',
              error_message: payload.error_message || 'Job failed'
            })
        )
        new_state = remove_optimistic_entries(new_state, matched_thread_id)
      }
      return new_state
    }

    default:
      return state
  }
}
