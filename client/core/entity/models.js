import { Map } from 'immutable'

/**
 * Creates an immutable entity object from raw data
 *
 * @param {Object} entity - Raw entity data from the API
 * @returns {Map} Immutable entity object
 */
// TODO use a record instead
export function create_entity(entity) {
  return Map({
    base_relative_path: entity.base_relative_path,
    content: entity.content,
    type: entity.type,
    title: entity.title,
    ...entity
  })
}
