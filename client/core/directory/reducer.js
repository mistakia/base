import { Record, List } from 'immutable'

import { directory_action_types } from './actions'

const DirectoryState = new Record({
  current_path: '',
  directory_items: new List(),
  file_data: null,
  path_info: null,
  directory_markdown_file: null,
  is_loading_directory: false,
  is_loading_file: false,
  is_loading_path_info: false,
  is_loading_directory_markdown: false,
  directory_error: null,
  file_error: null,
  path_info_error: null,
  directory_markdown_error: null
})

export function directory_reducer(
  state = new DirectoryState(),
  { payload, type }
) {
  switch (type) {
    case directory_action_types.GET_DIRECTORIES_PENDING:
      return state.merge({
        is_loading_directory: true,
        directory_error: null
      })

    case directory_action_types.GET_DIRECTORIES_FULFILLED:
      return state.merge({
        directory_items: new List(payload.data?.items || []),
        is_loading_directory: false,
        directory_error: null
      })

    case directory_action_types.GET_DIRECTORIES_FAILED:
      return state.merge({
        is_loading_directory: false,
        directory_error: payload.error
      })

    case directory_action_types.GET_FILE_CONTENT_PENDING:
      return state.merge({
        is_loading_file: true,
        file_error: null
      })

    case directory_action_types.GET_FILE_CONTENT_FULFILLED:
      return state.merge({
        file_data: payload.data || null,
        current_path: payload.data?.path || '',
        is_loading_file: false,
        file_error: null
      })

    case directory_action_types.GET_FILE_CONTENT_FAILED:
      return state.merge({
        file_data: null,
        is_loading_file: false,
        file_error: payload.error
      })

    case directory_action_types.GET_PATH_INFO_PENDING:
      return state.merge({
        is_loading_path_info: true,
        path_info_error: null
      })

    case directory_action_types.GET_PATH_INFO_FULFILLED:
      return state.merge({
        path_info: payload.data || null,
        is_loading_path_info: false,
        path_info_error: null
      })

    case directory_action_types.GET_PATH_INFO_FAILED:
      return state.merge({
        is_loading_path_info: false,
        path_info_error: payload.error
      })

    case directory_action_types.GET_DIRECTORY_MARKDOWN_PENDING:
      return state.merge({
        is_loading_directory_markdown: true,
        directory_markdown_error: null
      })

    case directory_action_types.GET_DIRECTORY_MARKDOWN_FULFILLED:
      return state.merge({
        directory_markdown_file: payload.data || null,
        is_loading_directory_markdown: false,
        directory_markdown_error: null
      })

    case directory_action_types.GET_DIRECTORY_MARKDOWN_FAILED:
      return state.merge({
        directory_markdown_file: null,
        is_loading_directory_markdown: false,
        directory_markdown_error: payload.error
      })

    default:
      return state
  }
}
