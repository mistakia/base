// Re-export filesystem functions
export {
  tag_exists_in_filesystem,
  read_tag_from_filesystem
} from './filesystem/index.mjs'

// Re-export git functions
export { tag_exists_in_git, read_tag_from_git } from './git/index.mjs'

// Re-export database functions
export { list_tags_from_database } from './database/index.mjs'

// Re-export constants
export {
  SYSTEM_TAG_DIR,
  USER_TAG_DIR,
  get_system_tag_directory,
  get_user_tag_directory,
  resolve_tag_path
} from './constants.mjs'
