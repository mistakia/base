// Re-export filesystem functions
export { read_tag_from_filesystem } from './filesystem/index.mjs'

// Re-export git functions
export { tag_exists_in_git, read_tag_from_git } from './git/index.mjs'

// Re-export database functions
export { list_tags_from_database } from './database/index.mjs'
