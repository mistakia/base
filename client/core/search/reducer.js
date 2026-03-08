import { Record, List, Map } from 'immutable'

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
    regex: /^(?:in|dir):(\S+)$/,
    key: 'in',
    chip_type: 'operator',
    label_fn: (v) => `in: ${v}`
  }
]

function parse_query_input(raw_query, existing_chips = new List()) {
  let chips = existing_chips
  let query = raw_query

  // Mode detection: # or ? at start followed by at least one more character
  if (query.length >= 2 && (query[0] === '#' || query[0] === '?')) {
    // Only add and strip if no mode chip already exists
    if (!chips.some((c) => c.type === 'mode')) {
      const mode = query[0] === '#' ? 'content' : 'semantic'
      const label = query[0] === '#' ? 'Content' : 'Semantic'
      chips = chips.push({ type: 'mode', key: 'mode', value: mode, label })
      query = query.slice(1).trimStart()
    }
  }

  // Operator parsing: split on spaces, convert completed tokens (not the last
  // token unless the raw query ends with a space, indicating the user pressed space)
  const tokens = query.split(/\s+/)
  const remaining_tokens = []
  const ends_with_space = query.length > 0 && query[query.length - 1] === ' '

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue

    // Only convert a token to a chip if it's not the last token, or if
    // the query ends with a space (user committed the token with space)
    const is_committed = i < tokens.length - 1 || ends_with_space

    if (!is_committed) {
      remaining_tokens.push(token)
      continue
    }

    let matched = false

    // Check value operators (type:, tag:, in:, dir:)
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

    // Check exclude terms: -term at word boundary
    if (!matched && token.match(/^-(\S+)$/) && token.length > 1) {
      const value = token.slice(1)
      const chip = {
        type: 'exclude',
        key: 'exclude',
        value,
        label: `-${value}`
      }
      if (!chips.some((c) => c.key === chip.key && c.value === chip.value)) {
        chips = chips.push(chip)
      }
      matched = true
    }

    if (!matched) {
      remaining_tokens.push(token)
    }
  }

  let result_query = remaining_tokens.join(' ')
  // Preserve trailing space so the controlled input doesn't eat spaces.
  // The trailing space is what the user just typed to commit a token.
  if (ends_with_space && remaining_tokens.length > 0) {
    result_query += ' '
  }
  return { chips, query: result_query }
}

const SearchState = new Record({
  is_open: false,
  query: '',
  chips: new List(),
  results: new Map({
    files: new List(),
    threads: new List(),
    entities: new List(),
    directories: new List()
  }),
  content_results: new List(),
  semantic_results: new List(),
  semantic_available: true,
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
      return state.merge({
        query,
        chips,
        selected_index: 0
      })
    }

    case search_action_types.REMOVE_CHIP: {
      const chips = state.get('chips').delete(payload.index)
      return state.merge({
        chips,
        selected_index: 0
      })
    }

    case search_action_types.SEARCH_REQUEST:
      return state.merge({
        is_loading: true,
        error: null
      })

    case search_action_types.SEARCH_SUCCESS: {
      const results = payload.results || {}
      const mode = results.mode

      if (mode === 'content') {
        return state.merge({
          is_loading: false,
          content_results: new List(results.content_results || []),
          total: results.total || 0,
          selected_index: 0
        })
      }

      if (mode === 'semantic') {
        return state.merge({
          is_loading: false,
          semantic_results: new List(results.semantic_results || []),
          semantic_available: results.available !== false,
          total: results.total || 0,
          selected_index: 0
        })
      }

      return state.merge({
        is_loading: false,
        results: new Map({
          files: new List(results.files || []),
          threads: new List(results.threads || []),
          entities: new List(results.entities || []),
          directories: new List(results.directories || [])
        }),
        total: results.total || 0,
        selected_index: 0
      })
    }

    case search_action_types.SEARCH_FAILURE:
      return state.merge({
        is_loading: false,
        error: payload.error
      })

    case search_action_types.CLEAR_SEARCH:
      return state.merge({
        query: '',
        chips: new List(),
        results: new Map({
          files: new List(),
          threads: new List(),
          entities: new List(),
          directories: new List()
        }),
        content_results: new List(),
        semantic_results: new List(),
        semantic_available: true,
        selected_index: 0,
        total: 0
      })

    case search_action_types.CLEAR_SEARCH_RESULTS:
      return state.merge({
        results: new Map({
          files: new List(),
          threads: new List(),
          entities: new List(),
          directories: new List()
        }),
        content_results: new List(),
        semantic_results: new List(),
        semantic_available: true,
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
