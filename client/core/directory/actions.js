import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_DIRECTORIES = 'GET_DIRECTORIES'
const GET_FILE_CONTENT = 'GET_FILE_CONTENT'
const GET_PATH_INFO = 'GET_PATH_INFO'
const GET_DIRECTORY_MARKDOWN = 'GET_DIRECTORY_MARKDOWN'

export const directory_action_types = {
  ...create_api_action_types(GET_DIRECTORIES),
  ...create_api_action_types(GET_FILE_CONTENT),
  ...create_api_action_types(GET_PATH_INFO),
  ...create_api_action_types(GET_DIRECTORY_MARKDOWN),

  LOAD_DIRECTORY: 'LOAD_DIRECTORY',
  LOAD_FILE: 'LOAD_FILE',
  LOAD_PATH_INFO: 'LOAD_PATH_INFO',
  LOAD_DIRECTORY_MARKDOWN: 'LOAD_DIRECTORY_MARKDOWN'
}

export const get_directories_request_actions =
  create_api_actions(GET_DIRECTORIES)
export const get_file_content_request_actions =
  create_api_actions(GET_FILE_CONTENT)
export const get_path_info_request_actions = create_api_actions(GET_PATH_INFO)
export const get_directory_markdown_request_actions = create_api_actions(
  GET_DIRECTORY_MARKDOWN
)

export const directory_actions = {
  load_directory: (path) => ({
    type: directory_action_types.LOAD_DIRECTORY,
    payload: { path }
  }),

  load_file: (path) => ({
    type: directory_action_types.LOAD_FILE,
    payload: { path }
  }),

  load_path_info: (path) => ({
    type: directory_action_types.LOAD_PATH_INFO,
    payload: { path }
  }),

  load_directory_markdown: (path) => ({
    type: directory_action_types.LOAD_DIRECTORY_MARKDOWN,
    payload: { path }
  })
}
