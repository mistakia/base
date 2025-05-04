import write_entity_to_database from './write/write-entity-to-database.mjs'
import { write_entity_relations_to_database } from './write/write-entity-relations-to-database.mjs'
import { write_entity_tags_to_database } from './write/write-entity-tags-to-database.mjs'
import write_task_to_database from './write/write-task-to-database.mjs'
import write_activity_to_database from './write/write-activity-to-database.mjs'
import write_guideline_to_database from './write/write-guideline-to-database.mjs'

/**
 * Entity Database Module
 *
 * This module exports functions for writing entities to the database,
 * organized into three categories:
 *
 * 1. Base entity writer - Handles core entity properties shared across all types
 * 2. Entity type-specific writers - Handle properties specific to each entity type
 * 3. Relation handlers - Handle relationships between entities
 *
 * All type-specific writers are built on top of the base entity writer and
 * handle their own type-specific database operations.
 */
export {
  // Base entity writer
  write_entity_to_database,

  // Entity type-specific writers
  write_task_to_database,
  write_activity_to_database,
  write_guideline_to_database,

  // Relation handlers
  write_entity_relations_to_database,
  write_entity_tags_to_database
}

export default {
  write_entity_to_database,
  write_task_to_database,
  write_activity_to_database,
  write_guideline_to_database,
  write_entity_relations_to_database,
  write_entity_tags_to_database
}
