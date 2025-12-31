// Re-export filesystem functions
export {
  read_tag_from_filesystem,
  list_tags_from_filesystem,
  resolve_tag_shorthand,
  add_tags_to_entity,
  remove_tags_from_entity,
  process_tag_batch
} from './filesystem/index.mjs'

// Re-export git functions
export { read_tag_from_git } from './git/index.mjs'
