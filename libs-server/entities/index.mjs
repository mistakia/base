import {
  create_entity,
  create_entity_relations,
  create_entity_tags
} from './create-entity.mjs'

import {
  fetch_entity_data,
  fetch_entity_tags,
  fetch_entity_relations,
  fetch_entity_type_data
} from './fetch-entity-data.mjs'

import {
  delete_entity_relations,
  delete_entity_tags,
  update_entity
} from './delete-entity.mjs'

// Re-export with clear namespaces
export {
  // Creation functions
  create_entity,
  create_entity_relations,
  create_entity_tags,

  // Fetching functions
  fetch_entity_data,
  fetch_entity_tags,
  fetch_entity_relations,
  fetch_entity_type_data,

  // Deletion functions
  delete_entity_relations,
  delete_entity_tags,

  // Update functions
  update_entity
}

// Default export
export default {
  create: {
    entity: create_entity,
    relations: create_entity_relations,
    tags: create_entity_tags
  },
  fetch: {
    entity: fetch_entity_data,
    tags: fetch_entity_tags,
    relations: fetch_entity_relations,
    type_data: fetch_entity_type_data
  },
  delete: {
    relations: delete_entity_relations,
    tags: delete_entity_tags
  },
  update: {
    entity: update_entity
  }
}
