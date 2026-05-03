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
 * Builds the shape used for an optimistic user message, before the real
 * timeline entry arrives via THREAD_TIMELINE_ENTRY_ADDED.
 */
function build_optimistic_user_entry({ thread_id, prompt, timestamp }) {
  return {
    id: `optimistic-${thread_id}-${Date.now()}`,
    type: 'message',
    role: 'user',
    content: prompt,
    timestamp,
    created_at: timestamp,
    _optimistic: true
  }
}

function append_to_timeline_array(timeline, entry) {
  if (!timeline || !Array.isArray(timeline)) return [entry]
  if (timeline.some((e) => e.id === entry.id)) return timeline
  return [...timeline, entry]
}

/**
 * Appends a timeline entry to a cached thread. No-ops if the thread is not
 * already in cache -- use append_or_seed_timeline_entry when the caller needs
 * the entry to land before the thread has been fetched.
 */
function append_timeline_entry(state, thread_id, entry) {
  return update_thread_cache_entry(state, thread_id, (thread_data) =>
    thread_data.update('timeline', (timeline) =>
      append_to_timeline_array(timeline, entry)
    )
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
 * Like append_timeline_entry, but seeds a minimal cache entry if none exists.
 * Needed for newly-created threads whose cache has not been populated yet by
 * GET_(SHEET_)THREAD_FULFILLED.
 */
function append_or_seed_timeline_entry(state, thread_id, entry, seed = {}) {
  if (state.hasIn(['thread_cache', thread_id])) {
    return append_timeline_entry(state, thread_id, entry)
  }
  return state.setIn(
    ['thread_cache', thread_id],
    Map({ thread_id, ...seed, timeline: [entry] })
  )
}

function preserve_optimistic_entries(existing_timeline, fresh_timeline) {
  if (!existing_timeline || !Array.isArray(existing_timeline)) {
    return fresh_timeline
  }
  const base = Array.isArray(fresh_timeline) ? fresh_timeline : []
  const base_ids = new Set(base.map((e) => e?.id).filter(Boolean))

  // Preserve real (non-optimistic) entries that landed in cache via
  // THREAD_TIMELINE_ENTRY_ADDED while this fetch was in flight. The server
  // snapshot reflects timeline state at request time and can omit entries
  // written between request and response; without this merge those entries
  // are silently overwritten and only reappear on manual refresh.
  const real_kept = existing_timeline.filter(
    (e) => e && !e._optimistic && e.id && !base_ids.has(e.id)
  )

  // Drop optimistic entries whose real counterpart is already present. User
  // messages carry distinct ids but arrive with role=user+type=message, so
  // match by (role, type, content) within a small time window.
  const optimistic = existing_timeline.filter((e) => e._optimistic)
  const optimistic_kept = optimistic.filter((opt) => {
    return !base.some(
      (e) =>
        !e._optimistic &&
        e.type === opt.type &&
        e.role === opt.role &&
        (e.content === opt.content ||
          e.content?.parts?.[0]?.text === opt.content)
    )
  })

  if (real_kept.length === 0 && optimistic_kept.length === 0) return base
  return [...base, ...real_kept, ...optimistic_kept]
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

  // Timeline entries from the server use `timestamp`, not `created_at`
  const has_recent_user_message = timeline.some(
    (e) =>
      e.type === 'message' &&
      e.role === 'user' &&
      !e._optimistic &&
      (e.timestamp || e.created_at) >= submitted_at
  )
  if (has_recent_user_message) return state

  if (timeline.some((e) => e._optimistic)) return state

  return append_timeline_entry(
    state,
    thread_id,
    build_optimistic_user_entry({
      thread_id,
      prompt: pending_resume.get('prompt'),
      timestamp: submitted_at
    })
  )
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
  sort: [{ column_id: 'created_at', desc: true }]
})

const SEARCH_CONFIG = {
  search: { type: 'server_q', entity_type: 'thread' }
}

const DEFAULT_THREAD_TABLE_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'default',
  view_name: 'All Threads',
  table_state: DEFAULT_TABLE_STATE
}).merge(SEARCH_CONFIG)

