import { Record } from 'immutable'

export const create_directory = ({
  name,
  path,
  type,
  has_subdirectories = false
} = {}) =>
  Record({
    name,
    path,
    type,
    has_subdirectories
  })()

export const create_file = ({ name, path, type } = {}) =>
  Record({
    name,
    path,
    type
  })()

export const create_file_content = ({
  name,
  path,
  extension,
  content,
  type,
  is_entity = false,
  entity_properties = null,
  markdown_content = null,
  parsed_json = null
} = {}) =>
  Record({
    name,
    path,
    extension,
    content,
    type,
    is_entity,
    entity_properties,
    markdown_content,
    parsed_json
  })()

export const create_directory_state = ({
  directories = [],
  files = [],
  expanded_directories = new Set(),
  loading = false,
  error = null
} = {}) =>
  Record({
    directories,
    files,
    expanded_directories,
    loading,
    error
  })()

export const create_file_content_state = ({
  file_data = null,
  loading = false,
  error = null
} = {}) =>
  Record({
    file_data,
    loading,
    error
  })()
