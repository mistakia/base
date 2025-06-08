import { createSelector } from 'reselect'

/**
 * Selector for the entity state slice
 *
 * @param {Object} state - Application state
 * @returns {Object} Entity state
 */
export const get_entity_state = (state) => state.get('entity')

/**
 * Selector for a specific entity by base_uri
 *
 * @param {Object} state - Application state
 * @param {string} base_uri - Base relative path of the entity
 * @returns {Object|null} The entity if found, otherwise null
 */
export const get_entity_by_path = createSelector(
  [get_entity_state, (_, base_uri) => base_uri],
  (entities, base_uri) => entities.get(base_uri) || null
)
