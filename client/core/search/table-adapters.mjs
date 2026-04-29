// Base-specific table search adapters. Self-registers on module load so the
// registry is populated before any table component mounts. The actual server
// fetch (and the response's row_highlights map) is owned by the table sagas
// and reducers; this adapter only translates the user query into a state_patch
// that flows through table_state.q to /api/{threads,tasks}/table.

import { register_search_adapter } from 'react-table/src/search/registry.js'

const server_q_adapter = {
  id: 'server_q',

  validate(view_search_config) {
    if (!view_search_config || !view_search_config.entity_type) {
      return 'server_q adapter requires view.search.entity_type'
    }
    return null
  },

  async run({ query }) {
    const trimmed = (query || '').trim()
    if (!trimmed) {
      return { state_patch: { q: null } }
    }
    return { state_patch: { q: trimmed } }
  }
}

register_search_adapter(server_q_adapter)

export default server_q_adapter
