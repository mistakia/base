import { generate_database_from_entity_file } from './to-database.mjs'
import { generate_entity_file_from_database } from './from-database.mjs'
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
} from './entity-type-handlers.mjs'

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
} from './entity-data-fetchers.mjs'

import { handle_relations, add_entity_relations } from './relation-handler.mjs'

// Main conversion functions
export {
  generate_database_from_entity_file,
  generate_entity_file_from_database
}

// Comprehensive entity type registry
export const entity_registry = {
  // Generic handlers
  generic: {
    handle: handle_generic_entity_type,
    fetch: fetch_generic_entity_data,
    table: null
  },
  // Specific entity types
  task: {
    handle: handle_task_type,
    fetch: fetch_task_data,
    table: 'tasks'
  },
  person: {
    handle: handle_person_type,
    fetch: fetch_person_data,
    table: 'persons'
  },
  organization: {
    handle: handle_organization_type,
    fetch: fetch_organization_data,
    table: 'organizations'
  },
  physical_item: {
    handle: handle_physical_item_type,
    fetch: fetch_physical_item_data,
    table: 'physical_items'
  },
  physical_location: {
    handle: handle_physical_location_type,
    fetch: fetch_physical_location_data,
    table: 'physical_locations'
  },
  digital_item: {
    handle: handle_digital_item_type,
    fetch: fetch_digital_item_data,
    table: 'digital_items'
  },
  guideline: {
    handle: handle_guideline_type,
    fetch: fetch_guideline_data,
    table: 'guidelines'
  },
  activity: {
    handle: handle_activity_type,
    fetch: fetch_activity_data,
    table: 'activities'
  },
  tag: {
    handle: handle_tag_type,
    fetch: fetch_tag_data,
    table: 'tags'
  },
  database: {
    handle: handle_database_type,
    fetch: fetch_database_data,
    table: 'database_tables'
  },
  database_item: {
    handle: handle_database_type,
    fetch: fetch_database_data,
    table: 'database_table_items'
  },
  database_view: {
    handle: handle_database_type,
    fetch: fetch_database_data,
    table: 'database_table_views'
  }
}

// Entity type handlers (for backward compatibility)
export const entity_type_handlers = Object.entries(entity_registry).reduce(
  (handlers, [type, config]) => ({
    ...handlers,
    [type]: config.handle
  }),
  { relations: handle_relations }
)

// Entity data fetchers (for backward compatibility)
export const entity_data_fetchers = Object.entries(entity_registry).reduce(
  (fetchers, [type, config]) => ({
    ...fetchers,
    [type]: config.fetch
  }),
  {}
)

// Relation handlers
export const relation_handlers = {
  handle: handle_relations,
  add: add_entity_relations
}

// Default export with organized structure
export default {
  to_database: generate_database_from_entity_file,
  from_database: generate_entity_file_from_database,
  entity_registry,
  relation_handlers
}
