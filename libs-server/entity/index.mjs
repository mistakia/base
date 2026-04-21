// Re-export format functions
export {
  format_entity_properties_to_frontmatter,
  format_entity_from_file_content
} from './format/index.mjs'

// Re-export filesystem functions
export {
  write_entity_to_filesystem,
  read_entity_from_filesystem,
  delete_entity_from_filesystem
} from './filesystem/index.mjs'

// Re-export git functions
export {
  write_entity_to_git,
  read_entity_from_git,
  delete_entity_from_git
} from './git/index.mjs'

// Re-export relationship functions (base_uri-based)
export {
  validate_base_uri_exists,
  resolve_entity_relations,
  find_entities_with_relations_to,
  get_entity_relations,
  build_relation_index
} from './relationships/index.mjs'

// Export entity creation from external sources
export { create_entity_from_external_item } from './create-entity-from-external-item.mjs'
