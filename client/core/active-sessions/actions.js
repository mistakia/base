import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_ACTIVE_SESSIONS = 'GET_ACTIVE_SESSIONS'

export const active_sessions_action_types = {
  ...create_api_action_types(GET_ACTIVE_SESSIONS),

  LOAD_ACTIVE_SESSIONS: 'LOAD_ACTIVE_SESSIONS',

  // WebSocket events for real-time updates
  ACTIVE_SESSION_STARTED: 'ACTIVE_SESSION_STARTED',
  ACTIVE_SESSION_UPDATED: 'ACTIVE_SESSION_UPDATED',
  ACTIVE_SESSION_ENDED: 'ACTIVE_SESSION_ENDED'
}

export const get_active_sessions_actions =
  create_api_actions(GET_ACTIVE_SESSIONS)

export const active_sessions_actions = {
  load_active_sessions: () => ({
    type: active_sessions_action_types.LOAD_ACTIVE_SESSIONS
  }),

  // WebSocket event action creators (dispatched by WebSocket service)
  active_session_started: (session) => ({
    type: active_sessions_action_types.ACTIVE_SESSION_STARTED,
    payload: { session }
  }),

  active_session_updated: (session) => ({
    type: active_sessions_action_types.ACTIVE_SESSION_UPDATED,
    payload: { session }
  }),

  active_session_ended: (session_id) => ({
    type: active_sessions_action_types.ACTIVE_SESSION_ENDED,
    payload: { session_id }
  })
}
