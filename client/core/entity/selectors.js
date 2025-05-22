import { createSelector } from 'reselect'

/**
 * Selector for the entity state slice
 *
 * @param {Object} state - Application state
 * @returns {Object} Entity state
 */
export const get_entity_state = (state) => state.get('entity')

/**
 * Selector for a specific entity by base_relative_path
 *
 * @param {Object} state - Application state
 * @param {string} base_relative_path - Base relative path of the entity
 * @returns {Object|null} The entity if found, otherwise null
 */
export const get_entity_by_path = createSelector(
  [get_entity_state, (_, base_relative_path) => base_relative_path],
  (entities, base_relative_path) => entities.get(base_relative_path) || null
)
