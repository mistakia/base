/**
 * Database Module
 *
 * Provides access to database entities and storage adapters.
 */

export { get_storage_adapter } from './storage-adapters/index.mjs'
export { get_database_entity, list_database_entities } from './get-database-entity.mjs'
export { validate_record, validate_records } from './validate-record.mjs'
