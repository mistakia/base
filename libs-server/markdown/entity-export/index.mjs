import {
  export_markdown_entity,
  batch_export_markdown_entities
} from './export-markdown-entity.mjs'

import {
  add_entity_relations,
  add_entity_tags,
  add_entity_observations,
  add_all_entity_relationships
} from './relation-formatter.mjs'

import {
  fetch_generic_entity_data,
  fetch_task_data,
  fetch_person_data,
  fetch_organization_data,
  fetch_physical_item_data,
  fetch_physical_location_data,
  fetch_digital_item_data,
  fetch_guideline_data,
  fetch_activity_data,
  fetch_tag_data,
  fetch_database_data
} from './entity-fetchers.mjs'

// Main export functions
export { export_markdown_entity, batch_export_markdown_entities }

// Entity data fetchers
export const entity_fetchers = {
  generic: fetch_generic_entity_data,
  task: fetch_task_data,
  person: fetch_person_data,
  organization: fetch_organization_data,
  physical_item: fetch_physical_item_data,
  physical_location: fetch_physical_location_data,
  digital_item: fetch_digital_item_data,
  guideline: fetch_guideline_data,
  activity: fetch_activity_data,
  tag: fetch_tag_data,
  database: fetch_database_data
}

// Relation formatters
export const relation_formatters = {
  add_relations: add_entity_relations,
  add_tags: add_entity_tags,
  add_observations: add_entity_observations,
  add_all: add_all_entity_relationships
}

// Default export with organized structure
export default {
  export: export_markdown_entity,
  batch_export: batch_export_markdown_entities,
  entity_fetchers,
  relation_formatters
}