const ACTIVE_THREADS_VIEW = create_view({
  entity_prefix: 'thread',
  view_id: 'active',
  view_name: 'Active Threads',
  table_state: create_default_table_state({
    columns: DEFAULT_TABLE_COLUMNS,
    sort: [{ column_id: 'created_at', desc: true }],
    where: new List([
      {
        column_id: 'thread_state',
        operator: '=',
        value: 'active'
      }
    ])
  })
}).merge(SEARCH_CONFIG)

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
}).merge(SEARCH_CONFIG)

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
}).merge(SEARCH_CONFIG)

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

      // Preserve optimistic entries from the existing cache so a fetch during
      // queued/starting (or immediately after create/resume) does not erase
      // the user-visible prompt before the real entry arrives via
      // THREAD_TIMELINE_ENTRY_ADDED.
      const existing_timeline = state.getIn([
        'thread_cache',
        thread_id,
        'timeline'
      ])
      const merged_timeline = preserve_optimistic_entries(
        existing_timeline,
        thread_data.timeline
      )
      const merged_data = Map({
        ...thread_data,
        timeline: merged_timeline
      })

      let new_state = state
        .setIn(['thread_cache', thread_id], merged_data)
        .setIn(
          ['thread_loading', thread_id],
          Map({ is_loading: false, error: null })
        )

      // Re-inject optimistic entry if a pending resume exists
      new_state = reinject_optimistic_entry_if_needed(new_state, thread_id)

      // Also update the thread in the basic threads list if it exists
      new_state = update_thread_in_basic_list(new_state, thread_id, thread_data)

      return new_state
    }

    case threads_action_types.GET_THREAD_FAILED:
    case thread_sheet_action_types.GET_SHEET_THREAD_FAILED: {
      const thread_id =
        payload.opts?.thread_id || payload.opts?.params?.thread_id
      if (!thread_id) return state

      // Brand-new threads can 404 briefly after CREATE_THREAD_SESSION_FULFILLED
      // seeds the cache, before the worker writes metadata.json to disk. In
      // that window the cache already holds the optimistic user message and
      // subsequent WebSocket entries will land via THREAD_TIMELINE_ENTRY_ADDED,
      // so surfacing an error would unnecessarily blank the timeline. If the
      // cache was seeded with an optimistic entry, swallow the error.
      const timeline = state.getIn(['thread_cache', thread_id, 'timeline'])
      const has_optimistic =
        Array.isArray(timeline) && timeline.some((e) => e._optimistic)
      if (has_optimistic) {
        return state.setIn(
          ['thread_loading', thread_id],
          Map({ is_loading: false, error: null })
        )
      }

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
      const row_highlights =
        payload.data?.row_highlights &&
        typeof payload.data.row_highlights === 'object'
          ? payload.data.row_highlights
          : {}

      return state.updateIn(['thread_table_views', view_id_fulfilled], (view) =>
        on_table_fulfilled({
          view,
          entity_prefix: 'thread',
          rows,
          is_append,
          total_row_count: thread_total_row_count,
          row_highlights
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

      // The THREAD_CREATED WebSocket event can race the HTTP fulfilled
      // response and add the thread to views before this reducer runs. Skip
      // adding it to views again in that case, but still seed the cache
      // timeline below -- the WebSocket path does not carry the prompt and
      // never seeds the optimistic user message.
      const already_in_views = state
        .get('thread_table_views')
        .some((view) =>
          view
            .get('thread_table_data', List())
            .some((t) => t.get('thread_id') === thread_id)
        )

      let new_state = state.set('session_created_at', Date.now())
      if (!already_in_views) {
        const optimistic_thread = Map({
          thread_id,
          session_status: 'queued',
          prompt_snippet: prompt.slice(0, 200),
          job_id,
          thread_state: 'active',
          created_at: new Date().toISOString()
        })
        new_state = add_thread_to_all_views(new_state, optimistic_thread)
        new_state = add_thread_to_basic_list(new_state, optimistic_thread)
      }

      // Insert optimistic user message so the timeline is not empty while
      // the session is queued / starting up. The cache entry has not been
      // fetched yet for a brand-new thread, so seed it rather than no-op.
      if (prompt) {
        const now = new Date().toISOString()
        new_state = append_or_seed_timeline_entry(
          new_state,
          thread_id,
          build_optimistic_user_entry({ thread_id, prompt, timestamp: now }),
          { session_status: 'queued', job_id, thread_state: 'active' }
        )
      }

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

      // Atomically hand off from the resume indicator to the lifecycle
      // indicator: clear pending_resume in the same dispatch that sets
      // session_status on the thread cache. If we cleared on
      // ACTIVE_SESSION_STARTED instead, there is a brief window where
      // pending_resume is gone but session_status has not yet caught up to
      // 'active' / 'idle', causing the indicator to flicker through a stale
      // intermediate state. Only hand off on terminally-live statuses
      // ('active' / 'idle'); 'queued' / 'starting' duplicate what the resume
      // indicator already shows.
      const next_status = updated_thread.get('session_status')
      if (
        thread_id &&
        (next_status === 'active' || next_status === 'idle') &&
        new_state.hasIn(['thread_pending_resumes', thread_id])
      ) {
        new_state = new_state.deleteIn(['thread_pending_resumes', thread_id])
      }

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
      //
      // Seed the cache when missing: WS events for a freshly-created or
      // freshly-opened thread can arrive before GET_(SHEET_)THREAD_FULFILLED
      // populates the cache. Without seeding, those entries silently no-op
      // and the GET response (taken at request time) may not include them
      // either, leaving the assistant message invisible until manual refresh.
      // The matching merge in preserve_optimistic_entries keeps the seeded
      // entries when the GET response lands.
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
            new_state = append_or_seed_timeline_entry(
              new_state,
              thread_id,
              entry
            )
          }
        } else {
          new_state = append_or_seed_timeline_entry(new_state, thread_id, entry)
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
      const submitted_at = new Date().toISOString()
      let new_state = state.setIn(
        ['thread_pending_resumes', thread_id],
        Map({
          prompt: opts.prompt || '',
          prompt_snippet: (opts.prompt || '').slice(0, 120),
          status: 'submitted',
          job_id: null,
          queue_position: null,
          error_message: null,
          submitted_at
        })
      )

      // Injected on PENDING (not FULFILLED) so the UI updates on submit;
      // reinject_optimistic_entry_if_needed restores it after a later fetch
      // populates the cache.
      if (opts.prompt) {
        new_state = append_timeline_entry(
          new_state,
          thread_id,
          build_optimistic_user_entry({
            thread_id,
            prompt: opts.prompt,
            timestamp: submitted_at
          })
        )
      }
      return new_state
    }

    case threads_action_types.RESUME_THREAD_SESSION_FULFILLED: {
      const { opts, data } = payload
      const thread_id = opts.thread_id
      if (!thread_id || !state.hasIn(['thread_pending_resumes', thread_id])) {
        return state
      }
      return state.updateIn(['thread_pending_resumes', thread_id], (entry) =>
        entry.merge({
          status: 'queued',
          job_id: data?.job_id || null,
          queue_position: data?.queue_position ?? null
        })
      )
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
      // Intentionally do not clear pending_resume here. The handoff to the
      // lifecycle indicator happens in THREAD_UPDATED when session_status
      // becomes 'active' / 'idle', so the cached thread.session_status and
      // the deletion of pending_resume happen in the same reducer dispatch.
      // Clearing on ACTIVE_SESSION_STARTED races THREAD_UPDATED and produces
      // a visible flicker between 'starting' and the active verb. Failed and
      // resume-side errors are still cleared via THREAD_JOB_FAILED and
      // RESUME_THREAD_SESSION_FAILED respectively.
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
