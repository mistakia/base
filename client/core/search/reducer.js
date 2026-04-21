import { Record, List } from 'immutable'

import { search_action_types } from './actions.js'

const OPERATOR_PATTERNS = [
  {
    regex: /^(?:type|t):(\S+)$/,
    key: 'type',
    chip_type: 'operator',
    label_fn: (v) => `type: ${v}`
  },
  {
    regex: /^tag:(\S+)$/,
    key: 'tag',
    chip_type: 'operator',
    label_fn: (v) => `tag: ${v}`
  },
  {
    regex: /^status:(\S+)$/,
    key: 'status',
    chip_type: 'operator',
    label_fn: (v) => `status: ${v}`
  },
  {
    regex: /^source:(\S+)$/,
    key: 'source',
    chip_type: 'operator',
    label_fn: (v) => `source: ${v}`
  },
  {
    regex: /^path:(\S+)$/,
    key: 'path',
    chip_type: 'operator',
    label_fn: (v) => `path: ${v}`
  }
]

function parse_query_input(raw_query, existing_chips = new List()) {
  let chips = existing_chips
  let query = raw_query

  // `?` prefix opts into the semantic source — the only mode-style shortcut
  // retained after the source-first refactor.
  if (query.length >= 2 && query[0] === '?') {
    if (!chips.some((c) => c.key === 'source')) {
      chips = chips.push({
        type: 'operator',
        key: 'source',
        value: 'semantic',
        label: 'source: semantic'
      })
      query = query.slice(1).trimStart()
    }
  }

  const tokens = query.split(/\s+/)
  const remaining_tokens = []
  const ends_with_space = query.length > 0 && query[query.length - 1] === ' '

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue

    const is_committed = i < tokens.length - 1 || ends_with_space
    if (!is_committed) {
      remaining_tokens.push(token)
      continue
    }

    let matched = false

    for (const pattern of OPERATOR_PATTERNS) {
      const match = token.match(pattern.regex)
      if (match) {
        const value = match[1]
        const chip = {
          type: pattern.chip_type,
          key: pattern.key,
          value,
          label: pattern.label_fn(value)
        }
        if (!chips.some((c) => c.key === chip.key && c.value === chip.value)) {
          chips = chips.push(chip)
        }
        matched = true
        break
      }
    }

    if (!matched) remaining_tokens.push(token)
  }

  let result_query = remaining_tokens.join(' ')
  if (ends_with_space && remaining_tokens.length > 0) result_query += ' '
  return { chips, query: result_query }
}

const SearchState = new Record({
  is_open: false,
  query: '',
  chips: new List(),
  results: new List(),
  is_loading: false,
  error: null,
  selected_index: 0,
  total: 0,
  recent_files: new List(),
  recent_files_loading: false,
  recent_files_loaded: false,
  recent_files_error: null
})

export function search_reducer(state = new SearchState(), { payload, type }) {
  switch (type) {
    case search_action_types.OPEN_COMMAND_PALETTE:
      return state.set('is_open', true)

    case search_action_types.CLOSE_COMMAND_PALETTE:
      return new SearchState()

    case search_action_types.SET_SEARCH_QUERY: {
      const { chips, query } = parse_query_input(
        payload.query,
        state.get('chips')
      )
      return state.merge({ query, chips, selected_index: 0 })
    }

    case search_action_types.REMOVE_CHIP: {
      const chips = state.get('chips').delete(payload.index)
      return state.merge({ chips, selected_index: 0 })
    }

    case search_action_types.SEARCH_REQUEST:
      return state.merge({ is_loading: true, error: null })

    case search_action_types.SEARCH_SUCCESS: {
      const response = payload.results || {}
      return state.merge({
        is_loading: false,
        results: new List(response.results || []),
        total: response.total || 0,
        selected_index: 0
      })
    }

    case search_action_types.SEARCH_FAILURE:
      return state.merge({ is_loading: false, error: payload.error })

    case search_action_types.CLEAR_SEARCH:
      return state.merge({
        query: '',
        chips: new List(),
        results: new List(),
        selected_index: 0,
        total: 0
      })

    case search_action_types.CLEAR_SEARCH_RESULTS:
      return state.merge({
        results: new List(),
        selected_index: 0,
        total: 0
      })

    case search_action_types.SET_SELECTED_INDEX:
      return state.set('selected_index', payload.index)

    case search_action_types.FETCH_RECENT_FILES_REQUEST:
      return state.merge({
        recent_files_loading: true,
        recent_files_error: null
      })

    case search_action_types.FETCH_RECENT_FILES_SUCCESS:
      return state.merge({
        recent_files: new List(payload.files || []),
        recent_files_loading: false,
        recent_files_loaded: true
      })

    case search_action_types.FETCH_RECENT_FILES_FAILURE:
      return state.merge({
        recent_files_loading: false,
        recent_files_error: payload.error
      })

    default:
      return state
  }
}
