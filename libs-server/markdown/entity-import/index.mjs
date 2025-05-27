import { import_markdown_entity } from './import-markdown-entity.mjs'

import {
  process_entity_relations,
  process_entity_tags,
  process_entity_observations
} from './relation-handler.mjs'

import {
  handle_generic_entity_type,
  handle_task_type,
  handle_person_type,
  handle_organization_type,
  handle_physical_item_type,
  handle_physical_location_type,
  handle_digital_item_type,
  handle_guideline_type,
  handle_activity_type,
  handle_tag_type,
  handle_database_type
} from './entity-handlers.mjs'

// Main export function
export { import_markdown_entity }

// Entity type handlers
export const entity_handlers = {
  generic: handle_generic_entity_type,
  task: handle_task_type,
  person: handle_person_type,
  organization: handle_organization_type,
  physical_item: handle_physical_item_type,
  physical_location: handle_physical_location_type,
  digital_item: handle_digital_item_type,
  guideline: handle_guideline_type,
  activity: handle_activity_type,
  tag: handle_tag_type,
  database: handle_database_type
}

// Relation handlers
export const relation_handlers = {
  process_relations: process_entity_relations,
  process_tags: process_entity_tags,
  process_observations: process_entity_observations
}

// Default export with organized structure
export default {
  import: import_markdown_entity,
  entity_handlers,
  relation_handlers
}
