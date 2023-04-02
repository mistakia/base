export const folder_path_actions = {
  LOAD_FOLDER_PATH: 'LOAD_FOLDER_PATH',

  GET_FOLDER_PATH_PENDING: 'GET_FOLDER_PATH_PENDING',
  GET_FOLDER_PATH_FAILED: 'GET_FOLDER_PATH_FAILED',
  GET_FOLDER_PATH_FULFILLED: 'GET_FOLDER_PATH_FULFILLED',

  load_folder_path: ({ folder_path }) => ({
    type: folder_path_actions.LOAD_FOLDER_PATH,
    payload: { folder_path }
  }),

  get_folder_path_pending: ({ opts }) => ({
    type: folder_path_actions.GET_FOLDER_PATH_PENDING,
    payload: { opts }
  }),

  get_folder_path_failed: ({ opts, error }) => ({
    type: folder_path_actions.GET_FOLDER_PATH_FAILED,
    payload: { opts, error }
  }),

  get_folder_path_fulfilled: ({ opts, data }) => ({
    type: folder_path_actions.GET_FOLDER_PATH_FULFILLED,
    payload: { opts, data }
  })
}

export const get_folder_path_request_actions = {
  pending: folder_path_actions.get_folder_path_pending,
  failed: folder_path_actions.get_folder_path_failed,
  fulfilled: folder_path_actions.get_folder_path_fulfilled
}
