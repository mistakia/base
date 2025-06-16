import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'

export const directories_actions = {
  LOAD_DIRECTORIES: 'LOAD_DIRECTORIES',
  LOAD_FILE_CONTENT: 'LOAD_FILE_CONTENT',
  TOGGLE_DIRECTORY: 'TOGGLE_DIRECTORY',
  CLEAR_FILE_CONTENT: 'CLEAR_FILE_CONTENT',

  load_directories: ({ type, path }) => ({
    type: directories_actions.LOAD_DIRECTORIES,
    payload: {
      type,
      path
    }
  }),

  load_file_content: ({ type, path }) => ({
    type: directories_actions.LOAD_FILE_CONTENT,
    payload: {
      type,
      path
    }
  }),

  toggle_directory: ({ type, path }) => ({
    type: directories_actions.TOGGLE_DIRECTORY,
    payload: {
      type,
      path
    }
  }),

  clear_file_content: () => ({
    type: directories_actions.CLEAR_FILE_CONTENT
  }),

  ...create_api_action_types('GET_DIRECTORIES'),
  ...create_api_action_types('GET_FILE_CONTENT')
}

export const get_directories_request_actions =
  create_api_actions('GET_DIRECTORIES')
export const get_file_content_request_actions =
  create_api_actions('GET_FILE_CONTENT')
