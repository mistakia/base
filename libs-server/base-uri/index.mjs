/**
 * Base URI module exports
 */

export {
  create_system_uri,
  create_user_uri,
  parse_base_uri,
  is_valid_base_uri,
  resolve_base_uri,
  create_base_uri_from_path,
  default
} from './base-uri-utilities.mjs'

export {
  register_base_directories,
  register_user_base_directory,
  register_system_base_directory,
  get_system_base_directory,
  get_user_base_directory,
  get_registered_directories,
  clear_registered_directories,
  add_directory_cli_options,
  handle_cli_directory_registration
} from './base-directory-registry.mjs'

export {
  resolve_base_uri_from_registry,
  get_git_info_from_registry
} from './registry-utilities.mjs'
