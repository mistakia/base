export const database_table_actions = {
  LOAD_DATABASE: 'LOAD_DATABASE',

  GET_DATABASE_PENDING: 'GET_DATABASE_PENDING',
  GET_DATABASE_FAILED: 'GET_DATABASE_FAILED',
  GET_DATABASE_FULFILLED: 'GET_DATABASE_FULFILLED',

  load_database: ({ user_id, database_table_name }) => ({
    type: database_table_actions.LOAD_DATABASE,
    payload: {
      user_id,
      database_table_name
    }
  }),

  get_database_pending: (opts) => ({
    type: database_table_actions.GET_DATABASE_PENDING,
    payload: {
      opts
    }
  }),

  get_database_failed: (opts, error) => ({
    type: database_table_actions.GET_DATABASE_FAILED,
    payload: {
      opts,
      error
    }
  }),

  get_database_fulfilled: (opts, data) => ({
    type: database_table_actions.GET_DATABASE_FULFILLED,
    payload: {
      opts,
      data
    }
  })
}

export const get_database_request_actions = {
  pending: database_table_actions.get_database_pending,
  failed: database_table_actions.get_database_failed,
  fulfilled: database_table_actions.get_database_fulfilled
}
