import { Record, Map, Set } from 'immutable'

export const create_resource = ({
  base_uri,
  type, // 'directory' | 'file' | 'entity'
  name,
  path,
  content = null,
  loading = false,
  error = null,
  last_fetched = null,
  // Directory-specific
  items = [],
  // Entity-specific
  metadata = null,
  raw_content = null,
  parsed_content = null,
  is_entity = false
} = {}) =>
  Record({
    base_uri,
    type,
    name,
    path,
    content,
    loading,
    error,
    last_fetched,
    items,
    metadata,
    raw_content,
    parsed_content,
    is_entity
  })()

export const create_resource_state = ({
  resources = new Map(), // keyed by base_uri
  expanded_directories = new Set(),
  loading = false,
  error = null
} = {}) =>
  Record({
    resources,
    expanded_directories,
    loading,
    error
  })()

export const create_resource_item = ({
  name,
  type, // 'directory' | 'file'
  size = null,
  modified = null,
  path = null
} = {}) =>
  Record({
    name,
    type,
    size,
    modified,
    path
  })()
